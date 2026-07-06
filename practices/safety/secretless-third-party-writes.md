---
concern: safety
tech: [desktop, wpf, dotnet, electron, cli, static-site, no-backend]
priority: recommended
source-repo: DeafDirectionalHelper
applies-to: [wpf, electron, tauri, cli-tools, static-sites, browser-extensions]
---
# Secretless Third-Party Writes for Backend-less Clients

## PATTERN
When a client that ships with no server of its own (a desktop app, CLI tool, browser extension, or static site) needs to create a record in an authenticated third-party system (a GitHub issue, a Jira ticket, a support form), don't embed that system's API credential in the client to call its write API directly. Instead:

1. Compose the payload client-side (title, labels/tags, and a longer free-text body).
2. Put the long-form body on the **clipboard**.
3. Open the third-party system's own **web creation UI** via a deep link, with only short/safe fields prefilled through query params (title, labels) — never the full body, which can exceed URL length limits anyway.
4. The user pastes the clipboard content into the opened form and submits it themselves, under their own authenticated session.

## WHY
A shipped client (a compiled .exe, an Electron bundle, a browser extension, a static site's JS) is not a trusted execution environment — any credential embedded in it can be extracted (decompile the assembly, read the bundle, view page source). The reference architecture for this kind of feature (client -> your server holding the token -> third-party API) assumes a server exists; when it doesn't, adding one just to protect a single write-path credential is disproportionate. Shifting the actual "create the record" action to the user's own browser session, authenticated against the third party themselves, removes the credential from the threat model entirely — there is nothing to leak, and no per-user rate limiting or ownership-scoping is needed because the third party's own web app already handles both for its authenticated users.

## EXAMPLE
```csharp
// Services/FeedbackSender.cs (DeafDirectionalHelper, WPF, no server)
public static FeedbackSendResult Send(FeedbackReport report)
{
    var clipboardOk = TrySetClipboard(report.Body); // long-form body, unbounded by URL limits

    var url = $"https://github.com/{TriageRepo}/issues/new" +
              $"?title={WebUtility.UrlEncode(report.Title)}" +
              $"&labels={WebUtility.UrlEncode(string.Join(',', report.Labels))}";
    var browserOk = TryOpenBrowser(url); // Process.Start, UseShellExecute = true

    if (browserOk) return FeedbackSendResult.OpenedBrowser;
    return clipboardOk ? FeedbackSendResult.ClipboardOnly : FeedbackSendResult.Failed;
}
```
The dialog then instructs the user: "Paste (Ctrl+V) into the issue body and click Submit." Both the clipboard write and the browser-open are wrapped in try/catch with graceful fallback (show the raw text in a selectable box if both fail) — there is no code path where the feature can silently fail to give the user *something* actionable.

## CHECK
- [ ] Does this client ship without a server component (desktop app, CLI, browser extension, static site)?
- [ ] Does a feature need to write into an authenticated third-party system (issue tracker, ticketing, forms)?
- [ ] Is there currently (or is there a plan to add) an API token/key embedded in the client to make that write directly?

If all three are true, this pattern replaces the embedded credential.

## IMPLEMENT
1. Identify the third party's own hosted creation UI and whether it supports prefilling short fields via URL/query params (GitHub: `?title=&labels=`; most ticketing/form tools have an equivalent).
2. Split the payload: short fields go in the URL (title, tags/labels); everything long-form (description, diagnostics, stack traces) goes on the clipboard.
3. Redact the clipboard body if it's headed anywhere that isn't already private to the reporting user (tokens, emails, long hex/hashes) — see also this repo's redaction pattern if content might otherwise carry secrets.
4. Wrap both the clipboard write and the URL-open in try/catch; define an explicit fallback UI state (e.g., a copyable text box) for when both fail.
5. Tell the user what to do next in the same screen ("paste this, then submit") — the hand-off should not be implicit.

## NOTES
- This does not apply once a server already exists in the architecture for other reasons — at that point, holding the credential server-side (the "reference" pattern) is simpler and gives you server-side validation, rate limiting, and attachment upload for free.
- Screenshot/attachment upload is a corollary: most ticketing UIs (GitHub included) accept a pasted or dragged image directly in their own web form, so there's usually no need to build a presigned-upload path just to attach a screenshot either.
- Auto-discovered by practice-scout from DeafDirectionalHelper's feedback-widget adaptive install (2026-07-06): the BP `templates/feedback-widget/` reference assumes a Next.js server holding a GitHub PAT; this repo has no server, so RULE 4 flagged the substitute pattern as worth capturing rather than being repo-specific.
