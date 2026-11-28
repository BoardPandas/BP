---
concern: environment
tech: [bash, ssh, base64, docker-compose, secrets]
priority: recommended
applies-to: [ssh, deploy-scripts, secrets-management, docker-compose]
---
# Prove secret transport with awkward dummy values before sending a real secret, and send secrets as base64 lines in a piped script

## PATTERN
Two rules for getting a secret from the machine that holds it to the process that needs it:

1. **Prove the path first with dummy values chosen to break it.** Before any real secret is sent, push values containing single and double quotes, `$`, backticks, backslashes, spaces and a JSON document through the exact same path, and compare what arrives with what was sent (compare hashes, not printed values). Only a byte-for-byte match clears the path for real use.
2. **Send each secret as a base64 line inside a script piped to the remote shell.** The script text travels on standard input; each value is base64-encoded on the sending side and decoded into an exported variable on the receiving side. Never put a secret in `argv`, in an env file, or type or paste it into an interactive shell.

## WHY
Every layer between two machines parses text: the local shell, ssh, the remote login shell, an env-file reader, a compose file. Each has its own quoting rules, and none of the env-file quoting forms is fully literal, so a secret with a quote or a `$` in it can arrive altered with no error. The service then fails to authenticate much later, and the debugging tends to involve printing the secret. Awkward dummy values find the problem while nothing sensitive is in flight. base64 output contains no character that any of those layers treats specially, so the value that arrives is the value that was sent. Standard input is visible to neither `ps` nor shell history; `argv` is visible to both; an env file outlives the deploy.

## EXAMPLE
`scripts/send-secrets.sh` (generic sketch; this shape was run with the dummy values below and all arrived byte-for-byte):

```bash
NAMES=(DATABASE_URL SIGNING_KEY)          # exact allowlist of variables to forward

send() {
  {
    printf 'set -euo pipefail\n'
    for name in "${NAMES[@]}"; do
      # printf is a builtin: the value is never in any process's argv.
      printf 'export %s="$(printf %%s %s | base64 -d)"\n' \
        "$name" "$(printf '%s' "${!name}" | base64 -w0)"
    done
    printf 'cd /srv/app && docker compose up -d </dev/null\n'
  } | ssh -o BatchMode=yes deploy-host 'bash -s'
}
```

Dummy run first, with the same function and a remote command that hashes instead of deploying:

```bash
DATABASE_URL="it's \"quoted\" \$HOME \\n back\\slash \`tick\`"
SIGNING_KEY='{"k":"v with spaces","n":[1,2]}'
# remote side: for n in DATABASE_URL SIGNING_KEY; do printf '%s' "${!n}" | sha256sum; done
# local side:  the same loop; the two outputs must be identical
```

## CHECK
- [ ] The transport has been exercised with dummy values containing quotes, `$`, backticks, backslashes and JSON, and the received hashes matched.
- [ ] That test used the same script, hosts and shells as the real path.
- [ ] Secrets cross as base64 lines in a script on standard input.
- [ ] No secret appears in a command line, an env file on the host, or an interactive session.
- [ ] The script has no `set -x` and prints no values.

## IMPLEMENT
1. Write the sender as above with an explicit allowlist of names.
2. Add a `--self-test` mode that sends the awkward dummy values and compares hashes from both ends.
3. Run the self-test against the real host; fix any mismatch before continuing.
4. Switch the script to the real values.
5. Re-run the self-test whenever the path changes (a new host, a different login shell, a new wrapper).

## NOTES
`$(...)` strips trailing newlines, so a value that must end in a newline needs different handling. If the remote side reads `NAME=value` lines itself, split with parameter expansion (`${line%%=*}`, `${line#*=}`): `IFS== read name value` drops a trailing `=` of base64 padding. Related: `pipe-deploy-secrets-over-ssh-stdin.md` on this shelf (allowlisting, one command per secret-bearing call, keeping owner credentials out of the long-running container), and LL-G `kb/docker/compose-static-ipv4-address-needs-ip-range-and-env-files-are-never-literal.md`.
