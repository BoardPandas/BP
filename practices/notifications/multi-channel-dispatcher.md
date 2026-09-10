---
concern: notifications
tags: [notifications, fan-out, email, slack, in-app, failure-isolation]
priority: foundational
tech: [typescript, nodejs]
applies-to: [typescript, nodejs]
---
# Multi-channel notification dispatcher with per-channel failure isolation

## CONTEXT

SaaS apps usually need to fan a single event (invoice processed, account locked, etc.) across multiple channels: transactional email, in-app feed, Slack webhook, sometimes SMS. Without a single dispatcher, this code spreads across the codebase: each caller writes its own try/catch, decides which channels to use, and handles failures inconsistently. A Slack outage taking down a worker is a recurring failure mode in this layout.

A dispatcher centralizes the fan-out, isolates each channel so one failure does not block the others, and returns a structured result so the caller can log or react. Channels are configured per-tenant (DB column or JSON), so adding a tenant-specific Slack hook does not need code changes.

## PATTERN

```typescript
// src/lib/notifications/dispatcher.ts
type Channels = {
  email?: boolean;
  inApp?: boolean;
  slack?: { webhookUrl: string } | null;
} | null;

type Recipient = { userId: string; email: string; name: string | null };

type Content = {
  subject: string;
  html: string;
  slackText?: string; // falls back to subject when omitted
};

type DispatchResult = {
  email: { attempted: number; sent: number };
  inApp: { recorded: number };
  slack: { attempted: boolean; sent: boolean };
};

export async function dispatchPartnerNotification(args: {
  partnerId: string;
  type: string;
  channels: Channels;
  recipients: Recipient[];
  content: Content;
}): Promise<DispatchResult> {
  // null/undefined channels => everything except Slack on by default.
  const ch = args.channels ?? { email: true, inApp: true };
  const result: DispatchResult = {
    email: { attempted: 0, sent: 0 },
    inApp: { recorded: 0 },
    slack: { attempted: false, sent: false },
  };

  // Email -- one try/catch per recipient so one bad address does not poison the run.
  if (ch.email !== false) {
    for (const r of args.recipients) {
      result.email.attempted++;
      try {
        await sendEmail({
          to: r.email,
          subject: args.content.subject,
          html: args.content.html,
          partnerId: args.partnerId,
        });
        result.email.sent++;
      } catch (err) {
        log.warn({ err, recipient: r.userId }, "email channel failed");
      }
    }
  }

  // In-app -- a single bulk insert; log and continue on DB error.
  if (ch.inApp !== false && args.recipients.length) {
    try {
      await db.insert(notifications).values(
        args.recipients.map((r) => ({
          userId: r.userId,
          partnerId: args.partnerId,
          type: args.type,
          payload: args.content,
        })),
      );
      result.inApp.recorded = args.recipients.length;
    } catch (err) {
      log.warn({ err }, "in-app channel failed");
    }
  }

  // Slack -- one POST regardless of recipient count.
  if (ch.slack?.webhookUrl) {
    result.slack.attempted = true;
    try {
      const res = await fetch(ch.slack.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: args.content.slackText ?? args.content.subject }),
      });
      result.slack.sent = res.ok;
    } catch (err) {
      log.warn({ err }, "slack channel failed");
    }
  }

  return result;
}
```

## WHY

- One channel's outage cannot take the others down. Slack returning 500 still lets email and in-app succeed.
- Per-tenant configuration lives in the channels arg, so the dispatcher is the only code that needs to know all the channels exist. Callers say what to send, not how.
- The structured return surface (attempted vs sent per channel) makes it trivial to log dispatch outcomes, build dashboards, or write tests that assert "Slack was attempted but not sent" without mocking implementation details.
- Treating null/undefined channels as a sensible default (typically email + in-app on, Slack off) means new tenants work without explicit configuration.

## WHEN TO APPLY

- You have more than one notification channel and the same event fans out to multiple of them.
- Channel choices are per-tenant or per-event-type (not a single global config).
- One channel can fail independently of the others (most do -- Resend, Slack webhooks, in-app DB writes are unrelated dependencies).

## CHECK

How to verify a repo already follows this:
- [ ] Each channel is wrapped in its own try/catch, so one channel failing cannot abort the others
- [ ] Per-recipient sends are guarded **inside** the loop, not by one try/catch around it
- [ ] The dispatcher returns per-channel attempted/sent counts rather than a bare boolean
- [ ] A null/undefined channel config resolves to an explicit documented default
- [ ] Caught failures are logged with channel and recipient, and appear in the result rather than being swallowed

## IMPLEMENT

1. Define an explicit `Channels` type and resolve null/undefined to your intended default.
2. Give every channel its own try/catch; for per-recipient channels put the guard inside the loop.
3. Accumulate a structured result (attempted vs sent, per channel) and return it to the caller.
4. Log each caught failure with channel and recipient, and add a test asserting that one failing channel still delivers the rest.

## NOTES

- Test with three independent mocks (email send, DB insert, fetch) and assert the structured DispatchResult, not the call counts. The result type is your contract.
- The dispatcher should not throw on partial failures -- callers expect a result, not an exception. Throw only on programmer error (missing required content fields).
- Keep this dispatcher pure: no queue, no retry, no HTML templating. Wrap it in a job processor if you need retries; render templates upstream.
