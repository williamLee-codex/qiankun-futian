---
name: Hotspot overlay architecture
description: How the game scene is structured — artwork as primary visual, React as transparent interaction layer only
---

The game canvas (`gc`) uses the reference artwork as `background-image: cover`. React renders **zero visual geometry** for buildings, plots, or HUD frames — all of that is already in the artwork.

React only adds:
1. `.hud-layer` — 4 `<span class="hv hv-N">` elements positioned over the image's dark value strips
2. `.hotspot-layer` — transparent `<button>` elements over each plot and building
3. `.info-panel` — dark wood panel that slides up from bottom when a plot is selected (hidden otherwise)
4. `.bottom-menu` — always-visible icon strip at absolute bottom

**Why:** Previous approaches (CSS color blocks, SVG inline tiles, CSS gradient borders) all produced "web dashboard" visual quality that broke immersion. The single-image + hotspot pattern lets professional artwork do all the heavy visual lifting.

**How to apply:**
- Never add `background`, `border`, or visual CSS to `.ph` (plot hotspot) or `.bh` (building hotspot) elements.
- Hotspot positions (`PLOT_POS` in `FarmScene.tsx`, `.bh-*` in CSS) are `%` values calibrated to the artwork. Adjust them there when tuning hit targets.
- HUD number positions (`.hv-0` through `.hv-3` `left` values) must be re-calibrated if the artwork changes.
- Info panel slides in via `transform: translateY` — add `.info-panel--visible` class when a plot is selected, `.info-panel--hidden` when none.
- If a second artwork is introduced, swap `bgImage` import in `App.tsx` and re-calibrate `%` positions.
