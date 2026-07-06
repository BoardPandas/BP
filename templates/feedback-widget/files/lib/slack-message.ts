// Destination: src/lib/feedback/slack-message.ts
// Portable. TIER 4 (Slack). App-specific tenant fields flow in via the same
// generic `context` rows used by github-issue.ts, so this file needs no
// project-specific edits.
//
// Builds a Slack Block Kit payload for a feedback submission, posted to a
// single team channel via an incoming webhook (SLACK_FEEDBACK_WEBHOOK_URL).
// Independent of tier 1's GitHub issue: if an issue was created, it is linked;
// if not, the message still stands on its own.
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
  type FeedbackSeverity,
} from "@/lib/validations/feedback";

const CATEGORY_EMOJI: Record<FeedbackCategory, string> = {
  bug: ":bug:",
  feature_request: ":bulb:",
  data_issue: ":warning:",
  ui_ux: ":art:",
  billing: ":credit_card:",
  performance: ":zap:",
  account_access: ":lock:",
  other: ":speech_balloon:",
};

const SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export type FeedbackSlackInput = {
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  message: string;
  pageUrl: string;
  pagePath: string;
  userAgent: string;
  viewport: { w: number; h: number; dpr: number };
  language: string;
  timezone: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
  };
  /**
   * App-specific tenant context rendered as extra field rows — the SAME array
   * passed to buildFeedbackGithubIssue (e.g. org, workspace, plan). Keep values
   * short. Slack section blocks allow at most 10 fields, so this is capped.
   */
  context?: Array<{ label: string; value: string }>;
  /**
   * The created GitHub issue (tier 1), when one was opened. Rendered as a link.
   * Pass null if you run Slack without the GitHub issue tier.
   */
  issue?: { number: number; repo: string } | null;
};

/**
 * Slack `mrkdwn` parses `<...|...>` as a link and `&` as an entity.
 * Escape user-supplied substrings to prevent malformed blocks.
 */
export function escapeSlackMrkdwn(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function buildFeedbackSlackMessage(input: FeedbackSlackInput) {
  const categoryLabel = FEEDBACK_CATEGORY_LABELS[input.category];
  const emoji = CATEGORY_EMOJI[input.category];
  const severity = SEVERITY_LABEL[input.severity];

  const userName = input.user.name?.trim() || input.user.email;

  const safeMessage = escapeSlackMrkdwn(input.message);
  const safeUserName = escapeSlackMrkdwn(userName);
  const safeEmail = escapeSlackMrkdwn(input.user.email);
  const safePagePath = escapeSlackMrkdwn(input.pagePath);
  const safeUA = escapeSlackMrkdwn(truncate(input.userAgent, 200));

  const text = truncate(
    `[${input.severity.toUpperCase()}] ${categoryLabel} from ${userName}`,
    200,
  );

  // Slack section blocks allow at most 10 fields; reserve 4 for the fixed rows
  // (+1 optional issue) and spend the rest on tenant context.
  const fields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*Severity:*\n${severity}` },
    { type: "mrkdwn", text: `*Category:*\n${categoryLabel}` },
    { type: "mrkdwn", text: `*User:*\n${safeUserName} <${safeEmail}>` },
    { type: "mrkdwn", text: `*Role:*\n${escapeSlackMrkdwn(input.user.role ?? "user")}` },
  ];
  for (const row of (input.context ?? []).slice(0, 5)) {
    fields.push({
      type: "mrkdwn",
      text: `*${escapeSlackMrkdwn(row.label)}:*\n${escapeSlackMrkdwn(row.value)}`,
    });
  }
  if (input.issue) {
    const issueUrl = `https://github.com/${input.issue.repo}/issues/${input.issue.number}`;
    fields.push({ type: "mrkdwn", text: `*Issue:*\n<${issueUrl}|#${input.issue.number}>` });
  }

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${categoryLabel}`, emoji: true },
    },
    { type: "section", fields },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Message:*\n${truncate(safeMessage, 1500)}` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `<${input.pageUrl}|${safePagePath}>` },
        {
          type: "mrkdwn",
          text: `${input.viewport.w}×${input.viewport.h} @${input.viewport.dpr}x · ${escapeSlackMrkdwn(input.language)} · ${escapeSlackMrkdwn(input.timezone)}`,
        },
        { type: "mrkdwn", text: safeUA },
      ],
    },
  ];

  return { text, blocks };
}
