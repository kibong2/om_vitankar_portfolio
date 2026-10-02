# How to edit your portfolio

Everything you read on the site is a plain text file in `src/content/`. You never have to touch code to change words, add a project or swap a picture.

## The two ways to edit

**A. In the web editor (easiest).** Open `your-site/admin/`, log in with GitHub, click what you want to change, press Publish. The live site updates in about a minute. This needs the one-time setup at the bottom.

**B. Directly on GitHub or in VS Code.** Open the file, change the text, save (commit). Same result.

## Common jobs

| I want to... | Do this |
| --- | --- |
| **Add a project** | Web editor: Projects > New Project. Or copy a file in `src/content/projects/`, rename it, change the text at the top and the story below. |
| **Remove a project** | Delete its file. Or tick "Hide from the site" (`draft: true`) to hide it without losing it. |
| **Add pictures** | Web editor: upload in the Cover image field. Or drag files into `public/images/<project-name>/` on GitHub and point `cover:` at the file. |
| **Reorder projects** | Change the `order` number. Lower number = higher up. |
| **Feature a project** | Give it a low order number: the first ones are shown first on the 3D console. |
| **Change status** | Set `status` to BOARDING (planned), IN FLIGHT (in progress), LANDED (done) or DIVERTED (pivoted). |
| **Edit About / hero / skills / email** | Files in `src/content/site/`, or "Pages and details" in the web editor. |
| **Write about an activity** | `src/content/activities/<name>.md`. The top part is the homepage card, the long text goes on the Activities page. |
| **Update the resume** | Replace `public/resume.pdf` with your new file (same name). |
| **Swap in a 3D model** | Put the `.glb` in `public/models/` with the right name (see `public/models/README.txt`). |

## What a project file looks like

```
---
title: "My project"
flight: "OV108"            # shown on the project list
category: Aerospace        # Aerospace, Builds or Code
status: IN FLIGHT
date: 2026-10-01
tools: ["Python", "Fusion 360"]
summary: "One sentence for the card."
cover: /images/my-project/cover.jpg
links: []                  # e.g. [{ label: "GitHub", url: "https://..." }]
featured: true
order: 5
draft: false
---

Your story goes here, in plain text. Use ## for headings.
```

Grades never go on the site.

## Try the editor on your own computer (works today)

Open two terminals in the project folder:

```bash
npm run dev
```

```bash
npx decap-server
```

Then open http://localhost:4321/om_vitankar_portfolio/admin/index.html . Changes you publish there are saved straight into your files. Nothing goes online.

## One-time setup for the online editor

The editor logs in through GitHub, and GitHub Pages cannot do that login by itself, so it needs a tiny free helper service.

1. Put the site on GitHub (push the repo) and turn on Pages: repo Settings > Pages > Source: "GitHub Actions".
2. Deploy a Decap OAuth helper (for example a free Cloudflare Worker such as `sveltia-cms-auth` or `decap-proxy`) and create a GitHub OAuth App for it (GitHub > Settings > Developer settings > OAuth Apps).
3. In `public/admin/config.yml`, uncomment `base_url:` and put the helper's address there.
4. Open `your-site/admin/` and log in.

If this feels like too much, option B (editing on GitHub.com) works with no setup at all.
