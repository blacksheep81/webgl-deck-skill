# Scene cookbook

Patterns for the scene types the reference deck is made of. Each block is a complete scene object
for `SCENES` in the template (tested with `scripts/verify.js`). Adapt, don't paste blindly: the
point of a scene is its one idea.

General moves:
- **Background shader**: a full-screen quad mesh with a `ShaderMaterial` in the ortho scene, sized to
  the *visible* box (`ctx.view.x0..x1`, `y0..y1`), not 1920×1080, so it bleeds on any aspect.
- **Many things**: `InstancedMesh` (same geometry, per-instance matrix/colour) for hundreds to
  tens of thousands of objects; set matrices in `update` from `s`, never by integrating velocity.
- **y-down gotcha**: the 2D ortho camera flips triangle winding, so every material you create for it
  needs `side: THREE.DoubleSide` (the `text`/`type`/`rect` helpers already do this), or it is culled and silently invisible.
- **Determinism**: random layouts come from `ctx.rng(seed)` inside `create`.
- **Camera moves**: compute position from `s.k(...)` each frame (`lerp` between keyframes).

## 1. Sea / water surface (background shader + a floating object)
```js
{
  id: 'sea', title: 'Rising sea', enterWith: 'fold', hud: '#ffffff',
  beats: [{ dur: 3, notes: 'Calm sea, small boat.' }, { dur: 4, notes: 'The water keeps rising.' }],
  create(ctx) {
    const { THREE, view } = ctx, scene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({ depthTest: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uLevel: { value: 0 }, uRect: { value: new THREE.Vector4() } },
      vertexShader: `varying vec2 vP; uniform vec4 uRect; void main(){ vP = mix(uRect.xy, uRect.zw, uv);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vP, 0., 1.); }`,
      fragmentShader: `varying vec2 vP; uniform float uT, uLevel; ${ctx.GLSL_LIB}
        void main(){ float horizon = 700. - uLevel*380.;
          float wave = horizon + 14.*sin(vP.x*.008 + uT*1.3) + 8.*sin(vP.x*.021 - uT*2.1) + 30.*(fbm(vec2(vP.x*.002, uT*.2))-.5);
          vec3 sky = mix(vec3(.98,.86,.70), vec3(.55,.70,.86), smoothstep(700., 0., vP.y));
          float depth = clamp((vP.y - wave)/500., 0., 1.);
          vec3 sea = mix(vec3(.16,.42,.55), vec3(.03,.10,.20), depth) + .25*exp(-(vP.y-wave)*.08);   // foam line
          gl_FragColor = vec4(vP.y < wave ? sky : sea, 1.); }` });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); quad.frustumCulled = false;
    const boat = new THREE.Group();
    const hull = ctx.rect(-90, -10, 180, 34, '#2a1a10'), sail = ctx.rect(-6, -150, 10, 140, '#2a1a10');
    boat.add(hull, sail);
    scene.add(quad, boat);
    return { scene, update(s) {
      mat.uniforms.uRect.value.set(view.x0, view.y0, view.x1, view.y1);   // quad covers the visible box, incl. bleed
      const level = ctx.ease.io3(s.k(1, 0, 4)); mat.uniforms.uT.value = s.t; mat.uniforms.uLevel.value = level;
      const y = 700 - level * 380 + 14 * Math.sin(960 * .008 + s.t * 1.3);   // ride the same wave function at x=960
      boat.position.set(960, y - 12, 0); boat.rotation.z = .05 * Math.sin(s.t * 1.7);
    } };
  },
}
```
The trick: the object reads the same wave formula in JS that the shader uses on the GPU, so it floats exactly on the surface.

