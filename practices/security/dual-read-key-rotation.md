---
concern: security
tech: [nodejs, typescript, postgres]
priority: recommended
source-repo: supportforge-platform
applies-to: [any-backend-with-encrypted-at-rest-data]
---
# Dual-Read Key Rotation for At-Rest Encryption Keys

## PATTERN
When an encryption key protecting stored data (credentials, tokens, PII) must be rotated or split off from another secret, never just swap the env var: existing ciphertexts become undecryptable. Instead rotate in three releases:

1. Release A: introduce the new key alongside the old. Encrypt all NEW writes with the new key. On read, try the new key first, fall back to the old key, and on successful old-key decrypt, re-encrypt the value with the new key and write it back (lazy re-encryption).
2. Between releases: optionally run a batch job that reads and rewrites all remaining rows to force re-encryption.
3. Release B: once telemetry shows zero old-key decrypts (log a counter, never the values), remove the fallback and retire the old key.

Tag ciphertexts with a key version (prefix like `v2:` or a key_id column) so the read path picks the key directly instead of try-and-fail.

## WHY
The naive swap silently bricks every previously encrypted value; the failure surfaces later as decrypt errors in unrelated features and there is no way back if the old key was discarded. Dual-read makes rotation a zero-downtime, reversible operation. It also unblocks fixing a worse smell this pattern was extracted from: a runbook that mandated CREDENTIAL_ENCRYPTION_KEY equal JWT_SECRET, meaning one leak broke both signing and at-rest encryption, and the keys could not be rotated independently.

## EXAMPLE
From supportforge-platform (the key split plan; simplified):

```ts
// src/services/crypto.ts
const KEYS = {
  v2: process.env.CREDENTIAL_ENCRYPTION_KEY!,      // new, dedicated key
  v1: process.env.JWT_SECRET!,                      // legacy shared key
};

export function encrypt(plain: string): string {
  return 'v2:' + aes256gcmEncrypt(plain, KEYS.v2);
}

export function decrypt(stored: string): string {
  const [ver, payload] = stored.includes(':') ? splitOnce(stored, ':') : ['v1', stored];
  const plain = aes256gcmDecrypt(payload, KEYS[ver as keyof typeof KEYS]);
  if (ver === 'v1') {
    metrics.increment('crypto.legacy_key_decrypt');   // drives the retire decision
    void reencryptInBackground(stored, plain);
  }
  return plain;
}
```

## CHECK
How to verify if a repo already follows this:
- [ ] Encryption keys for at-rest data are distinct env vars from JWT/session signing secrets
- [ ] Ciphertexts carry a key version (prefix or column)
- [ ] The decrypt path supports more than one key version, or a documented rotation procedure exists
- [ ] A metric or log counter exists for legacy-key decrypts

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Add a key-version prefix to the encrypt path and a version-aware decrypt path (treat unprefixed values as v1).
2. Introduce the new key env var in the secrets manager AND verify it reaches the runtime (see the LL-G Northflank/Doppler entry: source-of-truth update and runtime delivery are two separate actions).
3. Ship release A with dual-read plus lazy re-encryption and a legacy-decrypt counter.
4. Optionally batch re-encrypt; watch the counter reach zero.
5. Ship release B removing the v1 fallback; retire the old key.

## NOTES
If keys are embedded in distributed binaries (desktop agents), the rotation must be coordinated with an agent release, and the dual-read window has to outlive the slowest agent upgrade cohort.
