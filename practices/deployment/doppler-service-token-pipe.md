---
concern: deployment
tech: [doppler, docker]
priority: recommended
source-repo: PlexPlaylist
applies-to: [docker, python, node]
---
# Doppler Service Token Piped Straight to the Server

## PATTERN
A self-hosted container gets exactly one secret: a read-only Doppler service token scoped to one config. Create it with the Doppler CLI and pipe it directly into a mode-600 env file on the server, outside the code directory, so no person ever sees, pastes, or stores it. The image has `doppler run` as its entrypoint and fetches every other secret at each start.

## WHY
Hand-copying secrets into `.env` files leaves stale copies that drift (a stale token in an old `.env` broke sign-in in PlexPlaylist) and puts values in chat, tickets, and shell history. With one scoped, revocable token per host, rotating any secret is "change it in Doppler, restart the container", and the token itself can be replaced and revoked without touching the code.

## EXAMPLE
From PlexPlaylist (`Dockerfile`, `docker-compose.yml`, `Docs/operations/DEPLOYMENT.md`):
```dockerfile
COPY --from=dopplerhq/cli:3.76.1 /bin/doppler /usr/local/bin/doppler
USER app
ENTRYPOINT ["doppler", "run", "--no-check-version", "--"]
CMD ["python", "-m", "plexplaylist"]
```
```yaml
services:
  app:
    init: true              # stop signals reach the app through doppler run
    env_file: ../doppler.env  # DOPPLER_TOKEN only, outside the code dir
```
```bash
set -o pipefail
{ printf 'DOPPLER_TOKEN='; doppler configs tokens create --project plex --config prd --name lancelot-app --plain; } \
  | ssh server 'umask 077; cat > /opt/app/doppler.env'
```

## CHECK
- [ ] The only secret on the host is one read-only service token, in a mode-600 file outside the deployed code
- [ ] The token was created and delivered by pipe; it never appeared on screen or in chat
- [ ] The container entrypoint is `doppler run`, and the image contains no secrets
- [ ] Logs were checked for secret values (count matches, never print them)

## IMPLEMENT
1. Copy the Doppler CLI binary into the image and set `ENTRYPOINT ["doppler", "run", "--"]`
2. Create the token with `--plain` and pipe it over SSH into the env file with `umask 077`
3. Point compose `env_file` at that file and set `init: true`
4. Document rotation: new token by pipe, `docker compose up -d --force-recreate`, revoke the old one

## NOTES
- `docker restart` refetches secrets but keeps the old token; only a recreate rereads `env_file`
- Anyone in the docker group can read the token with `docker inspect`; that group is root-equivalent anyway
- Complements doppler-secrets.md (Doppler as the single source of truth)
