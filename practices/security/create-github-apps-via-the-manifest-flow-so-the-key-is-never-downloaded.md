---
concern: security
tech: [github, github-apps, openssl, web-crypto, cloudflare-workers]
priority: recommended
applies-to: [github, github-apps, openssl, web-crypto, cloudflare-workers]
tags: [github-app, manifest-flow, private-key, pkcs8, secrets, web-crypto]
---
# Create GitHub Apps via the manifest flow so the key is never downloaded

## PATTERN
Create a GitHub App from a manifest instead of the settings form, and turn the one-time `code` GitHub redirects back with into the App's credentials with `POST /app-manifests/{code}/conversions`. The response carries the App's private key (`pem`) with its id, client secret and webhook secret. Pipe the key straight from that response into the secret store (a Worker secret, a secrets manager), converting it on the way if the runtime needs another format. Nobody clicks "Generate a private key", no `.pem` file is downloaded, and nothing prints it.

For Web Crypto runtimes (Cloudflare Workers, Deno, browsers), convert GitHub's PKCS#1 key (`BEGIN RSA PRIVATE KEY`) to PKCS#8 (`BEGIN PRIVATE KEY`) with `openssl pkcs8 -topk8 -nocrypt`: `crypto.subtle.importKey` takes `pkcs8`, not PKCS#1.

## WHY
The settings-form route makes a person download a key file, which then sits in a Downloads folder, a shell history or a chat transcript until someone remembers to delete it, and that key signs as the App on every repository it is installed on. The manifest route also states the App's permissions, events and webhook as reviewable JSON, so the App can be recreated identically. The code is single-use and expires after an hour, so a leaked redirect URL is short-lived.

## EXAMPLE
1. A page posts the manifest to GitHub (`https://github.com/settings/apps/new` for a personal account):
```html
<form method="post" action="https://github.com/organizations/EXAMPLE-ORG/settings/apps/new?state=RANDOM_STATE">
  <input type="hidden" name="manifest" value='{"name":"example-publisher","url":"https://example.com","hook_attributes":{"url":"https://example.com/","active":false},"redirect_url":"https://github.com/EXAMPLE-ORG/example-repo","public":false,"default_permissions":{"contents":"write"},"default_events":[]}'>
  <button>Create the App</button>
</form>
```
The person reviews it on GitHub and clicks Create. GitHub redirects to `redirect_url?code=...&state=...`. The redirect target needs no server: the person copies the code from the address bar. Check that `state` matches.

2. Exchange the code and store the key in the same shell, printing nothing secret:
```bash
set -euo pipefail; umask 077
resp=$(gh api -X POST "app-manifests/$code/conversions")
id=$(jq -r '.id // empty' <<<"$resp")
pk8=$(jq -r '.pem // empty' <<<"$resp" | openssl pkcs8 -topk8 -nocrypt)
[[ -n $id && $pk8 == *"BEGIN PRIVATE KEY"* ]] || { echo "conversion failed"; exit 1; }
printf '%s\n' "$pk8" | npx wrangler secret put GITHUB_APP_KEY >/dev/null
printf '%s\n' "$pk8" | doppler secrets set GITHUB_APP_KEY --no-interactive >/dev/null
echo "app id=$id"   # the id is not secret; pem, client_secret and webhook_secret are
```

3. The runtime imports it:
```ts
const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
const key = await crypto.subtle.importKey(
  "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
);
```

## CHECK
- No private-key file for the App exists on any machine (`find ~ -name '*.private-key.pem'` finds none), and the App's settings page lists one private key, the one the conversion made.
- The runtime imports the stored key and mints an installation token; a key it refuses as PKCS#1 or encrypted was stored unconverted.
- The setup's shell history and transcript contain at most the code, never `pem`, `client_secret` or `webhook_secret`.
- The manifest JSON is recorded (committed, or in the runbook), so the App can be recreated with the same permissions.

## IMPLEMENT
1. Write the manifest: `name`, `url`, `redirect_url`, `public: false`, the least `default_permissions` the App needs, and, with no webhook, `default_events: []` and `hook_attributes.active: false`.
2. Generate a random `state` and open the form for the organization or account that will own the App.
3. After Create, take `code` from the redirect within the hour and confirm `state`.
4. Run the exchange in one shell: convert to PKCS#8 for Web Crypto, write the key to every store that needs it in that same shell with output discarded, and let the variable go with the shell.
5. Put the App id (not secret) in config, and install the App on only the repositories it needs.
6. In the runtime, refuse a PKCS#1 or encrypted key with a message naming `openssl pkcs8 -topk8 -nocrypt`.

## NOTES
- `openssl pkcs8 -topk8 -nocrypt` reads the PKCS#1 key on stdin and writes unencrypted PKCS#8; without `-nocrypt` it asks for a password and writes an encrypted key Web Crypto cannot import.
- `POST /app-manifests/{code}/conversions` needs no authentication; `curl -X POST https://api.github.com/app-manifests/$code/conversions` works as well as `gh api`.
- Some CLIs echo the value they set (`doppler secrets set` prints the secrets table), so send their output to `/dev/null`.
- Node's `crypto.createPrivateKey` accepts PKCS#1 directly; the conversion is for Web Crypto.
