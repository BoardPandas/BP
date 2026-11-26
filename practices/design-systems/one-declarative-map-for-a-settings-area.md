---
concern: design-systems
tech: [react, nextjs, typescript]
priority: recommended
applies-to: [nextjs, react, admin-consoles, settings-areas]
---
# One declarative map for a settings area: nav, home, breadcrumbs, search and access all derive from it

## PATTERN
Describe every section and page of a large configuration area once, as plain
data, and derive every surface that lists or names a page from that data.

Each page entry carries: a stable id, label, href, section, a one-sentence
purpose, a scope ("who does a change affect"), a **named access rule** (a pure
function of the viewer), its tabs (each optionally with its own access rule),
the named settings on it (label, keywords, anchor), and the names and places it
used to go by. Nothing else in the app restates a label, a purpose or a gate.

Consumers are thin and derived:

- **Navigation**: `sectionsFor(viewer)` -> the nav tree. A section shows when
  the viewer can open at least one page in it.
- **Home page**: the same call renders one card per section.
- **Page header**: a shared frame takes a page id and reads breadcrumb, title,
  purpose, scope chip and tab strip from the map. Tabs the viewer cannot open
  are not offered.
- **Search**: an index built from pages, tabs, registered settings and former
  names, filtered by the same rules, feeding every search surface.
- **Guards and titles**: route guards, tab titles and the browser title read
  the derived nav tree, so they follow automatically.

## WHY
Without the map, each consumer keeps its own list and they drift: a page is
renamed in the nav but not in search; a tab is hidden in the UI but still
offered as a search result to someone who cannot open it; a breadcrumb names a
section that no longer exists. Each drift is silent.

With it:

- Moving, merging or renaming a page is a data edit, and every surface follows.
- Access is stated once per page and tab, by name, so "who can see this" is
  answerable by reading one file, and a test can walk every viewer.
- "Former names" make a reorganisation survivable: search still answers to
  what people have always called a thing and says where it went.
- New surfaces (a home page, a "needs attention" list, dots on nav rows) are
  cheap, because the data they need already exists.

## EXAMPLE
```ts
// lib/settings/map-types.ts
export interface AccessRule { id: string; allows: (viewer: Viewer) => boolean }
export interface SettingsPage {
  id: string; label: string; href: string; section: SectionId
  purpose: string; scope: Scope; access: AccessRule
  tabs?: { id: string; label: string; access?: AccessRule; formerly?: FormerName[] }[]
  settings?: { label: string; keywords: string[]; anchor: string; tab?: string; access?: AccessRule }[]
  formerly?: { label: string; location?: string }[]
  parent?: string          // a detail page with no nav row of its own
  matchPrefix?: boolean; matchExclude?: string[]
}

// lib/settings/map-access.ts: the gates, by name, each with the reason it exists
export const siteAdmin: AccessRule = { id: 'siteAdmin', allows: ({ isAdmin }) => isAdmin }
export const anyOf = (...rules: AccessRule[]): AccessRule => ({
  id: `anyOf(${rules.map((r) => r.id).join(',')})`,
  allows: (viewer) => rules.some((r) => r.allows(viewer)),
})

// lib/settings/map.ts
export function sectionsFor(viewer: Viewer) {
  return SECTIONS.map((section) => ({
    section,
    pages: PAGES.filter((p) => p.section === section.id && p.access.allows(viewer)),
  })).filter(({ pages }) => pages.length > 0)
}

// lib/nav/settings.ts: the nav keeps its old signature and becomes a projection
export const settingsNav = (viewer: Viewer) =>
  sectionsFor(viewer).map(({ section, pages }) => ({ section: section.label, items: pages.map(navItem) }))
```
```tsx
// A page restates nothing: the frame reads the map.
<SettingsPage page="email">{({ tab }) => /* tab panels */}</SettingsPage>
```
```ts
// A merged page keeps each part's gate: the page is the union, each tab its own rule.
{ id: 'email', access: anyOf(ticketsAdmin, siteAdmin),
  tabs: [{ id: 'inbound', label: 'Routing', access: anyOf(ticketsAdmin, siteAdmin) },
         { id: 'blocked', label: 'Blocked senders', access: ticketsAdmin,
           formerly: [{ label: 'Blacklists' }] }] }
```

## CHECK
How to verify if a repo already follows this:
- [ ] One module (or folder of data files) lists every page of the area with label, href, section and access rule; no second hand-maintained list of the same pages exists for nav, search or breadcrumbs.
- [ ] Access rules are named exports with a comment saying why, not inline booleans repeated per consumer.
- [ ] The nav, the page header/breadcrumb and the search index are computed from that module.
- [ ] A test asserts the exact set of pages each kind of viewer gets, and a map-integrity test checks unique ids/hrefs, a purpose and scope on every page, and that every setting's tab exists.
- [ ] Renamed or merged pages carry their former names, and a test proves each old name finds the new home.

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Write the types and move today's nav entries into the map **without changing a label, href or gate**. Lift each access check unchanged into a named rule.
2. Derive the existing nav function from the map, keeping its signature. Before and after, dump the nav for every role and permission combination and require the two dumps to be identical.
3. Add the shared page frame that takes a page id and renders breadcrumb, title, purpose, scope and tabs from the map; convert pages to it one group at a time.
4. Build the search index from the map (pages, tabs, former names), filtered by the same rules, and feed every search surface from it.
5. Only then reorganise: merge, split, rename and move pages as data edits, adding `formerly` each time and a redirect for each retired URL.
6. Register individual settings (label, keywords, anchor) page by page, with a test that every anchor exists as an element id.

## NOTES
- Keep the map free of React and data fetching so tests, server components and scripts can import it.
- The map is presentation. The API stays the access boundary; the map's rules decide what is offered, and each component keeps the check it had.
- A gate the viewer object cannot express (a platform-level role, a per-record capability) stays in the component; give the frame an escape hatch for page-supplied tabs rather than widening the viewer type.
- A page given only a "read-only" reason still shows its tabs: a page that must show nothing to a viewer should redirect or not render.
- When a page leaves the area entirely, its former name has to move to wherever its new nav row lives, or search loses it.
- Split the data by section once a file passes a few hundred lines; keep registered settings in sibling files.
