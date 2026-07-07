# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- **feedback-widget template: multiple screenshots by default.** The tier-2 flow now accepts up to `FEEDBACK_SCREENSHOT_MAX_COUNT` (4) screenshots per submission (multi-file picker + multi-image paste, thumbnail grid, per-item remove). `buildFeedbackGithubIssue` renders them all in one `### Screenshots` section, `buildFeedbackSlackMessage` adds a links row, the submission schema takes `screenshotKeys[]` (deprecating `screenshotKey`), and the presign rate limit is sized to the attachment cap so a full set plus a retry fits one window. Backported from the SupportForge deployment; SPEC.md and HANDOFF.md document the two multi-screenshot traps (parallel-upload rate limiting, per-attachment unique repo paths).
- **Synced `.claude/references/hooks-and-settings.md` to Claude Code 2.1.201** from the `claude-code-bootstrap` template: hook structured output (`updatedToolOutput`, `additionalContext`, `reloadSkills`/`sessionTitle`), `Tool(param:value)` parameter matching, HTTP hook custom headers with env-var interpolation, the `PermissionRequest` auto-approval pattern, new settings (`defaultMode` rename, `fallbackModel`, `enforceAvailableModels`, `disableBundledSkills`, `requiresMinimumVersion`), the full six-tier settings precedence chain, and the `ENABLE_PROMPT_CACHING_1H` cache lever.

### Added
- **New `user-feedback` concern** with the entry *Portable In-App Feedback Widget (Button to GitHub Issue)*, plus the full code template at `templates/feedback-widget/` (17 generalized source files + HANDOFF.md install sheet), extracted from the Vigilis dashboard.
- **Added this CHANGELOG**, mirroring the LL-G knowledge-base repo so config changes are tracked here too.
