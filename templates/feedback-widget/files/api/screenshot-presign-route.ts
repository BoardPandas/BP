// Destination: src/app/api/feedback/screenshot/presign/route.ts
// TIER 2 (screenshots) only — omit this route entirely if you skip screenshots.
import { NextResponse } from "next/server";
import {
  apiError,
  apiSuccess,
  checkRateLimit,
  log,
  requireUser,
} from "@/lib/feedback/server-adapter";
import { getUploadUrl } from "@/lib/feedback/storage";
import {
  FEEDBACK_SCREENSHOT_MAX_COUNT,
  feedbackScreenshotPresignSchema,
} from "@/lib/validations/feedback";

// The dialog presigns every attached screenshot in parallel (one call each), so
// a single submission spends up to FEEDBACK_SCREENSHOT_MAX_COUNT tokens at once.
// Size the window to hold a full attachment set plus at least one retry,
// otherwise a legitimate resend 429s individual presigns mid-batch. Still
// per-user, per 30s, so abuse protection holds.
const PRESIGN_RATE_LIMIT = {
  windowMs: 30_000,
  maxRequests: FEEDBACK_SCREENSHOT_MAX_COUNT * 2 + 2,
  keyPrefix: "rl:feedback-screenshot-presign",
};

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * POST /api/feedback/screenshot/presign
 *
 * Issues a presigned PUT URL for uploading an optional feedback screenshot to
 * object storage. The key is namespaced under `feedback/{userId}/` so the
 * feedback route can verify ownership before embedding the download URL in
 * the GitHub issue body. Do not change the prefix without also changing the
 * ownership check in the feedback route.
 */
export async function POST(req: Request) {
  const userOrResponse = await requireUser(req);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const userId = userOrResponse.id;

  const limited = await checkRateLimit(userId, PRESIGN_RATE_LIMIT);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = feedbackScreenshotPresignSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }

  const { contentType, fileSize } = parsed.data;
  const ext = MIME_EXT[contentType] ?? "bin";
  const random = crypto.randomUUID();
  const key = `feedback/${userId}/${Date.now()}-${random}.${ext}`;

  const presignedUrl = await getUploadUrl(key, contentType, 600);

  log(
    "info",
    { action: "feedback.screenshot.presign", userId, key, contentType, fileSize },
    "Feedback screenshot presigned",
  );

  return apiSuccess({ presignedUrl, key });
}
