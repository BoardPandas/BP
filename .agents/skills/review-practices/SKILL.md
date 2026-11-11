---
name: review-practices
description: "Review all BP entries for consistency, conflicts, and staleness, then search the web for new practices to add"
---

> Generated from `.claude/skills/review-practices/SKILL.md` by `scripts/sync-codex.mjs`. Edit the source, then run `npm run sync:codex`. Claude Code tool and command names below map to Codex and Antigravity as described in `AGENTS.md` under "Codex & Antigravity runtimes".

You are reviewing the BP best practices knowledge base at `C:\Github\BP` for quality, consistency, and completeness.

This skill has two phases: internal review (existing entries) and external discovery (new entries from the web). Run both unless the user specifies one.

---

## Phase 1: Internal Review

### Step 1: Load all entries

1. Read `C:\Github\BP\llms.txt` to get all concern categories and entry counts
2. For each concern, read its `llms.txt` index
3. Read every entry file listed in those indexes

### Step 2: Check each entry for quality

For each entry, verify:

- **Format compliance** -- Has all required sections: frontmatter (concern, tech, priority, source-repo, applies-to), PATTERN, WHY, EXAMPLE, CHECK, IMPLEMENT
- **Frontmatter accuracy** -- Does the `concern` field match the directory it's in? Are `tech` and `applies-to` tags reasonable?
- **CHECK is testable** -- Each CHECK item should be mechanically verifiable (file exists, config contains X, etc.), not subjective
- **IMPLEMENT is actionable** -- Steps should be concrete and ordered, not vague
- **EXAMPLE has file paths** -- Examples should reference source file locations
- **Priority is justified** -- FOUNDATIONAL should truly be universal; RECOMMENDED should have clear tech-tag scope

### Step 3: Check for conflicts

- **Between BP entries** -- Do any two entries give contradictory advice? (e.g., one says use ESLint, another says use Biome)
- **Between BP and LL-G** -- Read `C:\Github\LL-G\llms.txt` and check for entries that contradict BP recommendations
- **Stale source repos** -- For each entry's `source-repo`, verify the pattern still exists there (quick check, not exhaustive)

### Step 4: Check index integrity

- **Entry counts match** -- Does the master `llms.txt` entry count for each concern match the actual number of bullets in that concern's `llms.txt`?
- **All files linked** -- Does every `.md` file in a concern directory have a corresponding bullet in its `llms.txt`?
- **No broken links** -- Do all relative links in `llms.txt` files resolve to existing files?
- **No orphaned files** -- Are there entry files not listed in any index?

### Step 5: Report internal findings

Output a structured report:

```
## Internal Review Results

### Quality Issues
- <entry slug>: <issue description>

### Conflicts Found
- <entry A> vs <entry B>: <what conflicts>

### Index Issues
- <concern>: count says N but has M entries
- <file>: not linked in any index

### Stale Entries
- <entry slug>: source pattern no longer exists in <source-repo>
```

Fix any index issues (count mismatches, missing links) automatically. Flag quality issues and conflicts for user review.

---

## Phase 2: External Discovery

### Step 1: Search for current best practices

Run parallel web searches for:

1. `"Claude Code" best practices 2026` -- Claude Code-specific patterns
2. `"CLAUDE.md" configuration best practices` -- CLAUDE.md structuring
3. `monorepo best practices 2026 pnpm turborepo` -- monorepo patterns
4. `typescript project configuration best practices 2026` -- TS tooling
5. `docker node.js production best practices 2026` -- deployment patterns
6. `design tokens OKLCH best practices 2026` -- design system patterns
7. `vitest playwright testing best practices 2026` -- testing patterns

### Step 2: Filter and compare

For each search result:
1. Read the page content (use WebFetch on the top 2-3 results per search)
2. Extract concrete, actionable practices (not generic advice)
3. Compare against existing BP entries -- skip anything already covered
4. Compare against the repo inventory -- skip patterns for tech stacks none of the repos use

### Step 3: Draft new entries

For each novel practice found, create a draft entry:

1. Write the entry file to `C:\Github\BP\practices\<concern>\<slug>.md`
2. Add `discovered-by: web-review` to the frontmatter
3. In the NOTES section, include the source URL and date discovered
4. Update the concern's `llms.txt` index
5. Update the master `llms.txt` entry count

### Step 4: Report discoveries

```
## External Discovery Results

### New Entries Created
- <concern>/<slug>: <title> (source: <url>)

### Considered but Skipped
- <topic>: Already covered by <existing-entry>
- <topic>: Not applicable to any repo in inventory

### Existing Entries Worth Updating
- <entry slug>: <what changed in the ecosystem since this was written>
```

---

## Phase 3: Repo Inventory Refresh

Scan `C:\Github\` for all directories that contain a `.git` folder (i.e., are git repos). For each:

1. Check if it's already in `C:\Github\BP\.claude\references\repo-inventory.md`
2. If missing, determine its characteristics (check for package.json, CLAUDE.md, .claude/, Dockerfile, tests, etc.) and add a row to the inventory table
3. If present, verify the tags are still accurate -- check if the repo has gained or lost characteristics (e.g., added Docker, added tests, added .claude/ config since last scan)
4. Update the Tag Groups section at the bottom to reflect any changes

Report:
```
## Inventory Refresh
- Repos scanned: N
- New repos added: <list>
- Repos updated: <list with what changed>
- Repos removed: <list, if directories no longer exist>
```

---

## Phase 4: Deprecation Check

For each entry in BP:

1. Read the `source-repo` from frontmatter
2. Verify the pattern still exists in that repo (quick file/config existence check)
3. If the source pattern has been removed or significantly changed:
   - Add `deprecated: true` and `deprecated-reason: <why>` to the entry's frontmatter
   - If a replacement pattern exists, add `superseded-by: <new-slug>`
   - Update the concern's `llms.txt` to mark the entry as DEPRECATED
4. If an entry already has `deprecated: true`, verify the deprecation is still valid

Report:
```
## Deprecation Check
- Entries validated: N
- Newly deprecated: <list with reasons>
- Already deprecated: N
- Deprecations reversed: <list, if source pattern was restored>
```

---

## Phase 5: Summary

Output a final summary:

```
## BP Review Complete

Internal:
  - Entries reviewed: N
  - Quality issues: N (N auto-fixed, N need review)
  - Conflicts found: N
  - Index fixes applied: N

External:
  - Sources searched: N
  - New entries created: N
  - Updates suggested: N

Inventory:
  - Repos scanned: N
  - New repos added: N
  - Repos updated: N

Deprecation:
  - Entries validated: N
  - Newly deprecated: N

Total entries: N (was M before review)
```
