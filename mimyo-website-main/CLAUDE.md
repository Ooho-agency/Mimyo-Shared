# Mimyo website: working rules

Client: LHP Healthcare (Belgium). Product: **Mimyo**, a CE-marked (Class I) medical feeding device, birth to age 4, that complements breastfeeding. Sold through pharmacies. Agency: Ooho. Work only on this client; never bring in other clients' material.

## Goal right now
Get the site approved by LHP as fast as possible. Stay close to the client-approved Figma design and change only what LHP asked for. Log every change in `CHANGES.md`.

## Working with the team (most people here are not coders)
Koen, Thibault and others change the site by talking to Claude. Do all the git and GitHub work yourself and talk about it in plain words: "I've saved your change", "it's ready for review". Don't show commands or git terms unless asked.

- **Start of a session:** get the latest version from GitHub. If the person isn't signed in to GitHub (`gh auth status`), help them sign in with `gh auth login --web`.
- **Never change `main` directly.** Start a new branch for each piece of work, named after the person and the topic, e.g. `koen/hero-headline`.
- **Show, don't describe:** after a change, start the `mimyo` preview (`.claude/launch.json`) and give the link. Check desktop (1440) and phone (375).
- **Log each change** in `CHANGES.md`.
- **"Send it for review" / "it's done":** commit, push and open a pull request. Describe what changed and why in plain words. Give the person the link, and say that Thibault or Harry needs to approve it. Merge only when the person asks you to.
- **Someone else on the same page:** if another open pull request changes the same file, say so before starting.
- **LHP only sees review rounds.** Merging into `main` updates nothing LHP looks at. Create a new round (an annotated `review-vN` tag on `main`, see README) only when someone explicitly asks to publish a new round for LHP. Confirm the round name with them first.
- **Protect LHP's comments:** never move or delete `review-v*` tags. Never change `staging/hidden-versions` unless asked.
- **Never show the values in `.env`.**

## Copy and claims (regulated: enforce)
- Parent copy: "Mimyo **mimics** the mechanics of breastfeeding". HCP and regulatory copy: "designed to replicate key breastfeeding mechanics".
- Say *device* or *Mimyo*, never *bottle* or *biberon* for Mimyo.
- No superlatives ("the only", "the best") and no comparisons with or criticism of other bottles.
- "Designed for zero colic" / "no air intake by design", never "anti-colic" and never "prevents colic".
- "Designed to support", never "prevents" or "cures".
- *Suck-swallow-nasal-breathe*, not *suck-swallow-breathe*.
- Sleep apnea, ADHD and malocclusion claims never appear on parent pages.
- Text marked with `<mark>` is waiting on LHP; don't invent it.

## Design
- Tokens in `assets/site.css`: linen `#F9F6F5`, sky `#93AEC5`, basalt `#39392F`; Afterall Serif headings, Helvetica body, DM Sans for FAQ questions.
- Pill navigation and buttons, rounded panels, calm motion. Respect `prefers-reduced-motion`.
- Namespace new component classes (the site header already uses `.top`, `.pill`, `.logo`).

## Checking
Serve with `python3 -m http.server 8790` and check desktop (1440) and phone (375) widths: no sideways scroll, no console errors.
