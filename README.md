# webgl-deck skill

A Claude skill for building cinematic, full-screen WebGL presentations as a single HTML file:
three.js on one canvas, each slide a scene animated in beats, custom GLSL shader transitions,
speaker notes, overview grid, keyboard help and procedural sound.

The architecture is reverse-engineered from the hand-built deck "The Last Boring Slide".

## Contents
- `SKILL.md`: when to use it and the step-by-step workflow (SOP)
- `references/architecture.md`: how the reference deck is built, module by module
- `references/transitions.md`: how to write shader transitions, plus a catalog
- `assets/template.html`: working starter engine (4 demo scenes, 8 transitions)

## Install
- claude.ai: zip the `webgl-deck` folder and upload it under Settings → Capabilities → Skills
- Claude Code: copy this folder to `~/.claude/skills/webgl-deck/`

## Try the template
Open `assets/template.html` in a browser. Keys: → next, ← back, O overview, N notes, ? help.
