---
title: Playmaker
kind: software
area: Sports analytics
featured: true
order: 201
metric:
  value: 85.8 → 59.2
  unit: points for the best no-look strategy after the audit fix · never 100
summary: >-
  A daily football game built on my AI coach: five real pro moments a day, pick the pass, then guess what the pro did.
  Leak-free scoring with close calls from 20 bootstrap refits, an audit that closed a trivial-strategy exploit, and a
  computer vision Lab in the browser that reads a TV picture or a video clip.
stack:
  - TypeScript
  - Vite
  - three.js
  - MediaPipe
  - Python
  - Vitest
  - Playwright
cover: /images/playmaker-cover.png
links:
  code: https://github.com/yandouziyassine/playmaker
  demo: https://playmaker-game.github.io/
---

*Daily football decision game on an AI coach · TypeScript, three.js, in-browser computer vision*

## What it is

Playmaker turns the AI coach of [project 20](/projects/football-analytics/) into a game. Every day brings five real moments from professional matches (open Bundesliga, 2. Bundesliga and A-League tracking data). You watch 3 s of real play, you have the ball, and you answer two questions:

- **What would you do?** Scored by the AI coach. Close calls get full points.
- **What did the pro actually do?** Objective: the real pass.

The reveal shows your points, the coach's pick with what helped and hurt, the pro's pass, what happened in the next 15 seconds and a replay of the real 6 seconds after the pass. **[Play the demo](https://playmaker-game.github.io/)**: it runs in the browser, in English or French.

<figure class="shots one">
<img src="/media/projects/playmaker/clip.webp" width="360" height="682" alt="One Playmaker moment on a phone: the 3 s lead-up, a pass picked on the pitch, the guess of the pro's pass, then the reveal with the real play after the pass.">
<figcaption>One moment, start to finish (an A-League match). Own rendering of SkillCorner open tracking data (<a href="https://github.com/SkillCorner/opendata">MIT</a>).</figcaption>
</figure>

## What is technically interesting

- **Leak-free, humble scoring.** Every moment of 27 open matches is scored by models trained **without** that match. The four models are refitted 20 times on resampled matches: an option scores 100 if it is the main model's best or the best in at least 20 % of the refits, and the others get partial credit by rank.
- **An audit that found an exploit.** A script plays the released days with trivial strategies that read only the public geometry. The first release failed it: "shoot if possible, else the most advanced pass" averaged **85.8** points, more than playing like the pro (74.8), because the shot scored 100 in 82 % of final-third moments. Two fixes (skip moments where a trivial pick already scores 100, and make partial credit fall quadratically with rank) brought the best trivial strategy down to **59.2**, and no trivial strategy reaches 100 on any released moment. It is still slightly above playing like the pro (56.6), and the case study says so.
- **One coach, two languages.** The engine is ported from Python to TypeScript and tested against Python on 30 real frames to within **1e-6**, so the browser computes exactly what the content pipeline computed.
- **2D and 3D.** A lazy-loaded three.js view with three cameras (the player's eyes, a TV-style stadium camera, a tactical view); you tap a teammate to pass in either view.
- **A computer vision Lab in the browser.** From a TV screenshot, a phone camera pointed at the TV or a short video clip: MediaPipe detects the players and the ball, teams are split by shirt colour, the pitch is **calibrated automatically from its painted lines** (about 50-110 ms), players are tracked across frames (Kalman filter, Hungarian assignment, re-identification after a cut), and the real coach suggests the ball carrier's best options.
- **A benchmark with exact ground truth.** No permissively licensed, labelled broadcast frames exist, so a renderer draws broadcast-like frames from **real tracking data** through a known camera. On 60 frames (1,133 players) the Lab's person recall went from **43.5 % to 69.9 %** (80.1 % with the optional EfficientDet-Lite2 model) while precision rose from 80.6 % to 85.9 %. On a rendered 10 s clip, well-calibrated frames went from **62 % to 96 %** and the mean track length from 2.4 s to 6.2 s. Honest limit: on frames with randomised lighting, kits, camera positions and motion blur, recall falls to about 30 % (Lite0) / 35 % (Lite2), mostly on small far-away players and blurred frames; it has not been tested on real TV pictures.
- **Offline and bilingual.** A service worker keeps the app and today's five moments; answers given offline are scored when the network is back. English and French throughout.
- **Tested.** About 300 unit, parity, API and contract tests and 11 Playwright end-to-end tests run in CI.

<figure class="shots">
<img src="/media/projects/playmaker/choose-2d.webp" width="540" height="1098" alt="Choosing a pass on the 2D pitch: tap a teammate, a carry or the goal." loading="lazy">
<img src="/media/projects/playmaker/reveal.webp" width="540" height="1098" alt="The reveal: points, your pick, the AI coach's pick, the pro's pass and the coach's reasons." loading="lazy">
<img src="/media/projects/playmaker/3d-stadium.webp" width="540" height="1098" alt="The same moment in 3D from the stadium camera." loading="lazy">
<img src="/media/projects/playmaker/lab-autocal.webp" width="540" height="1098" alt="The Lab on its code-drawn synthetic scene: players detected and the pitch calibrated automatically from its lines." loading="lazy">
<figcaption>Choose, reveal, 3D stadium camera, and the Lab on its code-drawn synthetic scene (no broadcast picture). The app's own renders of open tracking data: Bundesliga (Bassek et al. 2025, DFL / Sportec Solutions, CC BY 4.0) and SkillCorner open data (MIT).</figcaption>
</figure>

## Limits

- **The computer vision numbers are synthetic.** They come from renders of real tracking data, not TV pictures: real broadcasts add blur, graphics, compression and crowds. The Lab has not been measured on real footage.
- **The value model is weak.** It explains about 2 % of the variance of what happens in the next 15 seconds on held-out Bundesliga matches, no better than distance to goal. That is why close calls get full points and the reveal calls the ranking a model opinion and always shows what really happened.
- **The demo scores in the browser.** The static demo ships 30 days of content with their answer files, so anyone can read the answers and there are no crowd stats. The full service keeps answers on a server until you pick; it is not deployed yet.
- The clip mode takes about 1.6 s per frame on a laptop CPU, so a minute of video takes minutes.

Full write-up: [case study](https://github.com/yandouziyassine/playmaker/blob/main/docs/CASE_STUDY.md) · [architecture](https://github.com/yandouziyassine/playmaker/blob/main/docs/ARCHITECTURE.md).

**Stack:** TypeScript · Vite · three.js · MediaPipe · Python · Vitest · Playwright

[Code and README on GitHub](https://github.com/yandouziyassine/playmaker)