## 2. Swarm (instanced particles flowing to a formation)
```js
{
  id: 'swarm', title: 'A country of them', enterWith: 'portal-in', hud: '#e8e2d6',
  beats: [{ dur: 2.5, notes: 'One agent.' }, { dur: 3.5, notes: 'Then thousands, organising themselves.' }],
  create(ctx) {
    const { THREE } = ctx, scene = new THREE.Scene(); scene.background = new THREE.Color('#14130f');
    const N = 3000, r = ctx.rng(42), from = [], to = [];
    for (let i = 0; i < N; i++) {
      from.push([960 + (r() - .5) * 2600, 540 + (r() - .5) * 1600]);
      const a = i / N * Math.PI * 2 * 7, rad = 40 + 380 * Math.sqrt(i / N);       // spiral formation
      to.push([960 + Math.cos(a) * rad, 540 + Math.sin(a) * rad]);
    }
    const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(3.2, 8), new THREE.MeshBasicMaterial({ color: '#e8e2d6', side: THREE.DoubleSide }), N);
    mesh.frustumCulled = false; scene.add(mesh);
    const one = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: '#ffb35c', side: THREE.DoubleSide })); one.position.set(960, 540, 1); scene.add(one);
    const m = new THREE.Matrix4();
    return { scene, update(s) {
      one.scale.setScalar(ctx.ease.outBack(s.k(0, 0, .8)) + 1e-3);
      for (let i = 0; i < N; i++) {
        const k = ctx.ease.io3(s.k(1, (i % 97) / 97 * 1.2, (i % 97) / 97 * 1.2 + 2.2));   // staggered arrival
        const wob = 6 * Math.sin(s.t * 2 + i);
        const x = ctx.lerp(from[i][0], to[i][0], k) + wob, y = ctx.lerp(from[i][1], to[i][1], k) + wob * .6;
        m.makeScale(k > 0 ? 1 : 0, k > 0 ? 1 : 0, 1).setPosition(x, y, 0); mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    } };
  },
}
```

## 3. Line chart that draws itself, with a moving label
```js
{
  id: 'curve', title: 'The real chart', enterWith: 'line', hud: '#243039',
  beats: [{ dur: 2.5, notes: 'Linear axis: it looks flat for years.' }, { dur: 2, notes: 'Then it does not.' }],
  create(ctx) {
    const { THREE } = ctx, scene = new THREE.Scene(); scene.background = new THREE.Color('#f3f1ea');
    const pts = Array.from({ length: 200 }, (_, i) => { const t = i / 199; return [160 + t * 1600, 940 - 760 * Math.pow(t, 6)]; });
    // thick line as a triangle strip so it can be revealed by drawRange
    const pos = new Float32Array(pts.length * 2 * 3);
    pts.forEach(([x, y], i) => { const [nx, ny] = pts[Math.min(i + 1, pts.length - 1)], [px, py] = pts[Math.max(i - 1, 0)];
      let dx = nx - px, dy = ny - py; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; const w = 4;
      pos.set([x - dy * w, y + dx * w, 0, x + dy * w, y - dx * w, 0], i * 6); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = []; for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
    const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#d0402b', side: THREE.DoubleSide }));
    const axis = ctx.rect(160, 940, 1600, 2, '#243039'), dot = new THREE.Mesh(new THREE.CircleGeometry(12, 24), new THREE.MeshBasicMaterial({ color: '#d0402b' }));
    const label = ctx.text('today', { x: 0, y: 0, size: 40, font: 'mono', color: '#243039', valign: 'bottom' });
    const title = ctx.text('Capability over time', { x: 160, y: 90, size: 64, color: '#243039' });
    scene.add(axis, line, dot, label, title);
    return { scene, update(s) {
      const k = s.k(0, 0, 2.5, ctx.ease.io3) * .7 + s.k(1, 0, 2, ctx.ease.io3) * .3;     // beat 1 draws 70 %, beat 2 the rest
      const n = Math.max(1, Math.floor(k * (pts.length - 1)));
      geo.setDrawRange(0, n * 6);
      const [x, y] = pts[n]; dot.position.set(x, y, 0); label.pose(1, x + 20, y - 20);   // label was built at (0,0): pose offsets it
      title.pose(s.k(0, 0, .8, ctx.ease.out3));
    } };
  },
}
```

