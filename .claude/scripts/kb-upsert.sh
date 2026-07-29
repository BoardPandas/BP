#!/usr/bin/env bash
#
# kb-upsert.sh -- create or update a single file in a GitHub repo via the
# contents API, handling the blob-SHA dance and base64 encoding for you.
#
# Used by the add-lesson (LL-G) and add-practice (BP) skills so they don't have
# to capture SHAs by hand or rely on the GNU-only `base64 -w0` flag.
#
# Usage:
#   kb-upsert.sh <repo> <path> <content-file> <commit-message> [branch] [base-sha]
#
#   repo            owner/name, e.g. BoardPandas/LL-G
#   path            path within the repo, e.g. kb/powershell/quoting.md
#   content-file    local file whose contents become the file body
#   commit-message  commit message (quote it)
#   branch          target branch (default: main)
#   base-sha        blob SHA the edit was based on -- STRONGLY RECOMMENDED for any
#                   file you edited rather than authored, especially shared indexes
#
# Behaviour:
#   - If the path does not exist (404), it is created.
#   - With base-sha, the PUT is a true compare-and-swap: a concurrent write to the
#     same path fails with 409 and nothing is lost.
#   - Without base-sha, the current SHA is read just before the PUT, which is
#     LAST-WRITER-WINS. See the warning below.
#   - On success, prints the file's html_url.
#
# CONCURRENCY (this bit used to be documented backwards):
#   Re-reading the SHA immediately before the PUT does NOT protect against a lost
#   update -- it is precisely what defeats the protection. GitHub uses that SHA for
#   optimistic concurrency: it must be the SHA of the blob your edit was BASED ON, so
#   that a write landing in between makes your PUT 409. Refreshing it first guarantees
#   your overwrite succeeds and silently discards the other write.
#
#   This cost a real entry: two sessions appended to the same llms.txt index minutes
#   apart, and the second PUT reverted the first session's shelf line with no error.
#
#   Correct usage when editing an existing file:
#     sha=$(gh api "repos/$R/contents/$P" --jq .sha)
#     gh api "repos/$R/contents/$P" --jq .content | base64 -d > local.txt
#     ...edit local.txt...
#     kb-upsert.sh "$R" "$P" local.txt "msg" main "$sha"
#
# Requires: gh (authenticated), base64, tr.

set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "usage: kb-upsert.sh <repo> <path> <content-file> <commit-message> [branch]" >&2
  exit 64
fi

repo="$1"
path="$2"
content_file="$3"
message="$4"
branch="${5:-main}"
base_sha="${6:-}"

if [ ! -f "$content_file" ]; then
  echo "kb-upsert: content file not found: $content_file" >&2
  exit 66
fi

# Portable base64 with no line wrapping: GNU wraps at 76 cols, BSD at 64; both
# are flattened by stripping newlines. Avoids the GNU-only `-w0` flag.
content_b64="$(base64 "$content_file" | tr -d '\r\n')"

# A blob id is exactly 40 lowercase hex chars. Anything else is not a SHA.
is_sha() { printf '%s' "${1-}" | grep -qE '^[0-9a-f]{40}$'; }

if [ -n "$base_sha" ]; then
  # True compare-and-swap: GitHub rejects the PUT with 409 if the blob moved on.
  if ! is_sha "$base_sha"; then
    echo "kb-upsert: base-sha is not a 40-hex blob id: ${base_sha}" >&2
    exit 65
  fi
  sha="$base_sha"
else
  # Last-writer-wins. Reading the SHA here does NOT prevent a lost update; it is what
  # makes the overwrite succeed. Fine for a file only this session touches; wrong for
  # a shared index. A 404 (new file) is expected and leaves sha empty.
  sha="$(gh api "repos/${repo}/contents/${path}" --jq .sha 2>/dev/null || true)"
  # On a 404 `gh api` writes the error JSON to STDOUT and does NOT apply --jq to it, so
  # this captures a 127-char {"message":"Not Found",...} rather than an empty string. A
  # bare -n test then reads "file exists" for every new file and forwards the blob as a
  # sha. Validate the shape instead of trusting emptiness.
  is_sha "$sha" || sha=""
  if [ -n "$sha" ]; then
    echo "kb-upsert: WARNING: updating existing ${path} with no base-sha (last-writer-wins)." >&2
    echo "kb-upsert:          A concurrent write to this path will be silently discarded." >&2
    echo "kb-upsert:          Pass the SHA your edit was based on as argument 6." >&2
  fi
fi

args=(
  --method PUT
  -f "message=${message}"
  -f "branch=${branch}"
  -f "content=${content_b64}"
)
if [ -n "$sha" ]; then
  args+=(-f "sha=${sha}")
fi

gh api "repos/${repo}/contents/${path}" "${args[@]}" --jq '.content.html_url'
