// Destination: src/lib/validations/feedback.ts
// Portable — no app-specific dependencies.
// ADAPT: if your project is on zod v3, change the import to `from "zod"`.
import { z } from "zod/v4";

export const feedbackCategories = [
  "bug",
  "feature_request",
  "data_issue",
  "ui_ux",
  "billing",
  "performance",
  "account_access",
  "other",
] as const;
// ADAPT: trim or extend categories to fit the product. Keep the slugs in sync
// with CATEGORY_LABEL_SLUG in github-issue.ts and the GitHub labels you create.

export type FeedbackCategory = (typeof feedbackCategories)[number];

export const feedbackSeverities = ["low", "medium", "high"] as const;
export type FeedbackSeverity = (typeof feedbackSeverities)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  feature_request: "Feature request",
  data_issue: "Data issue",
  ui_ux: "UI / UX",
  billing: "Billing",
  performance: "Performance",
  account_access: "Account / access",
  other: "Other",
};

/**
 * Allowed MIME types for the optional screenshot attachment.
 * Kept narrow to limit GitHub-issue display surprises.
 */
export const feedbackScreenshotMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type FeedbackScreenshotMimeType = (typeof feedbackScreenshotMimeTypes)[number];

/** 10 MB. Object storage handles bigger, but this protects bandwidth and the GitHub issue UX. */
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Max screenshots per submission. The presign route sizes its rate limit off
 * this (see screenshot-presign-route.ts) so a full attachment set plus a retry
 * fits in one window. Keep them in sync.
 */
export const FEEDBACK_SCREENSHOT_MAX_COUNT = 4;

export const feedbackScreenshotPresignSchema = z
  .object({
    contentType: z.enum(feedbackScreenshotMimeTypes),
    fileSize: z.number().int().positive().max(FEEDBACK_SCREENSHOT_MAX_BYTES),
  })
  .strict();

export type FeedbackScreenshotPresignRequest = z.infer<typeof feedbackScreenshotPresignSchema>;

/**
 * Behind-the-scenes browser diagnostics captured by `telemetry-client.ts` and
 * attached to the feedback submission. All free-text is redacted client-side
 * before it reaches here; these bounds are a second line of defence against an
 * oversized or malicious payload. Objects are intentionally non-strict so a
 * rolling deploy where the client and server disagree on fields degrades
 * gracefully (unknown keys are stripped) rather than failing the whole submit.
 */
const diagnosticsConsoleEntry = z.object({
  level: z.enum(["log", "info", "warn", "error", "debug"]),
  message: z.string().max(2000),
  ts: z.number(),
});

const diagnosticsNetworkEntry = z.object({
  method: z.string().max(10),
  url: z.string().max(1024),
  status: z.number().int().nullable(),
  ok: z.boolean(),
  durationMs: z.number().nullable(),
  requestId: z.string().max(128).nullable(),
  ts: z.number(),
  error: z.string().max(500).nullable().optional(),
});

const diagnosticsBreadcrumb = z.object({
  type: z.enum(["click", "navigation"]),
  label: z.string().max(300),
  ts: z.number(),
});

export const feedbackDiagnosticsSchema = z.object({
  appVersion: z.string().max(64).nullable(),
  capturedAt: z.number(),
  console: z.array(diagnosticsConsoleEntry).max(120),
  network: z.array(diagnosticsNetworkEntry).max(100),
  breadcrumbs: z.array(diagnosticsBreadcrumb).max(60),
  reactError: z
    .object({
      message: z.string().max(2000),
      stack: z.string().max(8000).nullable(),
      digest: z.string().max(128).nullable(),
      ts: z.number(),
    })
    .nullable(),
  session: z.object({
    distinctId: z.string().max(128).nullable(),
    sessionId: z.string().max(128).nullable(),
    replayUrl: z.string().max(2048).nullable(),
    activeFlags: z.array(z.string().max(128)).max(120),
  }),
  runtime: z.object({
    online: z.boolean(),
    cookiesEnabled: z.boolean(),
    connection: z.string().max(64).nullable(),
    downlinkMbps: z.number().nullable(),
    rttMs: z.number().nullable(),
    deviceMemoryGb: z.number().nullable(),
    hardwareConcurrency: z.number().int().nullable(),
    jsHeapUsedMb: z.number().nullable(),
    jsHeapLimitMb: z.number().nullable(),
    localStorageKeys: z.number().int().nullable(),
    localStorageApproxBytes: z.number().int().nullable(),
    sessionStorageKeys: z.number().int().nullable(),
  }),
});

export type FeedbackDiagnostics = z.infer<typeof feedbackDiagnosticsSchema>;

export const feedbackSubmissionSchema = z.object({
  category: z.enum(feedbackCategories),
  severity: z.enum(feedbackSeverities),
  message: z.string().trim().min(10, "Please add at least 10 characters").max(2000),
  pageUrl: z.string().url().max(2048),
  pagePath: z.string().max(2048),
  referrer: z.string().max(2048).nullable(),
  userAgent: z.string().max(1024),
  viewport: z.object({
    w: z.number().int(),
    h: z.number().int(),
    dpr: z.number(),
  }),
  screen: z.object({ w: z.number().int(), h: z.number().int() }),
  timezone: z.string().max(64),
  language: z.string().max(32),
  /**
   * Storage keys returned by `/api/feedback/screenshot/presign` (one presign +
   * PUT per file). Server validates each key's prefix matches the calling user
   * before embedding it. Capped at `FEEDBACK_SCREENSHOT_MAX_COUNT`.
   * TIER 2 (screenshots) — harmless to keep even if screenshots are disabled.
   */
  screenshotKeys: z.array(z.string().max(512)).max(FEEDBACK_SCREENSHOT_MAX_COUNT).optional(),
  /**
   * @deprecated Single-attachment field kept for back-compat with clients built
   * before multi-screenshot support. Merged into `screenshotKeys` server-side.
   */
  screenshotKey: z.string().max(512).nullable().optional(),
  /**
   * Title of the modal the user was inside when they hit the in-modal feedback
   * button. `null` when feedback was submitted from the page-level header
   * button. Captured client-side from the parent dialog's `[data-slot="dialog-title"]`.
   */
  modalTitle: z.string().trim().max(200).nullable().optional(),
  /**
   * Behind-the-scenes browser diagnostics (console, network, breadcrumbs,
   * session, runtime). Collected silently on submit by `telemetry-client.ts`;
   * never surfaced in the form UI. TIER 3 (telemetry).
   */
  diagnostics: feedbackDiagnosticsSchema.nullable().optional(),
});

export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