## 4. Crowd / grid of tiles that reorganise (instanced boxes in 3D)
```js
{
  id: 'grid', title: 'Thirty steps', enterWith: 'flaps', hud: '#ffffff',
  beats: [{ dur: 2, notes: 'Thirty tasks in a row.' }, { dur: 3, notes: 'Each one tips the next.' }],
  create(ctx) {
    const { THREE } = ctx, scene = new THREE.Scene(); scene.background = new THREE.Color('#1a1712');
    const cam = new THREE.PerspectiveCamera(30, 16 / 9, .1, 200);
    const N = 30, mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.25, 2, 1), new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: .6 }), N);
    scene.add(mesh, new THREE.HemisphereLight('#fff', '#443', 1.4)); const sun = new THREE.DirectionalLight('#fff', 2.5); sun.position.set(-4, 8, 6); scene.add(sun);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    return { scene, camera: cam, update(s) {
      for (let i = 0; i < N; i++) {
        const rise = ctx.ease.outBack(s.k(0, i * .04, i * .04 + .5));
        const fall = ctx.ease.in3(s.k(1, i * .09, i * .09 + .35)) * 1.25;          // domino: each starts after the previous
        e.set(0, 0, -fall); q.setFromEuler(e);
        p.set((i - N / 2) * .9, -1 + rise, 0);
        m.compose(p, q, one.set(1, Math.max(rise, 1e-3), 1)); mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      const k = s.k(1, 0, 3, ctx.ease.io3);
      cam.position.set(ctx.lerp(-6, 8, k), 3.5, ctx.lerp(22, 16, k)); cam.lookAt(ctx.lerp(-8, 6, k), 0, 0);
    } };
  },
}
```

## 5. Kinetic type recipes (`ctx.type`)
All go inside `update(s)`; `w = ctx.type(...)` built in `create`.
```js
// stagger rise (titles)
w.animate((g, v) => { const m = s.k(0, g.n * .045, g.n * .045 + .9, ease.out4); v.alpha = m; v.dy = (1 - m) * 70; v.rot = (1 - m) * .12; });

// slot machine: each letter drops from far above/below, alternating
w.animate((g, v) => { const m = s.k(0, g.n * .07, g.n * .07 + .55, ease.out4); v.dy = (1 - m) * (g.n % 2 ? 900 : -900); });

// breathing widths, total width preserved (letters re-packed)
const ws = w.glyphs.map(g => g.w * (1 + .3 * Math.sin(s.t * 3 - g.n * .9)));
const sc = w.bounds.w / ws.reduce((a, b) => a + b, 0); let x = w.bounds.x;
w.animate((g, v) => { const gw = ws[g.n] * sc; v.sx = gw / g.w; v.dx = x + gw / 2 - g.cx; x += gw; });

// typewriter with a stepped (pixel) feel
const step = Math.floor(s.at(0) * 14) / 14; w.animate((g, v) => { v.alpha = step > g.n * .05 ? 1 : 0; });

// italic lean that settles
w.animate((g, v) => { const m = s.k(0, g.n * .03, g.n * .03 + .6, ease.out3); v.skew = (1 - m) * .6; v.alpha = m; });
```

## 6. Procedural texture once, used every frame
Generate in `create` with a pass into a render target; sample it in materials. Free it in `dispose`.
```js
const rt = new THREE.WebGLRenderTarget(1024, 1024);
const gen = ctx.pass(`void main(){ gl_FragColor = vec4(vec3(fbm(vUv*8.)), 1.); }`);
gen.render(rt); gen.dispose();
const paper = new THREE.MeshBasicMaterial({ map: rt.texture });
return { scene, update(s) { ... }, dispose() { rt.dispose(); } };
```
