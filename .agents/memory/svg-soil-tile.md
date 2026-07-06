---
name: SVG soil tile architecture
description: How farm plots are rendered as game-art assets rather than CSS color blocks
---

Each farm plot is rendered as an inline `<svg>` component (`SoilTile.tsx`) with:
- Stone brick border via `<pattern>` (repeating brick rows, warm stone tones)
- Soil interior via `<linearGradient>` (NOT CSS `linear-gradient()` strings — SVG rects reject CSS gradients)
- Organic texture via `<filter>` with `<feTurbulence>` + `<feBlend mode="screen">`
- Type-specific SVG accent shapes (wheat stalks, crystals, roots, grass, moss, gold veins)
- Gold corner orbs via `<radialGradient>`
- All gradient/filter IDs must be unique per plotId (e.g. `sg${plotId}`) to avoid cross-plot conflicts

**Why:** CSS `border` + `background: linear-gradient(...)` on `<div>` always looks like a card/dashboard block. SVG patterns and filters produce genuine painted-game-asset appearance. The user explicitly rejected CSS color blocks.

**How to apply:** When the user asks to improve plot appearance, edit `SoilTile.tsx`. Do NOT add CSS backgrounds back to `.fp` or `.fp-tile`. The `FarmPlot.tsx` wrapper only handles React state; all visuals live in SVG.
