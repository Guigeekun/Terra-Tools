---
title: One Place for Community Info
description: Why this tab exists and how to add or fix documents.
tags: reTB, project-liminal-gate
---

# One place for community info

Info about playing Terra Battle today lives everywhere: GitHub readmes, Discord pins, old Reddit posts, random screenshots. This tab is the attempt to fix that — every document here is a markdown file in the [Terra-Tools repository](https://github.com/Guigeekun/Terra-Tools) tagged by project, and the sidebar filter shows only what is relevant to the project you are playing.

## The projects

- **reTB** — the revived online service for Terra Battle, letting the original game connect, sync saves and play events again.
- **Project Liminal Gate** — the companion project reimplementing the game around it, with its own save format and features.

Both share the same community, the same game data, and mostly the same questions — which is exactly why the answers should live in one tagged place instead of five.

## Adding or fixing a document

Documents are plain markdown files under the `docs/` folder of the Terra-Tools repo. Each one starts with a small header declaring its title, description and tags:

```markdown
---
title: Installing reTB
description: From zip download to the title screen.
tags: reTB, guide
---

Your content here...
```

Submit a pull request (or drop the text in Discord and ask someone to), and it appears here on the next release. Wrong or outdated info? Same path — fix it in place so the next person finds the right answer.
