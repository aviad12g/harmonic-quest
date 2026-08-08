# Harmonic Quest

Harmonic Quest is a four-move composition game for the Audiotool Let’s Build! 2026 hackathon. Players choose an emotional destination, build a four-bar chord progression by ear, learn why each transition works, preview the result, and write the finished MIDI arrangement into a live Audiotool project.

## Why it exists

Most harmony tools either generate a finished result or teach theory away from the act of making music. Harmonic Quest keeps the musician in the decision loop: every choice is audible, every move has a short explanation, and the result remains editable inside the DAW.

The project is designed to qualify across four hackathon categories:

- **Songstarter** — turns a blank page into a playable musical seed.
- **Composition** — explains function, tension, resolution, and voice leading.
- **Music Games** — frames composition as a three-move emotional quest.
- **Connect** — creates native Audiotool devices, routing, tracks, regions, and notes through Nexus.

## Nexus integration

After Audiotool OAuth authorization, the app opens a user-selected project with `@audiotool/nexus` and creates:

1. A polyphonic Heisenberg synthesizer.
2. A named mixer channel and desktop audio cable.
3. A note track and four-bar note region.
4. Twelve MIDI notes representing the selected chord voicings.

The browser app requests only the `project:write` scope. The OAuth client ID is public by design; no client secret or user token is committed.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The local server uses `http://127.0.0.1:3000/` because the Audiotool OAuth redirect must match a registered loopback URI.

## Validation

```bash
npm run build
node --test tests/rendered-html.test.mjs
```

## Submission materials

- Working application: deployed Sites URL
- Source: this repository
- Demo: 2–5 minute walkthrough showing the game and live Nexus write
- License: project code remains owned by the creator; Audiotool Nexus is MIT licensed
