---
concern: environment
tech: [ssh, docker-compose, doppler, bash]
priority: recommended
applies-to: [docker-compose, ssh, secrets-management]
---
# Pipe deploy secrets over SSH stdin to one remote command, and keep the owner credentials out of the long-running container

## PATTERN
When the deploy host has no secret-manager login, read the secrets on the machine that has one and send them over SSH **standard input** into a single remote command:

1. Read the whole config once (`doppler secrets download --no-file --format env`) into a shell variable and fail early if a required name is missing.
2. Filter to the exact names the deploy needs (a fixed allowlist), so nothing else the secret manager holds is forwarded.
3. For each remote step, `printf '%s\n' "$env_lines" | ssh host 'bash -lc "set -a; . /dev/stdin; set +a; docker compose <args> </dev/null"'`. The values are exported for that one command and gone when it exits: nothing is written to disk on the host, and nothing appears on a command line (the text lives in shell variables and goes through the `printf` builtin, so it is in no `argv`).
4. A secret-bearing SSH call runs exactly one command, because the shell reading stdin is the same stream that carries the values. Give every other command `</dev/null`.
5. Split privilege by container: the long-running service gets only the runtime credentials. The schema owner's credentials (for example `DATABASE_MIGRATE_URL`) go to a throwaway container, `docker compose run --rm -e DATABASE_MIGRATE_URL app migrate`, where `-e NAME` takes the value from the remote shell's environment and never from a command line. The long-running service's `environment:` block does not mention the owner variable.

## WHY
Secrets in a `.env` file on the host outlive the deploy, drift from the source of truth and end up in backups. Secrets on a command line show in `ps`, shell history and process accounting. Stdin is visible to neither. Keeping the owner credentials out of the service container means a compromise of the long-running process cannot alter the schema, and the privileged value exists only for the seconds a migration runs.

## EXAMPLE
`scripts/deploy.sh` (generic sketch):

```bash
all_env=$(doppler secrets download -p myproj -c dev --no-file --format env) || die "cannot read secrets"
for name in "${REQUIRED_VARS[@]}"; do has_var "$all_env" "$name" || die "$name is not set"; done
base_env=$(filter_env "$all_env" "${REQUIRED_VARS[@]}" "${OPTIONAL_VARS[@]}")
migrate_env=$(filter_env "$all_env" "${REQUIRED_VARS[@]}" "${OPTIONAL_VARS[@]}" DATABASE_MIGRATE_URL)
unset all_env

remote_compose() {   # $1 = env lines, $2 = compose args (no $, quotes or backslashes)
  printf '%s\n' "$1" | ssh -o BatchMode=yes deploy-host \
    "bash -lc \"set -a; . /dev/stdin; set +a; cd /srv/app && docker compose $2 </dev/null\""
}

remote_compose "$base_env"    "build app"
remote_compose "$migrate_env" "run -T --rm -e DATABASE_MIGRATE_URL app migrate"
remote_compose "$base_env"    "up -d app"
```

Why every compose command receives the runtime variables, not just `up`: Compose interpolates the whole file for every command and every service, so required (`:?`) variables must be set even for `build`, `run` and `ps`.

`compose.yaml`: the service lists the runtime variables only.

```yaml
services:
  app:
    environment:
      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is not set (runtime role URL)}
      # DATABASE_MIGRATE_URL is deliberately absent: only the one-shot
      # `run -e DATABASE_MIGRATE_URL app migrate` container receives it.
```

## CHECK
- [ ] No `.env` file or token file for deploy secrets exists on the host after a deploy.
- [ ] The deploy script never puts a secret value in an SSH or `docker` argument list, and has no `set -x`.
- [ ] Only an explicit allowlist of variable names is forwarded.
- [ ] The long-running service's compose `environment:` omits the schema owner's credentials; migrations run in a `run --rm` container.

## IMPLEMENT
1. Define `REQUIRED_VARS`, `OPTIONAL_VARS` and the owner variable; write `filter_env` (exact-name match) and `has_var`.
2. Write `remote_compose` as above, one command per SSH call.
3. If the remote login shell is not bash (for example fish), wrap the remote command in `bash -lc "..."` and keep the string free of `$` and backslashes.
4. Move the owner credential to `run -e NAME` for the migrate step and remove it from the service's `environment:`.
5. After a deploy, check the host: no secret files, and `docker inspect` of the service shows no owner variable.

## NOTES
`grep -q` on the left of a `pipefail` pipe turns a match into a failure; test variable presence with a pattern match instead. This entry is for hosts with no secret-manager login. When the host can hold a revocable read-only service token, see `doppler-service-token-pipe.md` in the deployment concern.
