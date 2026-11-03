# Mimyo website

Website for **Mimyo**, the CE-marked medical feeding device by LHP Healthcare (Belgium). Built by Ooho.

Static HTML, CSS and JavaScript, no build step. The 3D device runs on three.js r172 from a CDN.

## Pages

| File | Page |
|---|---|
| `index.html` | Home (parents) |
| `professionals.html` | Healthcare professionals, behind a self-declaration gate |
| `contact.html` | Contact form (`?you=pro` preselects a professional) |

## Run it locally

```bash
python3 -m http.server 8790
```

Then open http://localhost:8790. In Claude Code, the `mimyo` preview in `.claude/launch.json` does the same.

## Structure

- `assets/site.css`: shared styles and tokens (linen, sky, basalt; Afterall Serif headings, Helvetica body).
- `assets/model.js`: the device's 3D mesh, converted from LHP's CAD file. `assets/story.js` drives it.
- `assets/img/`: photography, pack shots and the breast/Mimyo latch illustrations.
- `assets/fonts/`: Afterall Serif, licensed. Keep this repository private.
- `experiments/`: prototypes that are not on the live pages. `experiments/latch-gemini/prompts/` holds the prompts and script used to generate the latch illustrations with Gemini (the script reads `GEMINI_API_KEY` from the environment).
- `CHANGES.md`: every change against the client-approved design, with LHP's feedback codes. Update it with each change.
- `staging/`: the staging site with client comments (see "Staging and client comments").

## Staging and client comments

Staging: **https://lively-ground-011d69803.4.azurestaticapps.net** (Azure Static Web Apps `mimyo-staging`, resource group `rg-mimyo-staging`, Ooho subscription). Every page needs a Microsoft sign-in, work or personal; anyone without one can create one with any email. The first time, Microsoft and Azure each show a consent screen; reviewers click Accept on both.

### Reviewing (LHP and Ooho)

- Bottom right: who you are, the version picker, the eye (turns the comment layer off and on; remembered per browser), **Comments** (the list) and **Comment** (shortcut `C`).
- Press **Comment**, then click any element. Write, then **Post** (⌘↵). The pin stays on that element. The first time, you also give the name shown on your comments.
- Click a pin to open its thread: reply, or set it to **Open**, **To discuss** or **Resolved**. Replying to a resolved thread reopens it.
- The list has a tab per status and This page / All pages. Resolved pins only show while the Resolved tab is open.
- On the professionals page, pins appear once you're past the healthcare-professional gate.

### Versions

A version is an annotated git tag `review-vN`, served from `/vN/` with only the comments made on it, so older versions keep their comments. The picker names it `V<N>_<tag date>`, e.g. `V2_20261102`; the tag message shows as a tooltip. `/` opens the newest.

To publish a new version once a round of comments is implemented and merged to `main`:

```bash
git tag -a review-v3 -m "Feedback round 2" main && git push origin review-v3
```

To take a version off staging without deleting its tag or comments, add its id (e.g. `v1`) to `staging/hidden-versions`. Remove the line to bring it back.

The GitHub Action `.github/workflows/staging.yml` rebuilds every version and deploys, on each push to `main` and each new tag; run it by hand from the Actions tab (Staging → Run workflow). It needs the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN` (the app's deployment token). Once the Action has deployed, Azure refuses manual uploads with the SWA CLI, so deploy through the Action.

### Claude and comments

`staging/comments.mjs` reads and writes comments through the staging API. It needs a `.env` at the repo root (git-ignored; ask Thibault for the values):

```
STAGING_URL=https://lively-ground-011d69803.4.azurestaticapps.net
REVIEW_API_KEY=…
```

```bash
node staging/comments.mjs versions
node staging/comments.mjs list --version v1 --status open    # --status all|open|discuss|resolved, --page contact.html, --json
node staging/comments.mjs show 12
node staging/comments.mjs reply 12 "Done in v2: the headline is now two lines."
node staging/comments.mjs status 12 resolved
```

Replies and status changes made this way are signed **Claude**. So you can ask Claude: "review the open comments on v1, implement them on a branch, reply to each and resolve the ones that are done". Each comment gives its page, the element's CSS path and text, and the screen width it was made at.

### How it fits together

- The comment layer (`staging/review/comments.js`) is **not** in the pages. `staging/build.sh` copies each tagged version into `dist/vN/` and adds one `<script>` tag to each copy. Production is the repo as it is, so visitors never get the layer, and the layer draws in its own shadow root without touching the site's CSS.
- The API (`staging/api/`) runs as Static Web Apps managed functions and stores comments in Azure Table Storage (`mimyostagingreview`). App settings `TABLES_CONNECTION` and `REVIEW_API_KEY` are set on the Static Web App.
- Cost: about €0 a month (Free plan, a few cents of storage).

### Working on the layer locally

```bash
STAGING_DRAFT=1 bash staging/build.sh && node staging/dev-server.mjs 8796
```

Open http://localhost:8796. The dev server stands in for Azure: it serves `dist/` (with your working copy as `/draft/`), runs the same API on `staging/.data/comments.json`, and signs you in as a fake user. Switch user with `document.cookie = 'devuser=Anne'` in the console. Point `comments.mjs` at it with `STAGING_URL=http://localhost:8796`.

## Working on it

- One branch per section or feature, merged through a pull request.
- Check every change at desktop and phone width before merging.
- Copy and claims follow the rules in `CLAUDE.md`.
