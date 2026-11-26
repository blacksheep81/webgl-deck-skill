---
name: webgl-deck
description: Build a cinematic, full-screen WebGL presentation as a single HTML file (three.js, one canvas, every slide a "scene" animated in beats, custom GLSL shader transitions between scenes, speaker notes, overview grid, keyboard help, procedural sound). Use when the user wants slides/a talk/a keynote that "moves", "feels like a film", has shader or 3D transitions, or explicitly references a three.js / WebGL / canvas slide deck. Not for ordinary editable slide decks or .pptx files.
---

# WebGL Deck

A deck where each slide is a small real-time scene rendered by three.js onto one full-window
canvas, advanced one **beat** at a time, with a **GLSL transition** between scenes.
This is the architecture of hand-built decks like "The Last Boring Slide" (13 scenes,
10 transitions, ~7000 lines). The starter in `assets/template.html` already implements the
engine; your job is mostly writing scenes.

Read `references/architecture.md` before extending the engine, and
`references/transitions.md` before writing a new transition.

## SOP

### 1. Script before code (do this with the user, in chat)
For each scene write one line each of:
- **id** (lowercase, used in the URL: `#boat`, `#boat-2` = scene boat, beat 2)
- **the one idea** the scene carries (one metaphor per scene: boat on a rising sea = anchoring bias)
- **beats**: what changes on each keypress (usually 1–4). Each beat = one sentence of speech.
- **notes**: the exact words the speaker says per beat.
- **enterWith**: which transition brings it in, chosen for meaning (tear = split into two futures,
  slam = a hard fact, daybreak = optimism, portal = going inside/zooming in, fold = turning the page).

Aim for 8–15 scenes. Fewer, bigger ideas beat many small ones. Confirm the script before building.

### 2. Start from the template
Copy `assets/template.html` to the working directory. Do not rewrite the engine from scratch.
Sections are numbered 0–9; you normally only touch **§6 SCENES** (and §4 to add transitions,
§2 `FONTS` to change type).

### 3. Write each scene against the contract
```js
{
  id: 'boat', title: 'Anchor', enterWith: 'fold', hud: '#ffffff',   // hud = page-number colour
  beats: [ { dur: 4, delay: 0, hold: 2.5, notes: '...' }, ... ],     // dur = seconds the beat animates
  create(ctx) {                    // called once, lazily; build everything here
    const scene = new ctx.THREE.Scene();
    // ...meshes, ctx.text(), ctx.rect(), your own ShaderMaterials
    return {
      scene,                       // required
      camera,                      // optional; default = shared 1920x1080 ortho camera (y down)
      overlay,                     // optional 2D Scene drawn on top with the ortho camera
      update(s) { /* set every property from s. No other state. */ },
    };
  },
}
```
Rules that make it work:
- **Author in a 1920×1080 virtual space**, y pointing down. The engine fits it to any window and
  lets backgrounds bleed past the edges, so fill beyond 0..1920 when a background is not flat.
- **`update(s)` must be a pure function of `s`**: `s.p[i]` (0..1 progress of beat i),
  `s.k(i, a, b, ease)` (eased 0..1 between second a and b of beat i), `s.t` (seconds in scene).
  Never accumulate state frame-to-frame. This is what makes going back, jumping via URL, the
  overview thumbnails and fast-forwarding all work for free.
- Stagger with `s.k(beat, i*0.06, i*0.06+0.7, ease.out4)`. Use `ease.out4`/`out3` for things
  arriving, `io3` for things moving, `outBack` for a pop.
- Text: `ctx.text(str, {x,y,size,font,color,align,valign,leading,tracking,maxWidth})` returns
  a mesh with `.pose(alpha, dx, dy, scale, rot)`. Rects: `ctx.rect(x,y,w,h,color)` with `.set(x,y,w,h)`.
- 3D: give the scene its own `PerspectiveCamera`; the engine keeps its aspect right.
- Prefer geometry + shaders over images. If you use images, embed them as data URIs.

### 4. Design language (what makes these decks look expensive)
- One idea per screen, huge type (display 140–220px, statements 70–90px, captions 34–46px in the
  1920 space), left-aligned at x≈110–140 or dead centre.
- Each scene owns its palette and background colour; the page-number HUD changes colour to stay legible.
- Two or three type roles only: a serif display (Newsreader), a mono for UI/labels (Geist Mono),
  one poster face for shouty moments (Anton).
- Motion has meaning: something rising = growth, chain/anchor = constraint, etc. Avoid decorative motion.
- Subtle global post: vignette and film grain (§5). Keep grain ≤ 0.04.

### 5. Verify like a film, not a web page
Run headless Chromium (Playwright) with SwiftShader:
`chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})`.
- Load `file.html#<id>-<beat>` to land on any beat, wait `dur` seconds, screenshot.
- Test each transition at ~45 % with `deck.go(i, {via:'tear'})` then wait `0.45*dur`.
- Collect `pageerror` and console errors; shader compile errors show up there.
- Check 16:9, an ultrawide (2560×1080), and a phone portrait (390×844) for bleed and clipping.
- Look at every screenshot. Iterate on timing (`dur`, `delay`) more than on code.

### 6. Ship
- It must be a single self-contained `.html`. For offline/airplane use, inline three.js
  (paste `three.module.min.js` into a module script and swap the import for the
  inline copy) and embed the fonts as base64 (`references/architecture.md` §7).
- If publishing as an Artifact, the CDN import map (jsdelivr, pinned version) and Google
  Fonts link in the template are allowed as-is.

## Common failures
| Symptom | Cause / fix |
|---|---|
| Text upside-down or mirrored | y-down camera: textures need `flipY=false`, materials `side: DoubleSide` (template does this) |
| Colours washed out or too dark | template disables colour management on purpose; don't re-enable it in one scene only |
| Going back shows a broken half-state | `update` depends on something other than `s` |
| Jank on first entry of a scene | heavy `create()`. The engine prewarms the next scene; move texture generation into `create` and keep `update` cheap |
| Transition shows a black frame | the incoming scene rendered before `ensure()` or its render target was never sized; call `resize()` after changing RTs |
| No sound | Web Audio needs a user gesture; `audio.unlock()` is called on the first key/tap |
