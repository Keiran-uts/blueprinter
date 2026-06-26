# Blueprinter

A blueprint-styled web app that reads an architectural floor plan in **SVG** form,
auto-detects the structural walls, and measures the dimensions between them at a
scale you choose. Built with **Vite + React**.

## Workflow

1. **Add SVG file** — pick an SVG floor plan from your computer.
2. **Plan scale** — choose 1:20 / 1:50 / 1:100 / 1:200 / 1:500 on the slider,
   or hit **Calibrate** and draw a line over a known dimension to set the exact
   real-world scale.
3. **Detect walls** — the app finds orthogonal structural wall lines and draws
   dimension chains between them (blue, blueprint-style). In **Confirm walls**
   mode, click any wall line to include/exclude it. Switch to **Measure** to
   click two points for a manual measurement.
4. **North point** — drag the compass needle to set north relative to the plan.
5. **Save dimensioned SVG** — downloads the original drawing with the blue
   dimension annotations and north marker baked in (stays vector).

## How detection works

- Straight segments are extracted from `<line>`, `<rect>`, `<polyline>`,
  `<polygon>` and `<path>` elements.
- Segments are classified as near-horizontal or near-vertical, then clustered by
  position. The two faces of a wall fold into a single centreline, and short
  segments (furniture, text, fixtures) are filtered out.
- Distances between consecutive wall lines become the dimension chains.

Detection is a heuristic tuned for orthogonal plans — you confirm the result, so
false positives/negatives are one click to fix.

## Calibration / scale

The app converts SVG units to millimetres via **mm per unit**. The scale slider
sets a default; **Calibrate** overrides it exactly by measuring a known length.
If your SVG is already exported at true real-world size, calibrate against any
labelled dimension to read correct millimetres.

## Develop

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build into dist/
npm run preview  # preview the production build
```

A sample plan lives at `public/sample-plan.svg` for testing.

## Tech

- Vite 8 + React 19
- No runtime dependencies beyond React — all geometry/SVG work is plain JS in
  `src/lib/`.
