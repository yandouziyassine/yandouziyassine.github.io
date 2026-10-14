# yandouziyassine.github.io

Personal portfolio site: plain HTML + CSS + JavaScript, no build step, served by GitHub Pages.

## Add or edit a project

Everything shown on the site comes from **`data/projects.js`**:

- `FEATURED`: the big cards at the top (Computer Vision Library, Slipstream, JoBaI, …).
  Copy one object, change the fields, done.
- `PROJECTS`: the Computer Vision Library grid. A new `area` value automatically creates a new filter chip.
- `SKILLS`, `SITE`: the skills table and the name / headline / GitHub link.

Images go in `images/` (keep each under ~2 MB; GIFs are fine).

## Preview locally

```bash
python -m http.server 8766
# then open http://localhost:8766
```

## Publish

Push to the `main` branch of the `yandouziyassine.github.io` repository; GitHub Pages serves it at
https://yandouziyassine.github.io within a minute or two.
