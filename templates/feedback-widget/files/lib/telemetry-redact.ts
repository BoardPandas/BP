// Destination: src/lib/feedback/telemetry-redact.ts
// Portable — no app-specific dependencies. TIER 3 (telemetry).
import { NETWORK_URL_MAX_CHARS } from "./telemetry-types";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER_RE = /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]+/g;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{40,}\b/g;
const LONG_HEX_RE = /\b[A-Fa-f0-9]{32,}\b/g;

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "id_token",
  "refresh_token",
  "key",
  "api_key",
  "apikey",
  "secret",
  "password",
  "pass",
  "pwd",
  "auth",
  "authorization",
  "session",
  "sig",
  "signature",
  "code",
  "x-amz-signature",
  "x-amz-credential",
  "x-amz-security-token",
]);

/** Strip the obvious secret/PII shapes out of an arbitrary string. */
export function redactText(value: string): string {
  return value
    .replace(JWT_RE, "[redacted-jwt]")
    .replace(BEARER_RE, "Bearer [redacted]")
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(LONG_HEX_RE, "[redacted-hex]")
    .replace(LONG_TOKEN_RE, "[redacted-token]");
}

/**
 * Reduce a URL to origin + path with sensitive query params masked. Falls back
 * to a blunt redact when the URL can't be parsed (e.g. a relative path).
 */
export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl, typeof window !== "undefined" ? window.location.origin : undefined);
    for (const k of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(k.toLowerCase())) {
        u.searchParams.set(k, "[redacted]");
      }
    }
    const sameOrigin = typeof window !== "undefined" && u.origin === window.location.origin;
    const base = sameOrigin ? "" : u.origin;
    const out = `${base}${u.pathname}${u.search}`;
    return redactText(out).slice(0, NETWORK_URL_MAX_CHARS);
  } catch {
    return redactText(rawUrl).slice(0, NETWORK_URL_MAX_CHARS);
  }
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
