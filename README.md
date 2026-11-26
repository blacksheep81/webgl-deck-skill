# webgl-deck skill

A Claude skill for building cinematic, full-screen WebGL presentations as a single HTML file:
three.js on one canvas, every slide a scene animated in beats, per-letter kinetic type, shader and
geometry transitions (page curl, paper tear, split-flap, portal, ink wash…), speaker notes, overview
grid, keyboard help and procedural sound.

The architecture is reverse-engineered from the hand-built deck "The Last Boring Slide".

## Contents
| path | what |
|---|---|
| `SKILL.md` | when to use it + the step-by-step workflow (SOP) |
| `assets/template.html` | working engine: 6 demo scenes, 10 transitions, notes/overview/help/autoplay |
| `scripts/verify.js` | headless render of every beat + transition → contact sheet, fails on shader/JS errors |
| `scripts/inline.py` | makes one offline file: embeds three.js, fonts and images |
| `references/architecture.md` | how the reference deck is built, and what the template covers |
| `references/transitions.md` | how to write fragment and geometry transitions |
| `references/scene-cookbook.md` | tested recipes: water, swarm, self-drawing chart, dominoes, kinetic type |

## Install
- Claude Code: `git clone https://github.com/blacksheep81/webgl-deck-skill ~/.claude/skills/webgl-deck`
- claude.ai: zip this folder (named `webgl-deck`) and upload it under Settings → Capabilities → Skills

## Try it
Open `assets/template.html` in a browser. Keys: → next · ← back · O overview · N notes · ? help.

```bash
npm i playwright
node scripts/verify.js assets/template.html shots --all-transitions --sizes 2560x1080,390x844
python3 scripts/inline.py assets/template.html -o deck.offline.html
```
