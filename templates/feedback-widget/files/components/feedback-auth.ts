"use client";
// Destination: src/components/feedback/feedback-auth.ts
// Client-side auth seam for the feedback buttons.

/**
 * ADAPT (REQUIRED): return the signed-in user, or null to hide the feedback
 * buttons for signed-out visitors. The default returns null, which means the
 * buttons render nothing until you implement this — a deliberate forcing
 * function so the widget never ships half-wired.
 *
 * BetterAuth example:
 *   import { useSession } from "@/lib/auth/client";
 *   export function useFeedbackUser() {
 *     const { data: session } = useSession();
 *     return session?.user ? { id: session.user.id } : null;
 *   }
 *
 * NextAuth example:
 *   import { useSession } from "next-auth/react";
 *   export function useFeedbackUser() {
 *     const { data: session } = useSession();
 *     return session?.user ? { id: session.user.email ?? "user" } : null;
 *   }
 */
export function useFeedbackUser(): { id: string } | null {
  return null;
}
