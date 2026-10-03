---
concern: claude-config
tech: [claude-code]
priority: recommended
source-repo: 60k-mono
applies-to: [all]
---
# Hook Configuration for Automated Enforcement

## PATTERN
Use Claude Code hooks in `.claude/settings.json` to automate enforcement of repo standards. Key hook events: PreToolUse (gate dangerous operations), PostToolUse (auto-lint after writes), Stop (audible bell when done), Notification (alert on permission prompts).

## WHY
Written instructions in CLAUDE.md can be overlooked. Hooks enforce rules at execution time -- if a hook rejects an action, it cannot proceed. This makes critical safety rules (like permissions gates) and quality rules (like auto-formatting) mechanically enforced rather than advisory.

## EXAMPLE
Adapted from 60k-mono (`.claude/settings.json`). The original matcher was `"Bash(git commit*)"`, which is permission-rule syntax: in a matcher it matches nothing and the hook never runs. The tool name goes in `matcher`, the argument filter in `if`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(git commit*)",
            "command": "echo 'Committing changes...'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '\\a'"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '\\a'"
          }
        ]
      }
    ]
  }
}
```

From tech-assistant (`.claude/settings.json`) -- PreToolUse gates that call project scripts. Every script path is anchored at `$CLAUDE_PROJECT_DIR`: a hook runs in the session's current directory, which follows every `cd`, so a cwd-relative `bash .claude/hooks/x.sh` fails from any subfolder and the call goes through ungated:
```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/check-prerequisites.sh\""
    },
    {
      "type": "command",
      "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/scripts/require-release-authorization.sh\"",
      "statusMessage": "Checking release authorization..."
    }
  ]
}
```

## CHECK
How to verify if a repo already follows this:
- [ ] `.claude/settings.json` exists with a `hooks` section
- [ ] Stop hook with audible bell is configured
- [ ] Notification hook with audible bell is configured
- [ ] PreToolUse hooks exist for any critical safety gates
- [ ] Every `matcher` is a bare tool name (`Bash`, `Write|Edit`), never `Tool(pattern)`
- [ ] Every script path in a hook command (arguments and env assignments too) is anchored at `"$CLAUDE_PROJECT_DIR"`

## IMPLEMENT
1. Create or update `.claude/settings.json` with basic hook structure
2. Add Stop and Notification hooks with `echo '\\a'` for audible alerts
3. Identify any repo-specific safety gates that need PreToolUse enforcement
   - Call each script as `bash "$CLAUDE_PROJECT_DIR"/.claude/scripts/<name>.sh`, never by a cwd-relative path
   - Filter arguments with `if: "Bash(git commit*)"` on the handler, not in `matcher`
4. Add PostToolUse hooks for auto-formatting if the repo uses Biome/ESLint

## NOTES
- Hook types: `command` (shell), `http` (POST to URL), `prompt` (single-turn LLM yes/no), `agent` (multi-turn subagent)
- Hook events: PreToolUse, PostToolUse, PostToolUseFailure, Stop, Notification, SubagentStart, SubagentStop, PreCompact, SessionStart, SessionEnd, UserPromptSubmit, PermissionRequest
- `settings.local.json` supports `disableAllHooks` kill switch for debugging
- A hook's cwd is neither the repo root nor the target of the command it inspects. Anchor script paths at `$CLAUDE_PROJECT_DIR` and resolve the target repo from the command itself. See LL-G `kb/claude-code/hook-script-cwd-relative-path.md`, `hook-cwd-is-not-the-commit-target-repo.md` and `hook-matcher-tool-names-only.md`.
