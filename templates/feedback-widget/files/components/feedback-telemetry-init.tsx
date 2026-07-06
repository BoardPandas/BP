"use client";
// Destination: src/components/feedback/feedback-telemetry-init.tsx
// TIER 3 (telemetry). Mount once near the root (providers/layout).

import { useEffect } from "react";
import { initFeedbackTelemetry } from "@/lib/feedback/telemetry-client";

/**
 * Installs the always-on browser telemetry (console / network / breadcrumb ring
 * buffers + global error listeners) used to enrich feedback submissions. Renders
 * nothing; mounted once near the root so capture starts as early as possible.
 */
export function FeedbackTelemetryInit() {
  useEffect(() => {
    initFeedbackTelemetry();
  }, []);
  return null;
}
