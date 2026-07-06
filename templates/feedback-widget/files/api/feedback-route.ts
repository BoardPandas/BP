// Destination: src/app/api/feedback/route.ts
// TIER 1 core route. TIER 2/3 blocks are marked and safe to delete.
import { NextResponse } from "next/server";
import { uploadGithubAttachment } from "@/lib/feedback/github-attachment";
import { buildFeedbackGithubIssue } from "@/lib/feedback/github-issue";
// TIER 4 (Slack): delete this import if you skip the Slack channel post.
import { buildFeedbackSlackMessage } from "@/lib/feedback/slack-message";
import {
  apiError,
  apiSuccess,
  checkRateLimit,
  log,
  requireUser,
  track,
} from "@/lib/feedback/server-adapter";
// TIER 2 (screenshots): delete this import if you skip screenshot support.
import { getDownloadUrl, getObjectBytes } from "@/lib/feedback/storage";
import { feedbackSubmissionSchema } from "@/lib/validations/feedback";

const FEEDBACK_RATE_LIMIT = {
  windowMs: 30_000,
  maxRequests: 1,
  keyPrefix: "rl:feedback",
};

/** GitHub issue images stay readable for a week before the presigned URL expires. */
const SCREENSHOT_DOWNLOAD_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function POST(req: Request) {
  const userOrResponse = await requireUser(req);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;
  const userId = user.id;

  const githubToken = process.env.GITHUB_FEEDBACK_TOKEN;
  const githubRepo = process.env.GITHUB_FEEDBACK_REPO;
  // One correlation id ties the screenshot, the diagnostics JSON, and the log
  // line for this submission together.
  const correlationId = `${userId.slice(-8)}-${Date.now().toString(36)}`;

  const limited = await checkRateLimit(userId, FEEDBACK_RATE_LIMIT);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = feedbackSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Invalid feedback submission", 400);
  }
  const body = parsed.data;

  // ── TIER 2: screenshot handling ─────────────────────────────────────────
  // Reject keys that don't belong to this user — prevents a client from
  // attaching a screenshot uploaded by a different account.
  const screenshotKey = body.screenshotKey ?? null;
  if (screenshotKey && !screenshotKey.startsWith(`feedback/${userId}/`)) {
    return apiError("Invalid screenshot reference", 400);
  }

  let screenshot: { url: string; expiresAt: Date | null } | null = null;
  let screenshotGithubPath: string | null = null;
  if (screenshotKey) {
    // Pull bytes back from object storage so we can commit them into the repo.
    let bytes: Uint8Array | null = null;
    let storedContentType: string | undefined;
    try {
      const obj = await getObjectBytes(screenshotKey);
      bytes = obj.bytes;
      storedContentType = obj.contentType;
    } catch (err) {
      log(
        "warn",
        { correlationId, screenshotKey, err: err instanceof Error ? err.message : String(err) },
        "Failed to fetch screenshot bytes from storage — falling back to presigned URL",
      );
    }

    if (bytes && githubToken && githubRepo) {
      try {
        const filenameFromKey = screenshotKey.split("/").pop() ?? "screenshot";
        const attachment = await uploadGithubAttachment({
          token: githubToken,
          repo: githubRepo,
          bytes,
          filename: filenameFromKey,
          contentType: storedContentType ?? "application/octet-stream",
          category: body.category,
          correlationId,
        });
        screenshot = { url: attachment.url, expiresAt: null };
        screenshotGithubPath = attachment.path;
      } catch (err) {
        log(
          "warn",
          { correlationId, screenshotKey, err: err instanceof Error ? err.message : String(err) },
          "Failed to upload screenshot to GitHub — falling back to storage presigned URL",
        );
      }
    }

    // Fallback: if GitHub commit failed (or token not configured), embed a presigned URL.
    if (!screenshot) {
      try {
        const url = await getDownloadUrl(screenshotKey, SCREENSHOT_DOWNLOAD_TTL_SECONDS);
        screenshot = {
          url,
          expiresAt: new Date(Date.now() + SCREENSHOT_DOWNLOAD_TTL_SECONDS * 1000),
        };
      } catch (err) {
        log(
          "warn",
          { correlationId, screenshotKey, err: err instanceof Error ? err.message : String(err) },
          "Failed to generate screenshot download URL — continuing without attachment",
        );
      }
    }
  }
  // ── end TIER 2 ──────────────────────────────────────────────────────────

  // ── TIER 3: diagnostics artifact ────────────────────────────────────────
  // Commit the full behind-the-scenes diagnostics as a JSON artifact in the
  // repo and link it from the issue body. The body itself carries only a
  // summarized view (see buildFeedbackGithubIssue) to stay under GitHub's size
  // cap. The payload is already redacted + bounded client-side and re-validated
  // by the Zod schema above.
  let diagnosticsUrl: string | null = null;
  let diagnosticsGithubPath: string | null = null;
  if (body.diagnostics && githubToken && githubRepo) {
    try {
      const json = JSON.stringify(body.diagnostics, null, 2);
      const bytes = new TextEncoder().encode(json);
      const attachment = await uploadGithubAttachment({
        token: githubToken,
        repo: githubRepo,
        bytes,
        filename: `diagnostics-${correlationId}.json`,
        contentType: "application/json",
        category: "diagnostics",
        correlationId,
        label: "diagnostics",
      });
      diagnosticsUrl = attachment.url;
      diagnosticsGithubPath = attachment.path;
    } catch (err) {
      log(
        "warn",
        { correlationId, err: err instanceof Error ? err.message : String(err) },
        "Failed to commit diagnostics JSON to GitHub — continuing without artifact",
      );
    }
  }
  // ── end TIER 3 ──────────────────────────────────────────────────────────

  // ADAPT (optional): enrich the issue with app-specific tenant context.
  // Example (multi-tenant SaaS): look up the user's org/workspace name and push
  // rows like { label: "Org", value: `Acme (\`org_123\`)` }.
  const context: Array<{ label: string; value: string }> = [];

  const githubIssue = buildFeedbackGithubIssue({
    category: body.category,
    severity: body.severity,
    message: body.message,
    pageUrl: body.pageUrl,
    pagePath: body.pagePath,
    userAgent: body.userAgent,
    viewport: body.viewport,
    language: body.language,
    timezone: body.timezone,
    user: {
      id: userId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    context,
    screenshot,
    modalTitle: body.modalTitle ?? null,
    diagnostics: body.diagnostics ?? null,
    diagnosticsUrl,
  });

  let issueCreated = false;
  let issueNumber: number | null = null;

  if (githubToken && githubRepo) {
    try {
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${githubToken}`,
          "Content-Type": "application/json",
          // ADAPT: identify your app.
          "User-Agent": "app-feedback",
        },
        body: JSON.stringify({
          title: githubIssue.title,
          body: githubIssue.body,
          labels: githubIssue.labels,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        log(
          "warn",
          { correlationId, status: res.status, category: body.category, err: errBody.slice(0, 500) },
          "GitHub feedback issue returned non-2xx",
        );
      } else {
        const json = (await res.json().catch(() => null)) as { number?: number } | null;
        issueCreated = true;
        issueNumber = json?.number ?? null;
      }
    } catch (err) {
      log(
        "error",
        { correlationId, category: body.category, err: err instanceof Error ? err.message : String(err) },
        "GitHub feedback issue post failed",
      );
    }
  } else {
    log(
      "warn",
      { correlationId, category: body.category },
      "GITHUB_FEEDBACK_TOKEN/REPO not configured — feedback recorded but no issue opened",
    );
  }

  // ── TIER 4: Slack channel post ──────────────────────────────────────────
  // Post the submission to a single team channel via an incoming webhook.
  // Best-effort and fail-open, exactly like the GitHub calls above: a webhook
  // outage or missing config never fails the submission. Delete this block and
  // the slack-message import if you skip Slack.
  const slackWebhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  let slackSent = false;
  if (slackWebhookUrl) {
    try {
      const slackPayload = buildFeedbackSlackMessage({
        category: body.category,
        severity: body.severity,
        message: body.message,
        pageUrl: body.pageUrl,
        pagePath: body.pagePath,
        userAgent: body.userAgent,
        viewport: body.viewport,
        language: body.language,
        timezone: body.timezone,
        user: { id: userId, name: user.name, email: user.email, role: user.role },
        context, // same tenant rows built for the GitHub issue
        issue: issueNumber && githubRepo ? { number: issueNumber, repo: githubRepo } : null,
      });
      const res = await fetch(slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      });
      slackSent = res.ok;
      if (!res.ok) {
        log(
          "warn",
          { correlationId, status: res.status, category: body.category },
          "Slack feedback webhook returned non-2xx",
        );
      }
    } catch (err) {
      log(
        "error",
        { correlationId, category: body.category, err: err instanceof Error ? err.message : String(err) },
        "Slack feedback webhook post failed",
      );
    }
  } else {
    log(
      "warn",
      { correlationId, category: body.category },
      "SLACK_FEEDBACK_WEBHOOK_URL not configured — feedback recorded but not posted to Slack",
    );
  }
  // ── end TIER 4 ──────────────────────────────────────────────────────────

  log(
    "info",
    {
      action: "feedback.submitted",
      correlationId,
      userId,
      category: body.category,
      severity: body.severity,
      pagePath: body.pagePath,
      modalTitle: body.modalTitle ?? null,
      surface: body.modalTitle ? "modal" : "page",
      hasScreenshot: !!screenshotKey,
      screenshotKey,
      screenshotGithubPath,
      screenshotHosting: screenshot ? (screenshot.expiresAt ? "storage" : "github") : null,
      hasDiagnostics: !!body.diagnostics,
      diagnosticsGithubPath,
      githubIssueCreated: issueCreated,
      githubIssueNumber: issueNumber,
      slackSent,
    },
    "Feedback submitted",
  );

  track("feedback_submitted", userId, {
    category: body.category,
    severity: body.severity,
    pagePath: body.pagePath,
    surface: body.modalTitle ? "modal" : "page",
    hasScreenshot: !!screenshotKey,
    hasDiagnostics: !!body.diagnostics,
    githubIssueCreated: issueCreated,
    githubIssueNumber: issueNumber,
  });

  return apiSuccess({ ok: true, issueNumber });
}
