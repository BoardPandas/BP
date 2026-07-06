---
concern: security
tech: [nextjs, middleware, opengraph]
priority: recommended
source-repo: supportforge-platform
applies-to: [nextjs, auth-gated-spa, react]
---
# Link-Preview Bot Passthrough for Auth-Gated Apps

## PATTERN
Auth middleware redirects unauthenticated requests to /login, so when a user pastes an app URL into Teams/Slack/Outlook, the unfurl bot gets the login page and every link shows the same generic preview card. To get per-resource preview cards without exposing data:

1. In the auth middleware, allow GET requests from known link-preview user agents through to the page shell instead of redirecting them, scoped to the route family that benefits (e.g. `/tickets`).
2. Make the target page a Server Component with `generateMetadata` that builds the title from URL parameters ONLY (e.g. "Ticket #225227"). Never fetch or embed resource data: the bot is unauthenticated, and sequential ids make anything in the meta tags a public enumeration oracle.
3. The served shell must be a client-rendered page whose data all loads through authenticated APIs, so a spoofed bot UA gets an empty skeleton.

Rich previews with actual resource details (subject, status) require a chat-platform app with authenticated unfurling (Teams message extension, Slack link unfurl API), not meta tags.

## WHY
- The naive fix (put resource details in OG tags) silently publishes private data: every unfurl bot, scraper, and curl user can read the meta tags without a session.
- Bot-UA passthrough exposes nothing new: the JS bundle under /_next is already public, and the shell carries no data.
- Scoping the passthrough to one route family and GET only keeps the auth bypass surface minimal and auditable.

## EXAMPLE
From supportforge-platform `dashboard/src/middleware.ts`:
```ts
// User agents of link-preview fetchers: Teams (SkypeUriPreview), Outlook
// (BingPreview), Slack, Discord, X/Twitter, Facebook, LinkedIn, Telegram, WhatsApp.
const UNFURL_BOT_UA =
  /skypeuripreview|bingpreview|slackbot|slack-imgproxy|discordbot|twitterbot|facebookexternalhit|linkedinbot|telegrambot|whatsapp/i

// Inside middleware(), before the session check:
if (
  request.method === 'GET' &&
  pathname.startsWith('/tickets') &&
  UNFURL_BOT_UA.test(request.headers.get('user-agent') || '')
) {
  return NextResponse.next()
}
```

`dashboard/src/app/(dashboard)/tickets/[ticketId]/page.tsx` (Server Component; `generateMetadata` is silently ignored in Client Components, see LL-G nextjs/metadata):
```tsx
export async function generateMetadata({ params }: { params: Promise<{ ticketId: string }> }): Promise<Metadata> {
  const { ticketId } = await params
  const label = /^\d+$/.test(ticketId) ? `Ticket #${ticketId}` : 'Ticket'
  return {
    title: `${label} · SupportForge`,
    description: 'Open this support ticket in the SupportForge dashboard.',
    openGraph: { title: `${label} · SupportForge`, siteName: 'SupportForge', type: 'website', images: ['/logo.png'] },
  }
}
```
Set `metadataBase` in the root layout so relative OG image paths resolve to absolute production URLs.

## CHECK
How to verify if a repo already follows this:
- [ ] Pasting a deep link into Teams/Slack shows a resource-specific card, not the login page's generic card
- [ ] The page serving that card is a Server Component with `generateMetadata`
- [ ] The metadata is built only from URL segments, never from a data fetch
- [ ] Middleware passthrough is limited to GET + known bot UAs + the specific route prefix
- [ ] Fetching the URL with a bot UA and no cookies returns HTML with no resource data in it

## IMPLEMENT
1. Identify the route family whose links get pasted into chat (tickets, orders, documents).
2. Add a bot-UA regex and a scoped GET passthrough in the auth middleware, before the session check.
3. Convert the route's page.tsx to a Server Component wrapper (move interactivity into a client child) and add `generateMetadata` using only URL params.
4. Add `metadataBase` to the root layout metadata.
5. Verify with `curl -A "SkypeUriPreview" <url>` (expect 200 + per-resource OG tags) and a normal UA (expect redirect to login).

## NOTES
- Teams unfurls via SkypeUriPreview; Outlook via BingPreview. Test the platforms your org actually uses.
- Anyone can spoof a bot UA; that is fine by design because the shell has no data. Do not be tempted to loosen the "URL params only" rule later, since that is the entire security boundary.
- If product wants subject/status in the card, that is a chat-platform app project (authenticated unfurl), not a meta-tag change.
- Auto-discovered by practice-scout from supportforge-platform commit d7171d0e
