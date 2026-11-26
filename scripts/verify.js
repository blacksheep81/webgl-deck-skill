#!/usr/bin/env node
/*
  verify.js: render every beat and every transition of a webgl-deck to PNGs, collect errors,
  and write a contact sheet (index.html) you can open to review the whole deck at once.

  usage:
    node verify.js deck.html [outDir] [options]

  options:
    --three <path>        serve three.js from a local file instead of the CDN (offline / sandboxed machines)
    --block-net           abort every http(s) request (proves an inlined/offline build is self-contained)
    --sizes 1920x1080,2560x1080,390x844   extra viewports: the final beat of every scene is shot at each
    --all-transitions     also shoot every transition between scene 1 and 2 (to review the whole catalog)
    --at 0.45             where in a transition to take the shot (0..1)

  needs: npm i playwright   (and `npx playwright install chromium` if no Chromium is installed)
  exit code 1 if the page threw, a shader failed to compile, or a console error was logged.
*/
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch { console.error('Install Playwright first: npm i playwright'); process.exit(2); }

const args = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < args.length; i++) { const a = args[i];
  if (a.startsWith('--')) { const k = a.slice(2); opt[k] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : true; } else pos.push(a); }
if (!pos[0]) { console.error('usage: node verify.js deck.html [outDir] [--three path] [--block-net] [--sizes WxH,...] [--all-transitions]'); process.exit(2); }
const file = path.resolve(pos[0]), out = path.resolve(pos[1] || 'deck-shots'), AT = +(opt.at || .45);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [], warnings = [];
  page.on('pageerror', e => errors.push('page error: ' + e.message));
  page.on('console', m => { const t = m.text();
    if (/GPU stall|GL Driver Message|ReadPixels/.test(t)) return;                     // SwiftShader noise
    if (m.type() === 'error') (/Failed to load resource/.test(t) ? warnings : errors).push(t);
    else if (m.type() === 'warning' && /shader|WebGL|THREE/i.test(t)) errors.push(t); });
  page.on('requestfailed', r => warnings.push('request failed: ' + r.url().slice(0, 120)));
  if (opt.three) await page.route(/three(\.module)?(\.min)?\.js(\?.*)?$/, r => r.fulfill({ path: path.resolve(opt.three), contentType: 'text/javascript' }));
  if (opt['block-net']) await page.route(/^https?:/, r => r.abort());

  await page.goto('file://' + file + '?headless');
  await page.waitForFunction(() => window.deck || document.querySelector('.load b'), null, { timeout: 30000 });
  const failMsg = await page.evaluate(() => !window.deck && document.querySelector('.load')?.innerText);
  if (failMsg) { console.error('Deck did not start:\n' + failMsg + '\n' + errors.join('\n')); await browser.close(); process.exit(1); }

  const scenes = await page.evaluate(() => deck.list()), durs = await page.evaluate(() => deck.transitions());
  const shots = [];
  const shoot = async (name, caption, group) => { const f = name + '.png'; await page.screenshot({ path: path.join(out, f) }); shots.push({ f, caption, group }); };
  const pad = i => String(i + 1).padStart(2, '0');

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    if (i > 0) {                                                 // the entering transition, mid-flight
      const prev = scenes[i - 1];
      await page.evaluate(([a, b]) => { deck.jump(a, b, true); deck.step(0); }, [i - 1, prev.beats.length - 1]);
      await page.evaluate(([to, t]) => { deck.go(to); deck.step(t); }, [i, (durs[sc.enterWith] || .7) * AT]);
      await shoot(`${pad(i)}-${sc.id}-0-${sc.enterWith}`, `${i + 1}. ${sc.id}  ←  ${sc.enterWith} @${AT}`, 'Scenes');
    }
    for (let b = 0; b < sc.beats.length; b++) {
      // land on beat b finished, plus a little settle time for anything that loops on s.t
      await page.evaluate(([i, b]) => { deck.jump(i, b, true); deck.step(.3); }, [i, b]);
      await shoot(`${pad(i)}-${sc.id}-${b + 1}`, `${i + 1}. ${sc.id}  beat ${b + 1}/${sc.beats.length}`, 'Scenes');
    }
  }
  if (opt['all-transitions'] && scenes.length > 1) {
    for (const [name, dur] of Object.entries(durs)) for (const at of [.25, .5, .75]) {
      await page.evaluate(n => { deck.jump(0, deck.list()[0].beats.length - 1, true); deck.step(0); }, name);
      await page.evaluate(([n, t]) => { deck.go(1, { via: n }); deck.step(t); }, [name, dur * at]);
      await shoot(`t-${name}-${Math.round(at * 100)}`, `${name} @${at}`, 'Transitions');
    }
  }
  for (const size of String(opt.sizes || '').split(',').filter(Boolean)) {
    const [w, h] = size.split('x').map(Number); await page.setViewportSize({ width: w, height: h });
    for (let i = 0; i < scenes.length; i++) {
      await page.evaluate(([i, b]) => { deck.jump(i, b, true); deck.step(.3); }, [i, scenes[i].beats.length - 1]);
      await shoot(`v${w}x${h}-${pad(i)}-${scenes[i].id}`, `${scenes[i].id}  ${w}×${h}`, `Viewport ${w}×${h}`);
    }
  }
  await browser.close();

  const groups = [...new Set(shots.map(s => s.group))];
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Deck contact sheet</title>
<style>body{margin:0;padding:24px;background:#111;color:#ddd;font:14px system-ui}h2{font-weight:500;margin:28px 0 12px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}figure{margin:0}img{width:100%;display:block;border-radius:4px;background:#222}
figcaption{margin-top:6px;color:#999;font-family:ui-monospace,monospace;font-size:12px}.err{background:#3a1414;color:#ffb4b4;padding:12px 16px;border-radius:6px;white-space:pre-wrap}</style>
<h1>${esc(path.basename(file))}</h1>${errors.length ? `<div class="err">${esc(errors.join('\n'))}</div>` : '<p>No errors.</p>'}
${groups.map(g => `<h2>${esc(g)}</h2><div class="g">${shots.filter(s => s.group === g).map(s => `<figure><img loading="lazy" src="${s.f}"><figcaption>${esc(s.caption)}</figcaption></figure>`).join('')}</div>`).join('\n')}`);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ file, scenes: scenes.length, shots: shots.length, errors, warnings }, null, 2));

  console.log(`${shots.length} screenshots → ${out}/index.html`);
  if (warnings.length) console.log(`${warnings.length} warning(s), e.g. ${warnings[0]}`);
  if (errors.length) { console.error(`${errors.length} error(s):\n  ` + errors.join('\n  ')); process.exit(1); }
  console.log('OK: no errors.');
})().catch(e => { console.error(e); process.exit(1); });
