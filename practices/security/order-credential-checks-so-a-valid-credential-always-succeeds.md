---
concern: security
tech: [authentication, rate-limiting, tokens, passwords]
priority: recommended
applies-to: [authentication, api-tokens, device-credentials, sign-in]
---
# Order credential checks so that a valid credential always succeeds

## PATTERN
Every path that authenticates a credential runs its checks in one fixed order:

1. **Request throttle.** A plain rate limit on requests, regardless of outcome, bounds load. It knows nothing about failures.
2. **Lookup.** Find and verify the credential.
3. **Verdict.**
   - Valid: succeed. Nothing that other callers did can turn this into a refusal.
   - Invalid: the answer is a failure either way. The **failure budget** (per address, per account) is consulted only here, and only to decide how cheaply to fail: a short refusal once the budget is spent, a normal one otherwise. Then the failure is recorded.

For passwords, where guessing is real, the per-address bucket is charged for **failures, not successes**.

## WHY
The intuitive design consults a per-address failure block before the lookup. Behind an office or carrier NAT many people share one address, so a few junk attempts lock out everyone behind it, valid credentials included, and the server reports this as ordinary throttling. For random 256-bit tokens the block protects nothing, because there is nothing to guess. Putting the lookup first makes "a valid credential always succeeds" a property of the control flow rather than something each endpoint has to remember.

## EXAMPLE
Generic sketch:

```text
authenticate(request):
    request_throttle.check(request.address)          # 1. load only

    cred = lookup(request.token)                      # 2. lookup
    if cred is valid:
        return Ok(cred)                               # 3. always succeeds

    if failure_budget.spent(request.address):         # fails anyway: only the cost differs
        return Err(TooManyFailures)                   #    short answer, no further work
    failure_budget.charge(request.address)
    return Err(BadCredentials)
```

## CHECK
- [ ] No failure-based block is consulted before the credential lookup.
- [ ] A test exhausts the failure budget from one address, then presents a valid credential from the same address and gets success.
- [ ] Failure budgets are charged on failures only.
- [ ] Failures are recorded where a rolled-back request transaction cannot lose them.
- [ ] A request-rate limit still bounds total work per address.

## IMPLEMENT
1. List every authentication path (sign-in, bearer token, device credential, API key).
2. Reorder each to throttle, lookup, verdict; move failure-budget checks to the invalid branch.
3. Make the ordering hard to bypass: one shared function, or a type that can only be built by going through it.
4. Add the "valid credential after exhausted budget" test for each path.

## NOTES
The gotcha this answers is LL-G `kb/auth/per-address-failure-block-before-lookup-refuses-valid-credentials.md`. For recording failures see LL-G `kb/auth/failed-attempt-count-in-request-transaction-is-rolled-back.md`. A password step must also not reveal whether the password was right before the second factor: LL-G `kb/auth/password-step-before-second-factor-is-a-password-oracle.md`.
