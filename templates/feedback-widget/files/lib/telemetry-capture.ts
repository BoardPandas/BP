// Destination: src/lib/feedback/telemetry-capture.ts
// TIER 3 (telemetry). One ADAPT point: the analytics ingest host to ignore.
import { redactText, redactUrl, truncate } from "./telemetry-redact";
import {
  BREADCRUMB_BUFFER_MAX,
  BREADCRUMB_LABEL_MAX_CHARS,
  CONSOLE_BUFFER_MAX,
  CONSOLE_ENTRY_MAX_CHARS,
  type ConsoleLevel,
  NETWORK_BUFFER_MAX,
  type TelemetryStore,
  WINDOW_KEY,
  type WindowWithStore,
} from "./telemetry-types";

export function getStore(): TelemetryStore | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithStore;
  if (!w[WINDOW_KEY]) {
    w[WINDOW_KEY] = {
      console: [],
      network: [],
      breadcrumbs: [],
      reactError: null,
      installed: false,
    };
  }
  return w[WINDOW_KEY] ?? null;
}

export function pushCapped<T>(buffer: T[], entry: T, max: number): void {
  buffer.push(entry);
  if (buffer.length > max) buffer.splice(0, buffer.length - max);
}

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(arg, (_key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[circular]";
        seen.add(val);
      }
      if (typeof val === "bigint") return val.toString();
      return val;
    });
  } catch {
    return "[unserializable]";
  }
}

export function recordConsole(store: TelemetryStore, level: ConsoleLevel, args: unknown[]): void {
  const message = truncate(redactText(args.map(stringifyArg).join(" ")), CONSOLE_ENTRY_MAX_CHARS);
  pushCapped(store.console, { level, message, ts: Date.now() }, CONSOLE_BUFFER_MAX);
}

export function installConsole(store: TelemetryStore): void {
  const levels: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        recordConsole(store, level, args);
      } catch {
        // Never let instrumentation break logging.
      }
      original(...args);
    };
  }
}

export function installErrorListeners(store: TelemetryStore): void {
  window.addEventListener("error", (event) => {
    try {
      const detail = event.error instanceof Error ? event.error.message : event.message;
      const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
      recordConsole(store, "error", [`Uncaught: ${detail}${where}`]);
    } catch {
      /* swallow */
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event.reason;
      const detail = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
      recordConsole(store, "error", [`Unhandled promise rejection: ${detail}`]);
    } catch {
      /* swallow */
    }
  });
}

// ADAPT (optional): host of your analytics ingest endpoint so the fetch patch
// doesn't record your own analytics traffic. Leave unset if not applicable.
const ANALYTICS_HOST = (() => {
  try {
    const h = process.env.NEXT_PUBLIC_ANALYTICS_HOST;
    return h ? new URL(h).host : null;
  } catch {
    return null;
  }
})();

function isIgnoredUrl(url: string): boolean {
  if (url.includes("/api/feedback")) return true;
  if (url.includes("posthog.com")) return true;
  if (ANALYTICS_HOST && url.includes(ANALYTICS_HOST)) return true;
  return url.includes("/ingest") || url.includes("/decide");
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

export function installFetch(store: TelemetryStore): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = urlOf(input);
    if (isIgnoredUrl(rawUrl)) {
      return originalFetch(input, init);
    }
    const method = methodOf(input, init);
    const start = Date.now();
    try {
      const res = await originalFetch(input, init);
      try {
        pushCapped(
          store.network,
          {
            method,
            url: redactUrl(rawUrl),
            status: res.status,
            ok: res.ok,
            durationMs: Date.now() - start,
            requestId: res.headers.get("x-request-id"),
            ts: start,
          },
          NETWORK_BUFFER_MAX,
        );
      } catch {
        /* swallow */
      }
      return res;
    } catch (err) {
      try {
        pushCapped(
          store.network,
          {
            method,
            url: redactUrl(rawUrl),
            status: null,
            ok: false,
            durationMs: Date.now() - start,
            requestId: null,
            ts: start,
            error: truncate(redactText(err instanceof Error ? err.message : String(err)), 300),
          },
          NETWORK_BUFFER_MAX,
        );
      } catch {
        /* swallow */
      }
      throw err;
    }
  };
}

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const testid = el.getAttribute("data-testid");
  const aria = el.getAttribute("aria-label");
  const id = el.id ? `#${el.id}` : "";
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const parts = [tag + id];
  if (testid) parts.push(`[data-testid=${testid}]`);
  if (aria) parts.push(`[aria-label=${aria}]`);
  if (text) parts.push(`"${text}"`);
  return parts.join(" ");
}

export function installBreadcrumbs(store: TelemetryStore): void {
  document.addEventListener(
    "click",
    (event) => {
      try {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const interactive =
          target.closest("button,a,[role=button],input,select,textarea") ?? target;
        const label = truncate(
          redactText(describeElement(interactive)),
          BREADCRUMB_LABEL_MAX_CHARS,
        );
        pushCapped(
          store.breadcrumbs,
          { type: "click", label, ts: Date.now() },
          BREADCRUMB_BUFFER_MAX,
        );
      } catch {
        /* swallow */
      }
    },
    { capture: true, passive: true },
  );

  const recordNav = (path: string) => {
    try {
      pushCapped(
        store.breadcrumbs,
        {
          type: "navigation",
          label: truncate(redactText(path), BREADCRUMB_LABEL_MAX_CHARS),
          ts: Date.now(),
        },
        BREADCRUMB_BUFFER_MAX,
      );
    } catch {
      /* swallow */
    }
  };

  const origPush = history.pushState.bind(history);
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    origPush(data, unused, url ?? null);
    recordNav(window.location.pathname + window.location.search);
  };
  const origReplace = history.replaceState.bind(history);
  history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    origReplace(data, unused, url ?? null);
    recordNav(window.location.pathname + window.location.search);
  };
  window.addEventListener("popstate", () => {
    recordNav(window.location.pathname + window.location.search);
  });
}
