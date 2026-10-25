# Vendored: painter-web

`painter.js` and `types/` are the build output (`npm run build`, `dist/`) of **painter-web** 0.1.0, the browser port of
project 01 (virtual painter) of the CV library: `mountPainter(element, options)`. Source at build time:
local repo `C:\Users\yando\Code\work\painter-web`, commit `953dca7`.

The bundle includes `@mediapipe/tasks-vision` 1.1.0 (Apache-2.0, see `public/mediapipe/NOTICE.txt`). The wasm runtime
and the hand model are self-hosted in `public/mediapipe/` and passed in through the `wasmBase` and `modelAssetPath`
options. To update: rebuild painter-web, copy `dist/painter.js` and `dist/types/` here, and keep the wasm files at the
same `@mediapipe/tasks-vision` version.

The trailing `//# sourceMappingURL` line was removed (the map is not vendored; it caused a 404 in dev tools).
