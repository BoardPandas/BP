// Destination: src/lib/feedback/github-attachment.ts
// Portable. TIER 2 (screenshots) + TIER 3 (diagnostics artifact).
/**
 * Commits a feedback screenshot into the configured GitHub repo via the
 * Contents API and returns a permanent github.com blob URL for it.
 *
 * The feedback repo is private/internal, so the screenshot is referenced as a
 * clickable blob link rather than an inline image. A `raw.githubusercontent.com`
 * URL for a private repo only resolves with a short-lived `?token=` query param
 * that 404s within minutes, and GitHub's image proxy cannot authenticate to
 * render such an image inline. The Contents API `download_url` is exactly that
 * tokenised URL, so it must never be embedded in an issue.
 *
 * Why not GitHub's "drag-and-drop" user-attachments endpoint? That endpoint
 * requires a session cookie, not a PAT, and there is no PAT-authenticated API
 * for issue attachments. Committing to the repo at a dedicated path is the only
 * supported way to host an image alongside an issue.
 */
export type GithubAttachmentResult = {
  /**
   * Permanent github.com blob URL for the committed screenshot. For a private
   * or internal repo this is the only durable reference; the Contents API
   * `download_url` carries a short-lived token that 404s within minutes.
   */
  url: string;
  /** Repo-relative path. Log it for traceability. */
  path: string;
  /** Blob SHA, handy if we ever need to delete the asset later. */
  sha: string;
};

const ATTACHMENT_DIR = "feedback-attachments";

// ADAPT: set a User-Agent that identifies your app (GitHub requires one).
const USER_AGENT = "app-feedback";

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function safeFilenameStem(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const safe = stem.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60);
  return safe || "screenshot";
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function uploadGithubAttachment(opts: {
  token: string;
  /** "owner/repo". */
  repo: string;
  bytes: Uint8Array;
  /** Original filename used for stem + extension fallback. */
  filename: string;
  contentType: string;
  /** Slug used in the commit message and folder name (e.g. "bug"). */
  category: string;
  /** Id that ties this commit back to the user's submission for grep-ability. */
  correlationId: string;
  /** Human label for the commit message; defaults to "screenshot". */
  label?: string;
}): Promise<GithubAttachmentResult> {
  const ext = MIME_EXT[opts.contentType] ?? opts.filename.split(".").pop() ?? "bin";
  const stem = safeFilenameStem(opts.filename);
  const path = `${ATTACHMENT_DIR}/${opts.category}/${opts.correlationId}-${stem}.${ext}`;

  const content = Buffer.from(opts.bytes).toString("base64");

  const res = await fetch(
    `https://api.github.com/repos/${opts.repo}/contents/${encodePath(path)}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        message: `chore(feedback): attach ${opts.label ?? "screenshot"} ${opts.correlationId}`,
        content,
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`GitHub Contents API returned ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    content?: {
      path?: string;
      sha?: string;
      html_url?: string;
    };
  };

  if (!json.content?.html_url || !json.content.path || !json.content.sha) {
    throw new Error("GitHub Contents API response missing required fields");
  }

  return {
    url: json.content.html_url,
    path: json.content.path,
    sha: json.content.sha,
  };
}
