// Destination: src/lib/feedback/telemetry-types.ts
// Portable — no app-specific dependencies. TIER 3 (telemetry).
export const CONSOLE_BUFFER_MAX = 80;
export const NETWORK_BUFFER_MAX = 60;
export const BREADCRUMB_BUFFER_MAX = 40;

export const CONSOLE_ENTRY_MAX_CHARS = 1000;
export const NETWORK_URL_MAX_CHARS = 512;
export const BREADCRUMB_LABEL_MAX_CHARS = 200;
export const REACT_STACK_MAX_CHARS = 6000;

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export type ConsoleEntry = {
  level: ConsoleLevel;
  message: string;
  ts: number;
};

export type NetworkEntry = {
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  durationMs: number | null;
  requestId: string | null;
  ts: number;
  error?: string | null;
};

export type Breadcrumb = {
  type: "click" | "navigation";
  label: string;
  ts: number;
};

export type ReactErrorEntry = {
  message: string;
  stack: string | null;
  digest: string | null;
  ts: number;
};

export type FeedbackDiagnostics = {
  appVersion: string | null;
  capturedAt: number;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  breadcrumbs: Breadcrumb[];
  reactError: ReactErrorEntry | null;
  session: {
    distinctId: string | null;
    sessionId: string | null;
    replayUrl: string | null;
    activeFlags: string[];
  };
  runtime: {
    online: boolean;
    cookiesEnabled: boolean;
    connection: string | null;
    downlinkMbps: number | null;
    rttMs: number | null;
    deviceMemoryGb: number | null;
    hardwareConcurrency: number | null;
    jsHeapUsedMb: number | null;
    jsHeapLimitMb: number | null;
    localStorageKeys: number | null;
    localStorageApproxBytes: number | null;
    sessionStorageKeys: number | null;
  };
};

export type TelemetryStore = {
  console: ConsoleEntry[];
  network: NetworkEntry[];
  breadcrumbs: Breadcrumb[];
  reactError: ReactErrorEntry | null;
  installed: boolean;
};

// ADAPT: rename per app so two apps on the same origin never collide.
export const WINDOW_KEY = "__appFeedbackTelemetry";

export type WindowWithStore = Window & { [WINDOW_KEY]?: TelemetryStore };
