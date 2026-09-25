# Writing docs

Everything in this folder (any `*.md` except this README) shows up on the **Docs** tab of TerraTools. Documents are plain markdown files — drop one in a pull request and it goes live with the next release.

## Frontmatter

Each document starts with a small header declaring its metadata:

```markdown
---
title: Installing reTB
description: From zip download to the title screen.
tags: reTB, guide
---

Your content here...
```

- `title` — shown on the card and at the top of the article (defaults to the file name).
- `description` — one-liner shown on the card.
- `tags` — comma-separated; the tab's filter chips are built from these. Current families: `reTB`, `project-liminal-gate`. Sub-folders work: `docs/reTB/foo.md` gets slug `reTB/foo`.

## Linking documents

Link to another doc with a markdown link — it navigates inside the app and copies as a shareable URL. Paths work like file paths: same-folder names (`custom-reTB.md`) or full slugs (`reTB/custom-reTB`), both with optional `#section` anchors that use GitHub-style heading slugs:

```markdown
See the [quick setup guide](reTB/quick-setup-guide) or the [tweaks](custom-reTB.md#android).
```

Every doc also has a permanent address you can paste anywhere — open it and copy the browser URL, or build it from the slug: `#/docs/reTB/quick-setup-guide` (add `#section` to land on a heading). Links to other sites open in a new tab; bare pasted YouTube URLs become embedded players (see below).

## YouTube videos

Two ways to embed, both render as a 16:9 player:

**Paste a plain URL on its own line** (timestamps via `?t=` work):

```markdown
https://www.youtube.com/watch?v=tl91pam6baY
```

**Or paste YouTube's raw embed code** (Share → Embed) — the tag is rebuilt safely, so only YouTube sources are allowed:

```html
<iframe src="https://www.youtube.com/embed/lJ3W4EnymAk"></iframe>
```

If you link the video with a *label* — `[watch this](https://youtu.be/...)` — it stays a normal link instead of an embed.
