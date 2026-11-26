---
concern: deployment
tech: [nodejs, typescript, railway, docker]
priority: recommended
applies-to: [any-service-that-deploys-on-push, continuous-deployment-without-staging]
---
# Ship a new feature dark behind exact-match flags that warn on a near miss

## PATTERN
When every push to the main branch deploys to production and there is no staging step, ship new behaviour behind environment flags with these rules:

- A flag is on only for the exact value `true`. Anything else is off.
- It defaults to off, so a deploy with no configuration change is inert.
- With every flag off, the wire behaviour (responses, headers, schemas) is exactly what it was before the change.
- At startup, log each flag's state, and log a warning for any near miss (`True`, `1`, ` true`) so a typo is visible instead of silently disabling the feature.
- Echo only a bounded prefix of a rejected value in the warning; a mistaken value may be a pasted secret.

## WHY
A loose parse (`Boolean(value)`, `value !== "false"`) turns a typo or a stray empty string into the wrong state, and an off feature that is meant to be on looks exactly like a broken feature. Defaulting to off with unchanged behaviour lets the code reach production before it is enabled, and enabling it becomes a one-variable change that can be reverted the same way.

## EXAMPLE
```ts
const FLAGS = [["apps", "APPS_ENABLED"], ["tasks", "TASKS_ENABLED"]] as const;

export function readFlags(env: Record<string, string | undefined> = process.env) {
  const on: Record<string, boolean> = {};
  const warnings: string[] = [];
  for (const [feature, variable] of FLAGS) {
    const raw = env[variable];
    on[feature] = raw === "true";
    if (raw !== undefined && raw !== "" && raw !== "false" && raw !== "true") {
      warnings.push(`${variable} is ${JSON.stringify(raw.slice(0, 16))}; ${feature} stays off: only "true" enables it.`);
    }
  }
  return { on, warnings };
}
// at boot: log the state of each flag, then each warning
```

## CHECK
How to verify if a repo already follows this:
- [ ] New behaviour sits behind a flag that is off unless the value is exactly `true`
- [ ] Startup logs the state of each flag
- [ ] A near-miss value produces a warning that names the variable
- [ ] A test runs the surface with all flags off and asserts the old output byte for byte

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Add one function that reads all flags from the environment and returns the state plus warnings.
2. Gate the new code paths on it, and keep existing output unchanged when off.
3. Log the result at boot.
4. Add tests for the exact-match rule, the near-miss warning and the all-off baseline.

## NOTES
- Remove the flag once the feature is on everywhere, as flags that stay forever become configuration debt.
- Do not echo a full rejected value into logs.
