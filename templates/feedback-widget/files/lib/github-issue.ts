// Destination: src/lib/feedback/github-issue.ts
// Portable. App-specific tenant fields flow in via the generic `context` rows.
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
  type FeedbackDiagnostics,
  type FeedbackSeverity,
} from "@/lib/validations/feedback";

export type FeedbackGithubInput = {
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
   * ADAPT (optional): app-specific context rendered as extra bullet rows under
   * "Submitted by" — e.g. org, workspace, tenant, plan. Keep values short.
   */
  context?: Array<{ label: string; value: string }>;
  /**
   * User-attached screenshots, in the order the user added them. All are
   * rendered in a single "### Screenshots" section.
   *
   * For each entry:
   * - When the image was committed to the GitHub repo via the Contents API,
   *   `expiresAt` is `null` and the URL is a permanent github.com blob link.
   *   If the feedback repo is private, it renders as a clickable link rather
   *   than an inline image (GitHub's image proxy cannot authenticate to it).
   * - When we fall back to an object-storage presigned URL, `expiresAt` is set;
   *   that URL is publicly fetchable for its TTL so it embeds inline, with a
   *   note for triagers warning that the link will rot.
   */
  screenshots?: Array<{
    url: string;
    expiresAt: Date | null;
  }> | null;
  /**
   * @deprecated Single-screenshot field kept for back-compat with callers built
   * before multi-screenshot support. Merged into `screenshots` when present.
   */
  screenshot?: {
    url: string;
    expiresAt: Date | null;
  } | null;
  /**
   * Title of the dialog the user was inside when they triggered feedback.
   * `null` for page-level (header button) submissions.
   */
  modalTitle?: string | null;
  /**
   * Behind-the-scenes browser diagnostics captured at submit time. Rendered as
   * a summarized section; the full JSON is committed to the repo and linked via
   * `diagnosticsUrl`.
   */
  diagnostics?: FeedbackDiagnostics | null;
  /** Permanent github.com blob URL for the committed full diagnostics JSON. */
  diagnosticsUrl?: string | null;
};

// Keep in sync with feedbackCategories in validations and the labels created
// in the feedback repo (see HANDOFF.md → GitHub setup).
const CATEGORY_LABEL_SLUG: Record<FeedbackCategory, string> = {
  bug: "bug",
  feature_request: "enhancement",
  data_issue: "data-issue",
  ui_ux: "ui-ux",
  billing: "billing",
  performance: "performance",
  account_access: "account-access",
  other: "other",
};

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function firstLine(value: string, max: number): string {
  const line = value.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return truncate(line, max);
}

function isoOrNull(ts: number): string {
  try {
    return new Date(ts).toISOString();
  } catch {
    return "unknown";
  }
}

/**
 * Render the optional behind-the-scenes diagnostics as a compact, triager-
 * friendly section. Everything is bounded so the issue body stays well under
 * GitHub's 65k limit; the full detail lives in the linked JSON artifact.
 */
function buildDiagnosticsSection(
  diagnostics: FeedbackDiagnostics | null | undefined,
  diagnosticsUrl: string | null | undefined,
): string[] {
  if (!diagnostics) return [];
  const d = diagnostics;
  const lines: string[] = ["### Diagnostics", ""];

  const meta: string[] = [];
  if (d.appVersion) meta.push(`build \`${d.appVersion}\``);
  meta.push(`captured ${isoOrNull(d.capturedAt)}`);
  lines.push(`- **Snapshot:** ${meta.join(" · ")}`);

  const r = d.runtime;
  const net: string[] = [r.online ? "online" : "OFFLINE"];
  if (r.connection) {
    const detail = [
      r.connection,
      r.downlinkMbps != null ? `${r.downlinkMbps}Mbps` : null,
      r.rttMs != null ? `${r.rttMs}ms rtt` : null,
    ]
      .filter(Boolean)
      .join(", ");
    net.push(detail);
  }
  lines.push(`- **Network:** ${net.join(" · ")}`);

  const env: string[] = [];
  if (r.jsHeapUsedMb != null) {
    env.push(`heap ${r.jsHeapUsedMb}${r.jsHeapLimitMb != null ? `/${r.jsHeapLimitMb}` : ""}MB`);
  }
  if (r.deviceMemoryGb != null) env.push(`${r.deviceMemoryGb}GB RAM`);
  if (r.hardwareConcurrency != null) env.push(`${r.hardwareConcurrency} cores`);
  if (r.localStorageKeys != null) {
    env.push(
      `localStorage ${r.localStorageKeys} keys${r.localStorageApproxBytes != null ? ` (~${Math.round(r.localStorageApproxBytes / 1024)}KB)` : ""}`,
    );
  }
  if (!r.cookiesEnabled) env.push("cookies DISABLED");
  if (env.length) lines.push(`- **Runtime:** ${env.join(" · ")}`);

  const s = d.session;
  if (s.replayUrl) lines.push(`- **Session replay:** [open replay](${s.replayUrl})`);
  const ids: string[] = [];
  if (s.sessionId) ids.push(`session \`${s.sessionId}\``);
  if (s.distinctId) ids.push(`distinct \`${s.distinctId}\``);
  if (ids.length) lines.push(`- **Analytics:** ${ids.join(" · ")}`);
  if (s.activeFlags.length) {
    lines.push(
      `- **Active flags:** ${s.activeFlags
        .slice(0, 15)
        .map((f) => `\`${f}\``)
        .join(", ")}`,
    );
  }
  lines.push("");

  if (d.reactError) {
    lines.push(
      "<details><summary>React error (render crash)</summary>",
      "",
      "```",
      truncate(d.reactError.message, 1000),
      "",
      truncate(d.reactError.stack ?? "(no stack)", 4000),
      "```",
      "</details>",
      "",
    );
  }

  const errors = d.console.filter((c) => c.level === "error" || c.level === "warn").slice(-8);
  if (errors.length) {
    lines.push(
      "<details><summary>Recent console errors/warnings</summary>",
      "",
      "```",
      ...errors.map((c) => `[${c.level}] ${truncate(c.message, 400)}`),
      "```",
      "</details>",
      "",
    );
  }

  const failed = d.network.filter((n) => !n.ok || (n.status ?? 0) >= 400).slice(-10);
  if (failed.length) {
    lines.push(
      "<details><summary>Recent failed requests</summary>",
      "",
      "```",
      ...failed.map((n) => {
        const status = n.status ?? "ERR";
        const rid = n.requestId ? ` req=${n.requestId}` : "";
        const dur = n.durationMs != null ? ` ${n.durationMs}ms` : "";
        return `${status} ${n.method} ${truncate(n.url, 200)}${dur}${rid}`;
      }),
      "```",
      "</details>",
      "",
    );
  }

  const crumbs = d.breadcrumbs.slice(-12);
  if (crumbs.length) {
    lines.push(
      "<details><summary>Breadcrumbs (recent actions)</summary>",
      "",
      "```",
      ...crumbs.map(
        (b) => `${b.type === "navigation" ? "→ nav" : "· click"} ${truncate(b.label, 160)}`,
      ),
      "```",
      "</details>",
      "",
    );
  }

  if (diagnosticsUrl) {
    lines.push(`[Full diagnostics JSON](${diagnosticsUrl})`, "");
  }

  return lines;
}

