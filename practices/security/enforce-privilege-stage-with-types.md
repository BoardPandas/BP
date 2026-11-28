---
concern: security
tech: [rust, typescript, type-system, sessions, authentication]
priority: recommended
applies-to: [web-apps, authentication, session-management, typed-languages]
---
# Enforce privilege stage with types, so a handler cannot forget a check

## PATTERN
Make the stage of privilege a caller has reached part of the **type** a handler receives, instead of a field the handler must remember to inspect:

1. **Distinct session types per stage.** A full session, an enrolment session (signed in, second factor not yet set up) and a pending session (password accepted, second factor not yet given) are three different types. Each can only be produced by the code that verifies that stage.
2. **Handlers declare the stage they need in their signature.** A route that changes account settings takes the full-session type. It cannot be called with a pending session, because the types do not match.
3. **Private "proof" types for mandatory steps.** A credential check takes an `Attempt` value whose constructor is private to the throttle module. The only way to obtain one is to go through the throttle, so no code path can verify a credential without it.

## WHY
The alternative is a single session object with a `stage` or `mfa_verified` field and an `if` at the top of each handler. Every new handler is a chance to forget the `if`, and a forgotten check compiles, passes the happy-path tests and ships. With stage types the mistake is a compile error. The same applies to steps that must happen first, such as throttling: when the function needs a value that only the throttle can construct, skipping the throttle is impossible rather than merely discouraged.

## EXAMPLE
Generic Rust sketch:

```rust
pub struct FullSession { user: UserId /* ... */ }        // constructed only after the second factor
pub struct EnrolmentSession { user: UserId /* ... */ }   // may only reach enrolment routes
pub struct PendingSession { user: UserId /* ... */ }     // may only reach the second-factor route

// Each type is its own extractor; a route gets exactly the stage it names.
async fn change_password(session: FullSession, form: Form<ChangePassword>) -> Response { /* ... */ }
async fn enrol_authenticator(session: EnrolmentSession, form: Form<Enrol>) -> Response { /* ... */ }

mod throttle {
    pub struct Attempt { _private: () }                   // no public constructor
    pub async fn admit(addr: IpAddr) -> Result<Attempt, Throttled> { /* ... */ }
}
// Cannot be called without having gone through throttle::admit:
pub async fn verify_password(attempt: throttle::Attempt, user: &User, password: &str) -> Verdict { /* ... */ }
```

## CHECK
- [ ] Sessions at different privilege stages are different types, not one type with a flag.
- [ ] Each stage type can only be constructed by the code that verifies that stage.
- [ ] Handlers take the stage type they require as a parameter; none inspects a stage flag by hand.
- [ ] Mandatory first steps (throttle, origin check) are represented by a value with a private constructor that the guarded function requires.

## IMPLEMENT
1. List the privilege stages and which routes each may reach.
2. Introduce one type per stage with private fields and a single constructor in the verifying module.
3. Change handler signatures to take the type they need; delete the manual stage checks the compiler now makes redundant.
4. For each mandatory first step, add a private proof type and require it in the guarded function's signature.

## NOTES
In TypeScript the same effect comes from branded types and unexported constructors. Rotating the session value at each stage change is a separate requirement: LL-G `kb/auth/session-identifier-not-rotated-at-privilege-change.md`.
