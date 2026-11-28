---
concern: security
tech: [credentials, signing, email, configuration-profiles]
priority: recommended
applies-to: [credential-issuance, signed-artifacts, emailed-links, device-enrolment]
---
# Dry-run the whole artifact with a placeholder before minting a credential that is delivered inside it

## PATTERN
When a credential is delivered **inside** something the server builds (a signed configuration profile, an emailed link, a generated config file):

1. **Build the complete artifact first with a placeholder** of the same length and format as the real credential. Run every step that can fail: templating, serialising, signing, size checks, addressing.
2. **Only if the dry run succeeds, mint the real credential.**
3. **Build the artifact again with the real value** and deliver it.
4. **Revoke on any failure after minting.** If the second build or the delivery fails, the credential is revoked before the error is returned.

## WHY
Minting first is the natural order and it leaks credentials: when signing fails because the certificate has expired, or the template has a bug, the request returns an error but a valid credential now exists that nobody holds and nobody will revoke. Each retry mints another. A dry run with a placeholder moves every signing and building problem in front of the mint, so those failures leave nothing behind. Revoking on later failures covers the small window that remains.

## EXAMPLE
Generic sketch:

```text
issue_profile(user, device_name):
    placeholder = same_shape_placeholder()               # same length and alphabet as a real secret
    build_and_sign(profile_for(user, device_name, placeholder))?    # dry run: nothing minted yet

    cred = mint_device_credential(user, device_name)     # only now
    result = build_and_sign(profile_for(user, device_name, cred.secret))
    if result is error:
        revoke(cred)                                     # no stray credential
        return error
    return result.bytes
```

## CHECK
- [ ] The artifact is built end to end with a placeholder before any credential is created.
- [ ] The placeholder has the same length and format as a real credential, so size and encoding problems appear in the dry run.
- [ ] Every failure after minting revokes the credential.
- [ ] A test forces the signing step to fail and asserts that no credential row exists afterwards.
- [ ] A test forces a failure after minting and asserts the credential is revoked.

## IMPLEMENT
1. Split "build the artifact" from "mint the credential" so the builder takes the secret as a parameter.
2. Add the placeholder dry run in front of the mint.
3. Wrap everything after the mint so that any error path revokes.
4. Add the two failure-injection tests.

## NOTES
The route that triggers this mints a credential, so it must not be a GET: LL-G `kb/web-security/get-route-that-mints-a-credential-skips-csrf-checks.md`.
