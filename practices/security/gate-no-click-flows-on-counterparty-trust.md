---
concern: security
tech: [oauth, authorization-server, web, redirects]
priority: recommended
applies-to: [oauth, authorization-server, web-apps, sso]
---
# Gate automatic redirects, auto-approval and other "no click" flows on trust in the counterparty

## PATTERN
Any step where the server acts for a signed-in person **without them clicking anything** is decided by one question first: is the party on the other side trusted?

1. Define "trusted" once, in one function: the counterparty is first-party, or the signed-in user has already approved exactly this counterparty. Self-reported names, a successful registration, or a valid-looking redirect URI are not trust.
2. Route every no-click behaviour through that function: automatic redirects (including error redirects to a registered redirect URI), automatic approval, silent `prompt=none` answers, remembered consent, automatic continuation after sign-in.
3. Trusted: the automatic behaviour is allowed.
4. Not trusted: the server renders **its own page** that says what is about to happen and offers an explicit link or button. The person, not the server, makes the hop.

## WHY
Rules such as "redirect errors to the client's redirect URI" were written when an administrator registered every client. Once anyone can register a client (dynamic client registration, client ID metadata documents), an automatic redirect turns the server into an open redirector (RFC 9700 section 4.11.2), and automatic approval turns a signed-in session into consent the person never gave. Deciding each case separately leaves gaps; one trust predicate applied to every no-click path does not.

## EXAMPLE
Generic sketch:

```text
fn counterparty_trusted(user, client) -> bool:
    client.first_party or approvals.exists(user, client, redirect_uri, scopes_subset)

authorize(request):
    ...
    if error:
        if counterparty_trusted(user, client):
            return redirect(redirect_uri + "?error=...&state=...")
        return page("This request could not be completed.",
                    link("Return to " + host_of(redirect_uri), redirect_uri + "?error=...&state=..."))
    if counterparty_trusted(user, client):
        return issue_code_and_redirect()
    return consent_page()
```

## CHECK
- [ ] There is exactly one function that answers "is this counterparty trusted", and it does not accept self-reported metadata as evidence.
- [ ] Every automatic redirect to a counterparty-supplied URL, success or error, is behind that function.
- [ ] Every automatic approval or silent answer is behind that function.
- [ ] The untrusted path renders a page on the server's own origin with an explicit link or button.
- [ ] A test registers a new, never-approved client and asserts that no response is a redirect to its URI.

## IMPLEMENT
1. List every place the server redirects to, or acts on behalf of, a counterparty without a click.
2. Write the trust function and its tests (first-party, approved, unapproved, approved for a different redirect or wider scope).
3. Put each listed place behind it; add the page-with-link branch for the untrusted case.
4. Add the unapproved-client test for each endpoint.

## NOTES
Decision buttons on the page still need protection against staged double-clicks; see LL-G `kb/web-security/consent-button-live-on-load-is-open-to-doubleclickjacking.md`. The gotcha this practice answers is LL-G `kb/oauth/error-redirect-to-registered-uri-is-an-open-redirector.md`.
