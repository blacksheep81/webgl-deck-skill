# Architecture (reverse-engineered from "The Last Boring Slide")

The reference deck is one 5 MB HTML file: ~3.5 MB is base64 fonts, ~250 KB is bundled three.js
(MIT header kept), ~700 KB is the deck code itself (minified). Its structure, and how the starter
template maps to it:

## 1. File layout
```
<style>     minimal chrome: notes bar, overview grid, help card, toast, loader. Nothing else is DOM.
<canvas id="stage">  the only thing on screen
<div id="ui">        overlays, only created when asked for
<script>    window.__FONTS = { "GeistMono-latin.woff2": "data:font/woff2;base64,..." , ... }
<script>    three.js bundle + engine + scenes + transitions + audio, ending in:
            boot({ createDeck, scenes:[...13], transitions:{fade, 'portal-in', 'portal-out',
                   fold, wash, flaps, slam, daybreak, line, tear}, makeAudio, headless })
```
`?headless` in the query string runs it without UI/audio for automated rendering.

## 2. Virtual view (template §1 `view`)
An `OrthographicCamera(left=x0, right=x1, top=y0, bottom=y1)` over a 1920×1080 design box,
scale = `min(W/1920, H/1080)`; the visible box is wider or taller than 1920×1080, centred on it,
so content bleeds instead of letterboxing. `toClip`/`fromClip` convert between design px and clip space
for shaders that need screen positions.

## 3. Scene object and beats (template §6–7)
```js
{ id:'boat', title:'Anchor', enterWith:'fold',
  hud:{ color:'#fff' | (s)=>colour, font:'monoMed', alpha:.85 },
  beats:[ {dur:4, delay:2.2, hold:2.5, page:'233'}, {dur:6, hold:3.5}, {dur:6, hold:5} ],
  notes:[ 'beat 1 words', 'beat 2 words', 'beat 3 words' ],
  create(ctx) { ...; return { update(s), render(out, s), enter?, exit?, resize?, page?(s) } } }
```
Per-scene state `s`: `t, dt, beat, p[] (0..1 per beat), enter, exit, dir, mouse, view,
at(i) = p[i]*dur (seconds into beat i), k(i,a,b,ease), since(i)`.
Stepping rule (same in template): beats `<= current` advance (earlier ones at 3× speed so a
fast presenter never skips content), later beats rewind at 2.4×. `delay` holds a beat before it
starts; `hold` is how long autoplay waits after it finishes.
`hud.color` can be a function of `s`, so the page number changes colour mid-scene when the
background changes.

The reference passes `ctx` with: `THREE, gfx (render targets, fullscreen passes, parking),
view, type (text engine), audio, mouse, text(), sfx(), asset(), overlay()`.

## 4. Text engine
Reference: each text block rasterises its glyphs once to a Canvas2D texture, then draws them as
**instanced quads, one per glyph**, with per-glyph attributes. Scenes animate glyphs with a callback:
```js
const t = ctx.text('BETTER', {x:960, y:560, size:980, font:'anton', align:'center', valign:'middle'});
t.animate((g, v) => {            // g = glyph {n, w, cx...}, v = its pose
  const m = ease.out4(clamp((p - g.n*.06)/.7));
  v.alpha = m; v.dy = (1-m)*160; v.skew = (1-m)*.6; v.rot = (1-m)*.25;   // also v.dx, v.sx
});
```
That is how words wave, stretch letter-by-letter or fly in staggered. The template implements
the same idea as `ctx.type()`: glyph positions come from `measureText` of each prefix (so kerning
is kept), unique characters are shelf-packed into one Canvas2D atlas, and an
`InstancedBufferGeometry` carries per-glyph `rect, uv, (dx,dy,sx,sy), (rot,skew,alpha)` attributes
rewritten by `.animate()` each frame. `ctx.text()` remains for static copy.

## 5. Transition pipeline
Both scenes keep running during a transition. Each frame: render outgoing → RT A, incoming → RT B,
run the transition pass `(tA, tB, p) → RT C`, then the post pass → screen. Transition objects:
```js
const fade = { dur:.7, create(ctx){ const P = ctx.gfx.pass(`...frag...`, {tA:null, tB:null, p:0});
  return { render({A, B, p, out}) { P.u.tA.value=A.texture; P.u.tB.value=B.texture; P.u.p.value=p; P.render(out); } } } };
```
Fancier reference transitions are not just a fragment shader: `tear` and `fold` build actual
geometry (paper mesh with a paper texture and lighting), `portal-*` raymarch, `flaps` is a
split-flap board of instanced quads. The template supports both forms (`frag` string or
`create()` returning `render()`), and its `fold`, `tear` and `flaps` are geometry; see `transitions.md`. Backwards navigation reuses the entering transition,
played reversed at 0.55× duration. Each transition also emits an audio event so the sound designer
(below) can score it.

