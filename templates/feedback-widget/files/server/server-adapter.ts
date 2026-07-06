// Destination: src/lib/feedback/server-adapter.ts
// THE server-side integration seam. Everything app-specific that the feedback
// API routes need lives here: auth, logging, rate limiting, analytics.
// Reference implementations are provided; swap each for your project's
// equivalents where they exist.
import { NextResponse } from "next/server";

export type FeedbackUser = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
};

/**
 * ADAPT (REQUIRED): resolve the authenticated user from the request, or return
 * a 401 response. The feedback routes refuse anonymous submissions.
 *
 * BetterAuth example:
 *   import { auth } from "@/lib/auth";
 *   const session = await auth.api.getSession({ headers: req.headers });
 *   if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   return { id: session.user.id, name: session.user.name ?? null,
 *            email: session.user.email, role: (session.user.role as string) ?? null };
 *
 * NextAuth example:
 *   import { auth } from "@/auth";
 *   const session = await auth();
 *   if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   return { id: session.user.id ?? session.user.email, name: session.user.name ?? null,
 *            email: session.user.email, role: null };
 */
export async function requireUser(req: Request): Promise<FeedbackUser | NextResponse> {
  void req;
  // Deliberate 501 so an unfinished install fails loudly instead of silently
  // accepting anonymous feedback.
  return NextResponse.json({ error: "requireUser is not implemented" }, { status: 501 });
}

export function apiSuccess<T>(data: T): NextResponse {
  return NextResponse.json({ data });
}

export function apiError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * ADAPT (recommended): route through your structured logger (Pino, Winston...).
 * The console fallback below is fine for small apps.
 */
export function log(
  level: "info" | "warn" | "error",
  fields: Record<string, unknown>,
  msg: string,
): void {
  const line = JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

/**
 * ADAPT (recommended): swap for a Redis/Upstash sliding-window limiter if the
 * app runs more than one instance. This in-memory fallback is per-process:
 * correct on a single instance, merely advisory behind a load balancer.
 * Returns null when allowed, or a 429 response when limited.
 */
const buckets = new Map<string, number[]>();

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<NextResponse | null> {
  const now = Date.now();
  const bucketKey = `${config.keyPrefix}:${key}`;
  const windowStart = now - config.windowMs;
  const hits = (buckets.get(bucketKey) ?? []).filter((t) => t > windowStart);
  hits.push(now);
  buckets.set(bucketKey, hits);
  if (hits.length > config.maxRequests) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(config.windowMs / 1000)) },
      },
    );
  }
  return null;
}

/**
 * ADAPT (optional): forward to your product analytics (PostHog, Segment...).
 * No-op by default.
 */
export function track(
  event: string,
  userId: string,
  properties: Record<string, unknown>,
): void {
  void event;
  void userId;
  void properties;
}
