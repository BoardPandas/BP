// Destination: src/lib/feedback/telemetry-client.ts
// TIER 3 (telemetry). ADAPT point: session/replay info from your analytics SDK.
import {
  getStore,
  installBreadcrumbs,
  installConsole,
  installErrorListeners,
  installFetch,
} from "./telemetry-capture";
import { redactText, truncate } from "./telemetry-redact";
import {
  BREADCRUMB_BUFFER_MAX,
  CONSOLE_BUFFER_MAX,
  CONSOLE_ENTRY_MAX_CHARS,
  type FeedbackDiagnostics,
  NETWORK_BUFFER_MAX,
  REACT_STACK_MAX_CHARS,
} from "./telemetry-types";

export { redactText, redactUrl } from "./telemetry-redact";
export {
  BREADCRUMB_BUFFER_MAX,
  type Breadcrumb,
  CONSOLE_BUFFER_MAX,
  type ConsoleEntry,
  type FeedbackDiagnostics,
  NETWORK_BUFFER_MAX,
  type NetworkEntry,
  type ReactErrorEntry,
} from "./telemetry-types";

/**
 * Install all telemetry hooks. Idempotent and SSR-safe: the first call patches
 * the console / fetch / history globals and registers listeners; subsequent
 * calls are no-ops.
 */
export function initFeedbackTelemetry(): void {
  const store = getStore();
  if (!store || store.installed) return;
  store.installed = true;
  try {
    installConsole(store);
    installErrorListeners(store);
    installFetch(store);
    installBreadcrumbs(store);
  } catch {
    // If anything throws during install, leave the app untouched.
  }
}

/**
 * Record a React render crash so it survives into the next feedback submission.
 * Called from the global error boundary, where the captured error would
 * otherwise never reach `window.onerror`.
 */
export function recordReactError(error: Error & { digest?: string }): void {
  const store = getStore();
  if (!store) return;
  store.reactError = {
    message: truncate(redactText(error.message || "Unknown error"), CONSOLE_ENTRY_MAX_CHARS),
    stack: error.stack ? truncate(redactText(error.stack), REACT_STACK_MAX_CHARS) : null,
    digest: error.digest ?? null,
    ts: Date.now(),
  };
}

// Minimal typed views over browser globals that TS's lib doesn't model.
interface NavigatorConnection {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}
interface NavigatorExtras extends Navigator {
  connection?: NavigatorConnection;
  deviceMemory?: number;
}
interface PerformanceMemory {
  usedJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}
interface PerformanceExtras extends Performance {
  memory?: PerformanceMemory;
}
interface PostHogLike {
  get_session_id?: () => string | undefined;
  get_distinct_id?: () => string | undefined;
  get_session_replay_url?: (opts?: { withTimestamp?: boolean }) => string | undefined;
  featureFlags?: { getFlags?: () => string[] };
}

function bytesToMb(bytes: number | undefined): number | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return null;
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function measureStorage(storage: Storage): { keys: number; approxBytes: number } | null {
  try {
    let approxBytes = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === null) continue;
      const val = storage.getItem(key) ?? "";
      // Count sizes only — never read values into the payload.
      approxBytes += key.length + val.length;
    }
    return { keys: storage.length, approxBytes };
  } catch {
    return null;
  }
}

function collectSession(): FeedbackDiagnostics["session"] {
  // ADAPT (optional): wire to your analytics SDK for session-replay links and
  // feature flags. Default implementation reads a `window.posthog` global if
  // one exists and degrades to nulls otherwise. If you import a posthog module
  // client, replace the line below with that import.
  const ph =
    typeof window !== "undefined"
      ? (window as Window & { posthog?: PostHogLike }).posthog
      : undefined;
  let activeFlags: string[] = [];
  try {
    activeFlags = ph?.featureFlags?.getFlags?.() ?? [];
  } catch {
    activeFlags = [];
  }
  const safe = <T>(fn: (() => T | undefined) | undefined): T | null => {
    try {
      return fn?.() ?? null;
    } catch {
      return null;
    }
  };
  return {
    distinctId: safe(ph?.get_distinct_id),
    sessionId: safe(ph?.get_session_id),
    replayUrl: safe(
      ph?.get_session_replay_url
        ? () => ph.get_session_replay_url?.({ withTimestamp: true })
        : undefined,
    ),
    activeFlags: activeFlags.slice(0, 100),
  };
}

function collectRuntime(): FeedbackDiagnostics["runtime"] {
  const nav = navigator as NavigatorExtras;
  const perf = performance as PerformanceExtras;
  const conn = nav.connection;
  const local = measureStorage(window.localStorage);
  const sessionStore = measureStorage(window.sessionStorage);
  return {
    online: navigator.onLine,
    cookiesEnabled: navigator.cookieEnabled,
    connection: conn?.effectiveType ?? null,
    downlinkMbps: typeof conn?.downlink === "number" ? conn.downlink : null,
    rttMs: typeof conn?.rtt === "number" ? conn.rtt : null,
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency:
      typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null,
    jsHeapUsedMb: bytesToMb(perf.memory?.usedJSHeapSize),
    jsHeapLimitMb: bytesToMb(perf.memory?.jsHeapSizeLimit),
    localStorageKeys: local?.keys ?? null,
    localStorageApproxBytes: local?.approxBytes ?? null,
    sessionStorageKeys: sessionStore?.keys ?? null,
  };
}

/**
 * Snapshot the current telemetry for attachment to a feedback submission.
 * Returns `null` only in non-browser contexts. Always safe to call: it copies
 * the buffers rather than handing out the live arrays.
 */
export function collectFeedbackDiagnostics(): FeedbackDiagnostics | null {
  const store = getStore();
  if (!store) return null;
  return {
    // ADAPT (optional): expose your build/version identifier at build time.
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    capturedAt: Date.now(),
    console: store.console.slice(-CONSOLE_BUFFER_MAX),
    network: store.network.slice(-NETWORK_BUFFER_MAX),
    breadcrumbs: store.breadcrumbs.slice(-BREADCRUMB_BUFFER_MAX),
    reactError: store.reactError,
    session: collectSession(),
    runtime: collectRuntime(),
  };
}
