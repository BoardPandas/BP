"use client";
// Destination: src/lib/feedback/analytics-client.ts
// Client-side analytics seam for the feedback dialog.

/**
 * ADAPT (optional): forward to your product analytics.
 *
 * PostHog example:
 *   import { posthog } from "@/lib/analytics/posthog-client";
 *   export function track(event: string, properties?: Record<string, unknown>) {
 *     posthog.capture?.(event, properties);
 *   }
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  void event;
  void properties;
}