## 6. Post / colour
Final pass in the reference has uniforms for exposure, bloom, tone mapping (`aces`/`agx`/none),
contrast, saturation, vignette, grain, chromatic aberration, halation, lift/gain, fade colour,
plus a blackout (`B` key). The template keeps vignette + grain + blackout.

## 7. Fonts
Reference: woff2 files base64'd into `window.__FONTS`, registered at boot:
```js
for (const [family, file, desc] of [['Newsreader','newsreader.woff2',{weight:'200 800'}], ...]) {
  const f = new FontFace(family, `url(${window.__FONTS[file]})`, desc); await f.load(); document.fonts.add(f);
}
```
Text is rasterised once, so fonts **must** be loaded before any scene's `create()` runs.
Faces used: Geist, Geist Mono, Newsreader (+ italic), Anton, a pixel face, Arial for the HUD.

## 8. Audio
Entirely procedural Web Audio, no sound files: an offline "bank" synthesises noise/tones into
`AudioBuffer`s at 48 kHz with a hand-written state-variable filter; per transition there is a
scored recipe (e.g. `portal-in` = band-passed pink noise sweeping 180→1500→420 Hz with pan
automation, plus low-passed brown noise). There is also an ambient "bed" per scene. Audio is
unlocked on the first key press; `M` mutes.

## 9. Performance
- Scenes are created lazily and **parked** (GPU resources released or frozen) when not current
  or adjacent; the next scene and its transition are prewarmed.
- Heavy scenes render their 3D at reduced resolution into their own RTs (`scale:.5`), use MSAA RTs
  with multiple attachments, mipmapped procedural textures generated once in `create()`.
- `dt` is clamped so a hidden tab doesn't jump animations.

Template: `park()` keeps the current scene, its neighbours and the scenes of a running transition;
everything else is disposed (`disposeTree` frees geometries, materials and textures, plus the scene's
own `dispose()`), and the transition instances not needed for the current/next step are released.
Rebuilding later is safe because `update(s)` is pure. `deck.step(sec)` runs the simulation at a fixed
60 fps without the rAF loop (`?headless`), which is what makes screenshots deterministic.

## 10. Chrome / UI
Keys: → ↓ Space PageDown Enter = next · ← ↑ PageUp Backspace = back · Home/End · F fullscreen ·
A autoplay · M mute · N notes · P (presenter) · O overview · ? or H help · B or . blackout · Esc.
Cursor hides after 2.2 s idle. URL hash `#scene-beat` both reflects and drives position.
Notes open in a separate window (for the second screen) with an inline fallback. The overview
renders real thumbnails of every scene's final state.

## 11. Template vs reference: what is covered
| feature | reference | template |
|---|---|---|
| virtual 1920×1080 view with bleed | ✓ | ✓ |
| scenes / beats / pure `update(s)` / `s.enter`, `s.exit` | ✓ | ✓ |
| per-letter instanced type | ✓ | ✓ `ctx.type()` |
| fragment transitions | ✓ | ✓ 7 |
| geometry transitions | ✓ fold, tear, flaps, portal (raymarch) | ✓ fold, tear, flaps (portal is fragment) |
| scene + transition parking | ✓ | ✓ |
| HUD colour as a function, per-beat page labels | ✓ | ✓ |
| notes window, overview thumbnails, help, autoplay, blackout, hash routing | ✓ | ✓ (+ elapsed timer and "next" in notes) |
| headless, deterministic stepping | ✓ `?headless` | ✓ `?headless` + `deck.step()` + `scripts/verify.js` |
| offline single file (inlined three.js + fonts) | ✓ | ✓ via `scripts/inline.py` |
| WebGL-missing / context-loss handling | ✓ | ✓ |
| post: bloom, tone mapping, CA, halation, lift/gain | ✓ | ✗ only vignette, grain, blackout |
| scored procedural audio per transition + ambient bed per scene | ✓ | partial: 5 one-shot sounds |
| mouse-driven interaction, selection-box UI | ✓ | ✗ (`s.mouse` not provided) |

The release file `the-last-boring-slide.html` on GitHub (op7418/nexttoken-topics) is the same
minified build as the published artifact, with no source map: identical symbol names
(`Ky={id:"boat"...}`). There is no readable source to copy, so everything above is reconstructed.
