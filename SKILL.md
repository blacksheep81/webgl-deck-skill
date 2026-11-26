---
name: webgl-deck
description: Build a cinematic, full-screen WebGL presentation as a single HTML file (three.js, one canvas, every slide a "scene" animated in beats, per-letter kinetic type, custom GLSL and geometry transitions like page curl / paper tear / split-flap, speaker notes, overview grid, keyboard help, procedural sound). Use when the user wants slides/a talk/a keynote that "moves", "feels like a film", has shader or 3D transitions, or explicitly references a three.js / WebGL / canvas slide deck. Not for ordinary editable slide decks or .pptx files.
---

# WebGL Deck

A deck where each slide is a small real-time scene rendered by three.js onto one full-window
canvas, advanced one **beat** at a time, with a **transition** between scenes.
This is the architecture of hand-built decks like "The Last Boring Slide" (13 scenes,
10 transitions, ~7000 lines). `assets/template.html` already implements the engine; the job is
mostly writing scenes, then checking them with `scripts/verify.js`.

| file | read it when |
|---|---|
| `assets/template.html` | always: copy it, write scenes in §6 |
| `references/architecture.md` | changing the engine, or matching a feature of the reference deck |
| `references/transitions.md` | writing a new transition |
| `references/scene-cookbook.md` | building a scene type you haven't built before (water, particles, charts, crowds, kinetic type) |
| `scripts/verify.js` | after every meaningful change |
| `scripts/inline.py` | before delivering an offline file |

## SOP

### 1. Script before code (agree it with the user in chat)
For each scene, one line each of:
- **id**: lowercase, used in the URL: `#boat` = scene boat, `#boat-2` = its beat 2
- **the one idea** it carries, as a picture (a boat on a rising sea = anchoring bias)
- **beats**: what changes on each keypress (usually 1–4); one beat ≈ one spoken sentence
- **notes**: the words the speaker says per beat
- **enterWith**: the transition, chosen for meaning: `tear` = splitting into two futures,
  `slam` = a hard fact, `daybreak` = optimism, `portal-in/out` = going inside / stepping back,
  `fold` = turning the page, `flaps` = data/board, `wash` = gentle change, `line` = scanning/reveal.

Aim for 8–15 scenes. Fewer, bigger ideas beat many small ones. Confirm the script before building.

### 2. Start from the template
Copy `assets/template.html`. Do not rewrite the engine. Sections are numbered 0–9; normally you
only touch **§6 SCENES** (plus §2 `FONTS` for typefaces, §4 for a new transition).

### 3. Write each scene against the contract
```js
{
  id: 'boat', title: 'Anchor', enterWith: 'fold',
  hud: '#ffffff',                 // page-number colour, or (s) => colour when the background changes mid-scene
  keep: false,                    // true = never park (only for scenes that are very slow to create)
  beats: [ { dur: 4, delay: 0, hold: 2.5, page: '233', notes: '...' }, ... ],
  //        dur: seconds the beat animates · delay: wait before it starts · hold: autoplay pause after it
  //        page: custom HUD label for this beat (default "3 / 13") · notes: speaker notes
  create(ctx) {                   // called lazily, and again after the scene was parked: build everything here
    const scene = new ctx.THREE.Scene();
    return {
      scene,                      // required
      camera,                     // optional; default = shared 1920x1080 ortho camera (y down)
      overlay,                    // optional Scene drawn on top with the ortho camera (2D captions over 3D)
      update(s) { /* set every property from s */ },
      dispose() {},               // optional; free your own render targets. Meshes/materials/textures are freed for you
    };
  },
}
```
Rules that make it work:
- **Author in a 1920×1080 virtual space, y down.** The engine fits it to any window and lets
  backgrounds bleed past the edges (`ctx.view.x0/x1/y0/y1` give the visible box), so fill beyond
  0..1920 when a background isn't flat. Keep text inside x 100–1820, y 80–1000.
- **`update(s)` must be a pure function of `s`.** `s.p[i]` (0..1 progress of beat i),
  `s.k(i, a, b, ease)` (eased 0..1 between second a and b of beat i), `s.t` (seconds in scene),
  `s.enter` (0→1 during the entering transition), `s.exit` (0→1 while leaving).
  Never accumulate state frame to frame. That purity is what makes back, URL jumps, overview
  thumbnails, headless verification and parking (dispose + rebuild) all work.
