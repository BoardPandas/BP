---
concern: versioning
tech: [node, typescript]
priority: recommended
source-repo: MCP
applies-to: [node, typescript]
---
# Changelog Enforcement via Commit Rules

## PATTERN
Use a path-scoped `.claude/rules/commit-changelog.md` rule that requires CHANGELOG.md updates on every commit. The rule fires before `git commit` and enforces Keep a Changelog format with categorized entries (Added, Changed, Fixed, Removed, Security).

## WHY
Changelogs written after the fact are incomplete and lack context. By enforcing updates at commit time, every change is documented while the context is fresh. The path-scoped rule makes this automatic -- Claude cannot commit without updating the changelog first.

## EXAMPLE
From MCP (`.claude/rules/commit-changelog.md`):
```markdown
Before every `git commit`, you MUST:

## 1. Update CHANGELOG.md
- Add entries under `[Unreleased]` using Keep a Changelog sections:
  - **Added** -- new features or capabilities
  - **Changed** -- changes to existing functionality
  - **Fixed** -- bug fixes
  - **Removed** -- removed features
  - **Security** -- vulnerability fixes
- Review staged changes (`git diff --cached`) to determine what changed
- Write entries from the user's perspective, not implementation details

## 2. Bump Version in package.json
(see Major.Minor.Patch.Build pattern)

## 3. Stage Both Files
git add CHANGELOG.md package.json
```

## CHECK
How to verify if a repo already follows this:
- [ ] `CHANGELOG.md` exists with Keep a Changelog format
- [ ] `.claude/rules/commit-changelog.md` (or equivalent) exists
- [ ] CHANGELOG.md has an `[Unreleased]` section
- [ ] Recent commits include corresponding CHANGELOG.md updates

## IMPLEMENT
1. Create `CHANGELOG.md` with initial structure:
   ```markdown
   # Changelog
   All notable changes documented per [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).

   ## [Unreleased]
   ```
2. Create `.claude/rules/commit-changelog.md` with the enforcement rule
3. Verify by making a test commit -- Claude should update CHANGELOG.md automatically

## NOTES
- Pairs with `versioning/major-minor-patch-build` for version bumps
- Write entries from the user's perspective ("Add dark mode toggle") not implementation details ("Modify ThemeProvider component")
- The `[Unreleased]` section collects entries between releases; move them to a versioned section when cutting a release