export function buildFeedbackGithubIssue(input: FeedbackGithubInput): {
  title: string;
  body: string;
  labels: string[];
} {
  const categoryLabel = FEEDBACK_CATEGORY_LABELS[input.category];
  const userName = input.user.name?.trim() || input.user.email;

  const summary = firstLine(input.message, 80) || categoryLabel;
  const modalPrefix = input.modalTitle ? `[${truncate(input.modalTitle, 60)}] ` : "";
  const title = truncate(`[feedback/${input.category}] ${modalPrefix}${summary}`, 200);

  // Merge the multi-screenshot array with the deprecated single field.
  const screenshots = [
    ...(input.screenshots ?? []),
    ...(input.screenshot ? [input.screenshot] : []),
  ];

  const screenshotSection =
    screenshots.length > 0
      ? [
          `### Screenshot${screenshots.length > 1 ? "s" : ""}`,
          "",
          ...screenshots.flatMap((shot, i) => {
            const heading = screenshots.length > 1 ? `**${i + 1}.** ` : "";
            if (shot.expiresAt) {
              // Presigned URL: publicly fetchable for its TTL, so it embeds
              // inline. Warn triagers that the link will stop resolving.
              return [
                `${heading}![Screenshot ${i + 1}](${shot.url})`,
                "",
                `_Link expires ${shot.expiresAt.toISOString()} (object-storage presigned URL). After expiry, retrieve via the storage admin._`,
                "",
              ];
            }
            // GitHub-hosted in a private repo: a blob link, not an inline image.
            // The image proxy cannot authenticate to a private repo, but the
            // link resolves permanently for signed-in repo members.
            return [`${heading}[View screenshot ${i + 1}](${shot.url})`, ""];
          }),
        ]
      : [];

  const contextRows = (input.context ?? []).map((c) => `- **${c.label}:** ${c.value}`);

  const body = [
    `## ${categoryLabel} (${input.severity.toUpperCase()})`,
    "",
    "### Message",
    "",
    truncate(input.message, 6000),
    "",
    ...screenshotSection,
    "### Submitted by",
    "",
    `- **User:** ${userName} (\`${input.user.email}\`)`,
    `- **Role:** ${input.user.role ?? "user"}`,
    `- **User ID:** \`${input.user.id}\``,
    ...contextRows,
    "",
    "### Context",
    "",
    `- **Page:** [${input.pagePath}](${input.pageUrl})`,
    ...(input.modalTitle ? [`- **Modal:** ${input.modalTitle}`] : []),
    `- **Viewport:** ${input.viewport.w}×${input.viewport.h} @${input.viewport.dpr}x`,
    `- **Locale:** ${input.language} · ${input.timezone}`,
    `- **User agent:** \`${truncate(input.userAgent, 400)}\``,
    "",
    ...buildDiagnosticsSection(input.diagnostics, input.diagnosticsUrl),
    "_Submitted via in-app feedback._",
  ].join("\n");

  const labels = [
    "feedback",
    `severity:${input.severity}`,
    CATEGORY_LABEL_SLUG[input.category],
    `surface:${input.modalTitle ? "modal" : "page"}`,
  ];

  return { title, body, labels };
}
