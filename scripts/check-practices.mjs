#!/usr/bin/env node
/**
 * BP structural guard. BP had no guard script at all, so every "(N entries)" count in
 * the master index was maintained by hand, in a second place, and verified by nobody.
 *
 * What this catches, all of it silent:
 *
 *   1. COUNT DRIFT   -- the master index claiming a number the shelf does not have.
 *   2. ORPHAN        -- a file on disk that no llms.txt links. A 13 KB runbook sat in
 *                       practices/claude-config/ that nothing referenced; the only way
 *                       to find it was to already know its path.
 *   3. SCHEMA DRIFT  -- concern/tech/priority missing, or a concern that disagrees with
 *                       the folder it lives in.
 *   4. MISSING CHECK/IMPLEMENT -- these two sections are what /apply-practice reads. An
 *                       entry without them cannot be applied mechanically, and the skill
 *                       has nothing to say about it rather than failing loudly.
 *   5. CR / BLANK BLOAT -- see .gitattributes. LL-G's master index quadrupled this way.
 *
 * Entry counting follows the "## Entries" heading only, so a shelf can list companion
 * files (runbooks, scripts) in their own section without inflating its count.
 *
 * Node built-ins only. Exit 0 = clean, 1 = problems.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const MASTER = "llms.txt";
const ROOT = "practices";
const MASTER_BUDGET_BYTES = 12000;
const PRIORITIES = new Set(["foundational", "recommended", "optional"]);
const RATIONALE = ["WHY", "CONTEXT"]; // CONTEXT predates WHY in some entries and serves the same role

const errors = [];
const warnings = [];
const exists = (p) => { try { statSync(p); return true; } catch { return false; } };

if (!exists(MASTER) || !exists(ROOT)) {
	console.error("check-practices: run from the root of a BP checkout (needs ./llms.txt and ./practices/).");
	process.exit(1);
}

// Match only the (target) half: titles contain brackets, and a title capture of
// `\[([^\]]+)\]` stops at the wrong one and silently finds nothing.
const linkTargets = (s) => [...s.matchAll(/\]\(([^)\s]+\.(?:md|mjs))\)/g)].map((m) => m[1]);
const isBullet = (l) => /^- (?:(?:FOUNDATIONAL|RECOMMENDED|OPTIONAL)\s+)?\[/.test(l);
const longestBlankRun = (lines) => {
	let run = 0, max = 0;
	for (const l of lines) { if (l.trim() === "") { run++; max = Math.max(max, run); } else run = 0; }
	return max;
};

const masterRaw = readFileSync(MASTER);
const master = masterRaw.toString("utf8");
if (masterRaw.length > MASTER_BUDGET_BYTES) {
	errors.push(`${MASTER}: ${(masterRaw.length / 1024).toFixed(1)} KB exceeds the ${MASTER_BUDGET_BYTES / 1000} KB budget. Every session loads this; one clause per concern.`);
}
if (master.includes("\r")) errors.push(`${MASTER}: contains CR bytes (see .gitattributes).`);

const claimed = new Map();
for (const m of master.matchAll(/^- \[[^\]]+\]\(practices\/([a-z0-9-]+)\/llms\.txt\)(.*)$/gm)) {
	const c = m[2].match(/\((\d+) entr(?:y|ies)\)\s*$/);
	claimed.set(m[1], c ? Number(c[1]) : null);
}

const concerns = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
let total = 0;

for (const concern of concerns) {
	const dir = join(ROOT, concern);
	const idxPath = join(dir, "llms.txt");
	if (!exists(idxPath)) { errors.push(`${dir}: no llms.txt, so this concern is unreachable.`); continue; }

	const idxRaw = readFileSync(idxPath);
	const idx = idxRaw.toString("utf8");
	if (idx.includes("\r")) errors.push(`${idxPath}: contains CR bytes.`);
	if (longestBlankRun(idx.split("\n")) > 1) errors.push(`${idxPath}: run of 2+ consecutive blank lines (CR expansion damage).`);
	if (!claimed.has(concern)) errors.push(`${MASTER}: no line for practices/${concern} -- that shelf is invisible to anything loading only the master index.`);

	// Entries live under "## Entries"; later sections (companion files) are reachable but not counted.
	const lines = idx.split("\n");
	const start = lines.findIndex((l) => /^##\s+Entries\b/.test(l));
	if (start === -1) { errors.push(`${idxPath}: no "## Entries" heading, so entries cannot be counted.`); continue; }
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }

	const entryFiles = [];
	for (const line of lines.slice(start, end)) {
		if (!isBullet(line)) continue;
		const t = linkTargets(line);
		if (t.length) entryFiles.push(t[t.length - 1]);
	}
	total += entryFiles.length;
	if (claimed.get(concern) !== entryFiles.length) {
		errors.push(`${MASTER}: practices/${concern} claims ${claimed.get(concern)} entries, shelf lists ${entryFiles.length}.`);
	}

	const reachable = new Set(linkTargets(idx));
	for (const f of readdirSync(dir)) {
		if (f === "llms.txt" || (!f.endsWith(".md") && !f.endsWith(".mjs"))) continue;
		if (!reachable.has(f)) errors.push(`${dir}/${f}: on disk but nothing in ${idxPath} links it, so nobody finds it.`);
	}

	for (const file of entryFiles) {
		const rel = `${dir}/${file}`;
		if (!exists(rel)) { errors.push(`${idxPath}: lists ${file}, which does not exist.`); continue; }
		// Entry files are checked for CRs too, not just the indexes. A contents-API
		// write stores bytes verbatim -- no git clean filter runs -- so .gitattributes
		// cannot stop CRs arriving that way; only a check can. LL-G had exactly this,
		// and its guard initially inspected only llms.txt, so an entry CR passed clean.
		const rawEntry = readFileSync(rel);
		if (rawEntry.includes(13)) errors.push(`${rel}: contains CR bytes (see .gitattributes).`);
		const body = rawEntry.toString("utf8");
		const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
		if (!fm) { errors.push(`${rel}: no YAML frontmatter.`); continue; }
		const field = (n) => { const m = new RegExp(`^${n}:[ \t]*(.*)$`, "m").exec(fm[1]); return m ? m[1].trim() : null; };

		const c = field("concern");
		if (!c) errors.push(`${rel}: frontmatter has no concern:.`);
		else if (c !== concern) errors.push(`${rel}: concern "${c}" disagrees with its folder practices/${concern}.`);
		if (!field("tech")) errors.push(`${rel}: frontmatter has no tech:.`);
		const p = field("priority");
		if (!p) errors.push(`${rel}: frontmatter has no priority:.`);
		else if (!PRIORITIES.has(p.toLowerCase())) errors.push(`${rel}: priority "${p}" is not foundational/recommended/optional.`);

		// Provenance is a nicety, not a gate: three entries predate the convention and
		// their source repo is not recorded anywhere, and guessing it would be worse.
		for (const opt of ["source-repo", "applies-to"]) if (!field(opt)) warnings.push(`${rel}: no ${opt}:.`);

		const heads = body.split(/\r?\n/).map((l) => l.trim());
		for (const s of ["PATTERN", "CHECK", "IMPLEMENT"]) {
			if (!heads.includes(`## ${s}`)) errors.push(`${rel}: no "## ${s}" section${s === "CHECK" || s === "IMPLEMENT" ? " -- /apply-practice reads this one" : ""}.`);
		}
		if (!RATIONALE.some((s) => heads.includes(`## ${s}`))) errors.push(`${rel}: no "## WHY" or "## CONTEXT" section.`);
	}
}

console.log(`check-practices: ${concerns.length} concerns, ${total} entries, master index ${(masterRaw.length / 1024).toFixed(1)} KB`);
if (warnings.length) {
	console.log(`\n${warnings.length} warning(s) (not fatal):`);
	for (const w of warnings) console.log(`  - ${w}`);
}
if (!errors.length) { console.log("\ncheck-practices OK: counts agree, every file is reachable, schema holds."); process.exit(0); }
console.error(`\ncheck-practices FAILED: ${errors.length} problem(s):`);
for (const e of errors) console.error(`  - ${e}`);
process.exit(1);