- Stagger: `s.k(beat, i*.06, i*.06+.7, ease.out4)`. `ease.out4/out3` for arrivals, `io3` for moves,
  `outBack` for a pop, `in3` for things that accelerate away.
- **Type**:
  - `ctx.text(str, opts)`: whole block, one texture. Use for static copy. `.pose(alpha, dx, dy, scale, rot)`.
  - `ctx.type(str, opts)`: **per-letter** instanced glyphs. `.glyphs` (each `{n, ch, line, col, x, w, cx, cy}`),
    `.animate((g, v) => { v.dx, v.dy, v.sx, v.sy, v.rot, v.skew, v.alpha = ... })` called from `update`,
    `.pose(alpha, dx, dy, scale)`, `.color(hex)`, `.bounds`.
  - opts: `{x, y, size, font: display|italic|mono|poster, color, align, valign, leading, tracking, maxWidth}`.
- Boxes: `ctx.rect(x, y, w, h, color)` → `.set(x, y, w, h)`. Custom full-screen shaders: `ctx.pass(frag, uniforms)`.
- 3D: give the scene its own `PerspectiveCamera`; the engine keeps its aspect right.
- Prefer geometry and shaders over images. Images must be embedded (inline.py does it for `src="..."`).

### 4. Design language (what makes these decks look expensive)
- One idea per screen; huge type (display 140–220 px, statements 70–90, captions 34–46, in 1920 space),
  left-aligned at x≈110–140 or dead centre.
- Each scene owns its palette and background; the HUD colour follows it (`hud` as a function).
- Two or three type roles: serif display (Newsreader), mono for labels (Geist Mono), one poster face (Anton).
- Motion means something: rising = growth, chain = constraint, splitting = choice. No decorative motion.
- Letters move individually only at the moments that matter; static copy stays `text()`.
- Post: subtle vignette + grain (§5). Grain ≤ 0.04.

### 5. Verify like a film, not a web page
```bash
npm i playwright            # once; `npx playwright install chromium` if no browser is present
node scripts/verify.js deck.html shots --sizes 2560x1080,390x844 --all-transitions
```
It opens the deck with `?headless`, drives time deterministically with `deck.step()`, shoots every
beat (finished), every entering transition at 45 %, optionally the whole transition catalog and other
viewports, and writes `shots/index.html` (contact sheet) and `report.json`. It exits 1 on page errors,
shader compile errors or console errors. On a machine that can't reach the CDN add
`--three node_modules/three/build/three.module.js`.
**Look at the contact sheet.** Iterate on timing (`dur`, `delay`, stagger) more than on code.
Debug in a browser with `deck.jump('boat', 1)`, `deck.go(3, {via: 'tear'})`, `deck.step(0.5)` (with `?headless`).

### 6. Ship
- Online / Artifact: the template's CDN import map (jsdelivr, pinned) + Google Fonts link are fine as-is.
- Offline (conference laptop, airplane):
  `python3 scripts/inline.py deck.html -o deck.offline.html` embeds three.js, the fonts (latin
  subset) and local images into one file, then verify it with `--block-net`.
  Without network, pass `--three path/to/three.module.min.js` and `--font "Family|400|normal|file.woff2"`
  (woff2 files e.g. from the `@fontsource/*` npm packages).

## Common failures
| Symptom | Cause / fix |
|---|---|
| Shader error in verify output | GLSL ES 3 reserves words like `half`, `input`, `output`, `sample`; rename. Read the numbered source it prints |
| A mesh in a 2D scene is invisible | the y-down ortho camera flips winding: give your own materials `side: THREE.DoubleSide` |
| Text upside down / mirrored | y-down camera: textures need `flipY=false`, materials `side: DoubleSide` (helpers do this) |
| Colours washed out or too dark | colour management is off on purpose; don't re-enable it per scene |
| Going back shows a half state, or a scene looks different after revisiting | `update` depends on something other than `s`, or `create` isn't deterministic (use `ctx.rng(seed)`, not `Math.random`) |
| Jank on first entry | heavy `create()`. Next scene is prewarmed; generate textures in `create`, keep `update` cheap |
| Memory grows over a long deck | a scene holds GPU resources the auto-dispose can't see (its own render targets): free them in `dispose()` |
| Blank page offline | CDN unreachable: ship the `inline.py` build. The watchdog shows a message after 12 s |
| No sound | Web Audio needs a gesture; `audio.unlock()` runs on the first key/tap. Headless is always silent |
