---
name: add-practice
description: Add a new best practice entry to the BP knowledge base
---

You are adding a new entry to the BP best practices knowledge base at `C:\Github\BP`.

## Step 1: Collect information

Ask the user for the following (you may ask all at once):
1. **Concern** -- which category does this belong in? (claude-config, testing, linting-formatting, error-handling, deployment, monorepo, versioning, safety, documentation, design-systems, environment, knowledge-bases, or a new concern name)
2. **Title** -- short descriptive title (becomes the H1 and the link text in llms.txt)
3. **Pattern** -- what the proven pattern looks like and how it works
4. **Why** -- why this is better than alternatives, what problems it prevents
5. **Example** -- code or config from the source repo (with file paths)
6. **Priority** -- foundational, recommended, or optional (see legend below)
7. **Tech tags** -- comma-separated list of technologies this applies to
8. **Source repo** -- which repo this pattern was extracted from
9. **Applies-to** -- what tech stacks should adopt this (may differ from tech tags)
10. **Check** -- how to verify if a repo already follows this (checklist items)
11. **Implement** -- steps to adopt this in a repo that doesn't have it
12. **Notes** (optional) -- edge cases, caveats, related practices

Priority legend:
- foundational = universal pattern every repo should follow
- recommended = strong pattern for repos with matching tech tags
- optional = nice-to-have improvement

## Step 2: Generate the slug

Convert the title to a slug: lowercase, spaces and punctuation replaced with hyphens, no leading/trailing hyphens.
Example: "Hierarchical CLAUDE.md Structure" -> `hierarchical-claude-md.md`

## Step 3: Create the entry file

Create `C:\Github\BP\practices\<concern>\<slug>.md` with this exact format:

```
---
concern: <concern>
tech: [tech1, tech2]
priority: <foundational|recommended|optional>
source-repo: <repo-name>
applies-to: [tech1, tech2]
---
# <Title>

## PATTERN
<pattern description>

## WHY
<why this is better>

## EXAMPLE
<code or config examples with file paths>

## CHECK
How to verify if a repo already follows this:
- [ ] Check condition 1
- [ ] Check condition 2

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Step one
2. Step two

## NOTES
<notes, or omit the section if none>
```

## Step 4: Update the concern llms.txt

Append a new bullet to `C:\Github\BP\practices\<concern>\llms.txt` under `## Entries`:

```
- [<Title>](<slug>.md): <one-line description>. <PRIORITY>.
```

If the concern folder does not exist yet, create it:
1. Create `C:\Github\BP\practices\<concern>\llms.txt` with:
```
# <Concern> Best Practices

> Proven <concern> patterns.

## Entries

- [<Title>](<slug>.md): <one-line description>. <PRIORITY>.
```

2. Add the new concern to the master `llms.txt` under `## Concerns`:
```
### <Concern>
- [<Concern> index](practices/<concern>/llms.txt): <description> (1 entry)
```

## Step 5: Update master llms.txt entry count

Read `C:\Github\BP\llms.txt`. Find the bullet for this concern and increment the entry count in parentheses: `(N entries)` -> `(N+1 entries)`.

If this is a new concern (Step 4 path), the entry was already added in Step 4 -- no increment needed.

## Step 6: Confirm

Output the path of the created entry file and confirm both index files were updated.
