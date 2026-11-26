# Writing transitions

A transition is `{ dur, sound, frag }` in `TRANSITIONS` (template §4). The fragment shader gets:

| uniform | meaning |
|---|---|
| `tA` | outgoing scene, live (keeps animating) |
| `tB` | incoming scene, live |
| `p` | 0 → 1 over `dur` seconds (linear; ease inside the shader) |
| `uAspect` | width / height; multiply x by it before measuring distances or circles look oval |
| `uTime` | seconds, for noise animation |

Helpers available in every pass: `hash12, vnoise, fbm, luma`. `vUv` is 0..1 with (0,0) bottom-left.
Write GLSL ES 1.0 style (`texture2D`, `gl_FragColor`); three.js handles the rest.

Reverse navigation plays the same shader with `tA`/`tB` swapped and `p` running 1 → 0, so design
transitions that still read well backwards.

## Recipe
1. Decide the **mask**: a function `m(uv, p)` in 0..1 saying where B is visible.
   `step`/`smoothstep` of a distance, a noise field, a luminance field.
2. Decide the **warp** of each side: how `uv` is bent before sampling A and B
   (scale toward centre, mirror across a fold line, shift two halves apart).
3. Add **light at the front**: `exp(-pow(d/width, 2.))` at the mask boundary, multiplied by
   `sin(π p)` so it fades at both ends.
4. Add **one physical cue**: shadow under a flap, paper-coloured edge on a tear, shake after a slam.
5. Make sure p=0 is exactly A and p=1 is exactly B (otherwise the cut is visible).

## Catalog in the template
| name | idea | mask / warp |
|---|---|---|
| `fade` | neutral | `mix(A,B,smoothstep(p))` |
| `line` | a scan line reveals the truth | vertical threshold with sine wobble + glow |
| `slam` | a hard fact lands | B scales 3.2→1 cubic, then decaying shake; A dims |
| `fold` | turn the page | fold line `f=1-p`; flap region mirrors A as shaded paper back; shadows on both sides |
| `tear` | split into two futures | ragged fbm edge, halves shifted ±0.62·p, fibrous white rim |
| `portal-in` | go inside | aspect-correct circle grows, lens bend at rim, B zooms 1.35→1 |
| `portal-out` | step back out | circle of A shrinks and scales down over B |
| `daybreak` | optimism | light front rising through `(1-y) + luma(A) + fbm` field, warm glow |

The reference deck also has `wash` (ink/water wipe) and `flaps` (split-flap board).

## Going beyond one pass
The reference makes `tear` and `fold` out of **real geometry**: a subdivided plane textured with
A, deformed in a vertex shader (curl around a cylinder for fold; two meshes with a noisy shared
edge pulled apart for tear), lit, with a procedural paper texture for the back side, rendered over
B. Pattern:
```js
create(ctx) {
  const geo = new THREE.PlaneGeometry(1920, 1080, 160, 90);
  const mat = new THREE.ShaderMaterial({ uniforms: { tA:{value:null}, p:{value:0} }, side: THREE.DoubleSide,
    vertexShader: `uniform float p; varying vec2 vUv; varying float vShade; void main(){
      vUv = uv; vec3 q = position; float fx = mix(1920., -400., p); float r = 120.;
      if (q.x > fx) { float a = (q.x - fx) / r; q.x = fx + sin(a) * r; q.z = (1. - cos(a)) * r; }   // curl
      vShade = q.z / (2. * r); gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.); }`,
    fragmentShader: `...sample tA, darken by vShade, paper colour on back faces via gl_FrontFacing...` });
  // render: draw B as a full-screen quad, then this mesh with a perspective camera on top.
}
```
To support that, change the engine so a transition may own a `render({A,B,p,out})` method
instead of a `frag` string (that is how the reference is structured, §5 of architecture.md).
