# Staging site with client comments: spec

Status: **approved by Thibault on 2 Nov 2026 (Azure).**

## What the reference does

The Breed Bio staging site (Azure Static Web Apps behind a Microsoft sign-in) has a small toolbar at the bottom right: who you are signed in as, a release picker, an eye button to show or hide pins, a **Comments** list and a **Comment** button (shortcut `C`). In comment mode you click any element; a pin appears on it and a thread opens next to it. The list has Open / To discuss / Resolved tabs and a This page / All filter. Each thread is numbered, shows the element's text, its replies, and who resolved it ("Resolved by Claude"); replying to a resolved thread reopens it. Comments go through a small `/api/comments` endpoint.

We build the same thing for Mimyo, adapted to a static site with no build step.

## Approach

**Hosting: Azure Static Web Apps (Free plan) in Ooho's Azure subscription.** One app, `mimyo-staging`, resource group `rg-mimyo-staging` (West Europe). Static files are served as they are; a few small managed functions under `/api/` read and write comments in Azure Table Storage.

**Who can get in, and who commented: Microsoft sign-in.** Every page needs a sign-in with a Microsoft account (work or personal; anyone can make one with any email). The API reads the signed-in user from Azure, so every comment carries a verified identity. The first time someone comments we ask for the name to show (pre-filled from their email), once, and store it with their account so it follows them to their phone. Microsoft keeps people signed in, so they don't identify again. This also keeps the unreleased site and the licensed fonts private.

**Production stays clean.** The comment layer is not added to `index.html`, `professionals.html` or `contact.html`. The staging build injects one `<script>` tag into each page copy at deploy time. The production site is built from the repo as it is, so real visitors never get the layer, and the pages' design and CSS are untouched (the layer draws inside its own shadow root).

## Versions

- A version is a git tag: `review-v1`, `review-v2`, … whose message is the label shown in the picker (e.g. "Feedback round 1").
- `staging/build.sh` checks out every tag into its own folder, `/v1/`, `/v2/`, …, adds the comment script and a `versions.json`, and `/` opens the newest. A GitHub Action runs it and deploys on every push to `main` and every new `review-v*` tag.
- The toolbar has a version picker that keeps you on the same page. Each version shows **only the comments made on it**, so v1 keeps its full history after v2 ships.
- Typical loop: LHP comments on v1 → Claude implements on a branch, replies and resolves → we merge and tag `review-v2` → LHP reviews v2 and can still open v1.

## The comment layer (`staging/review/comments.js`)

- Toolbar, bottom right: signed-in name, version picker, eye (show/hide the layer), Comments count + list, Comment button. On/off is remembered per browser.
- Comment mode (`C`, Esc to cancel): hovering highlights the element under the pointer; clicking it opens a box. The pin sits on that spot of the element and follows it on scroll and resize.
- Anchor stored per comment: page, a CSS path to the element, its text (shown in the list, and used to re-find the element if the path breaks), the click point inside it, and the screen width it was made at. Comments whose element can't be found show in the list as "element not found".
- Threads: replies, statuses **Open / To discuss / Resolved**, who changed the status and when. Replying to a resolved thread reopens it.
- List: tabs by status, This page / All pages, click to jump to the pin. New comments from others appear within 30 seconds.
- Phone: same features; the list and the thread open as bottom sheets, tap to place.

## Claude's access (`staging/comments.mjs`)

A dependency-free Node script calling the same API with a review key kept in a git-ignored `.env`:

```bash
node staging/comments.mjs list --version v1 --status open
node staging/comments.mjs show 12
node staging/comments.mjs reply 12 "Done in v2: spacing reduced."
node staging/comments.mjs status 12 resolved
```

Writes made this way are signed **Claude**.

## Cost

About €0 a month: Static Web Apps Free plan, Table Storage at a few cents a month for this volume, GitHub Actions within the free minutes.

## Done means

Staging is live with at least v1, every criterion above is met and checked at 1440 and 375 px, Claude can list, reply to and resolve comments from the repo, and the README explains it.
