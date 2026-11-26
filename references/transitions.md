# Writing transitions

Transitions live in `TRANSITIONS` (template §4) and come in two forms.

**Simple: a fragment shader** `{ dur, sound, frag }`

| uniform | meaning |
|---|---|
| `tA` | outgoing scene, live (keeps animating) |
| `tB` | incoming scene, live |
| `p` | 0 → 1 over `dur` seconds (linear; ease inside the shader) |
| `uAspect` | width / height; multiply x by it before measuring distances or circles look oval |
| `uTime` | seconds, for noise animation |

Helpers in every pass: `hash12, vnoise, fbm, luma` (also exported as `ctx.GLSL_LIB` for your own shaders).
`vUv` is 0..1 with (0,0) bottom-left. Write GLSL ES 1.0 style (`texture2D`, `gl_FragColor`); three.js
compiles it as GLSL ES 3, so **don't name variables `half`, `input`, `output`, `sample`, `filter`**.

**Full: geometry** `{ dur, sound, create(ctx) }` → `{ render({ A, B, p, out, aspect, time }), dispose() }`
`A`/`B` are render targets (use `.texture`), `out` is the target to draw into (it has a depth buffer).
Draw B first (usually a `ctx.pass` into `out`), then your meshes over it with
`renderer.autoClear = false` (restore it afterwards). Free everything in `dispose()`: transitions
that are not needed soon are parked like scenes.

Reverse navigation plays the same transition with A/B swapped and `p` running 1 → 0, so design
transitions that also read well backwards. `sound` names a method on `audio`
(`whoosh, rip, clack, tick, thud`).

## Recipe (fragment form)
1. **Mask**: a function `m(uv, p)` in 0..1 saying where B is visible: `step`/`smoothstep` of a
   distance, a noise field, a luminance field.
2. **Warp** each side: bend `uv` before sampling A and B (zoom toward centre, mirror across a line,
   shift halves apart).
3. **Light at the front**: `exp(-pow(d/width, 2.))` at the mask boundary, times `sin(π p)` so it fades
   at both ends.
4. **One physical cue**: shadow under a flap, paper-coloured edge on a tear, shake after a slam.
5. p=0 must be exactly A and p=1 exactly B, otherwise the cut is visible.

## Recipe (geometry form)
1. Choose the surface: a subdivided `PlaneGeometry(2, 2, X, Y)` in clip space (multiply x by
   `uAspect` in the vertex shader to work in square units), or instanced tiles.
2. Deform in the **vertex shader** from `p` alone (curl, swing, flip), and output
   `gl_Position = vec4(x/uAspect, y, depth, 1.)` (clip space directly, no camera needed),
   or use a `PerspectiveCamera` for real perspective (flaps does).
3. Shade from the deformation (angle → brightness), use `gl_FrontFacing` to draw the **back** of
   the page (paper colour, or the other slide as in flaps).
4. Shadows: either darken B in its pass near the moving edge (fold) or draw a dark, offset copy of the
   mesh first (tear).

## Catalog in the template
| name | form | idea | how |
|---|---|---|---|
| `fade` | frag | neutral | `mix(A,B,smoothstep(p))` |
| `line` | frag | scanning reveal | vertical threshold with sine wobble + glow |
| `slam` | frag | a hard fact lands | B scales 3.2→1 cubic, then decaying shake; A dims |
| `wash` | frag | gentle change | fbm-noisy wet front, pooled-pigment dark line, local refraction |
| `portal-in` | frag | going inside | aspect-correct circle grows, lens bend at rim, B zooms 1.35→1 |
| `portal-out` | frag | stepping back | circle of A shrinks and scales down over B |
| `daybreak` | frag | optimism | light front rising through `(1-y) + luma(A) + fbm`, warm glow |
| `fold` | geometry | turning the page | 256-segment page rolled around a tilted moving cylinder; lit front, paper back, cast shadow on B |
| `tear` | geometry | splitting into two futures | two meshes split along an fbm edge, swing from their bottom corners, drop shadows, fibrous rim |
| `flaps` | geometry | data / departures board | 16×9 instanced tiles flip in a staggered wave in perspective, A front, B back |

The reference deck's versions go further: `portal` raymarches, `tear` uses a procedural paper
texture and lighting, and every transition has its own scored sound recipe (see architecture.md §8).
