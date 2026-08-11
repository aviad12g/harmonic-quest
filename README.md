# Harmonic Quest

Harmonic Quest is a four-bar, three-choice composition quest for the Audiotool Let’s Build! 2026 hackathon. Players choose an emotional destination, build a chord progression by ear, learn why each transition works, preview the result, and write the finished MIDI arrangement into a live Audiotool project.

**Live app:** https://harmonic-quest-nexus.aviadcoh.chatgpt.site

**Local draft walkthrough:** [Watch the 2:25 narrated concept walkthrough](demo/harmonic-quest-demo.mp4). A public, under-three-minute recording of the app working with Audiotool is still pending.

## Why it exists

Most harmony tools either generate a finished result or teach theory away from the act of making music. Harmonic Quest keeps the musician in the decision loop: every choice is audible, every move has a short explanation, and the result remains editable inside the DAW.

The authenticated final form allows multiple categories, judged independently. Harmonic Quest is being prepared for these four:

- **CH-01 Ideation & Discovery** — turns a blank page into a playable musical seed.
- **CH-02 Composition & Theory** — explains function, tension, resolution, and voice leading.
- **CH-03 Music Games & Interactive Experiences** — frames composition as a short, replayable, choice-driven quest.
- **CH-05 Connect & Integrate** — creates native Audiotool devices, routing, tracks, regions, and notes through Nexus.

Development began on August 1, 2026. The final-form deadline is Sunday, August 23, 2026 at 23:59 local time. On August 11, organizer Ralf Noetzel confirmed by email that the older May 28–July 6 dates still shown in the form are a mistake and that an entry may select multiple categories. The project has not been represented here as submitted.

## Nexus integration

After Audiotool OAuth authorization, the app opens a user-selected project with `@audiotool/nexus`. When the project's tempo configuration is unambiguous and no enabled tempo automation would override it, one atomic transaction sets the selected BPM and creates:

1. A polyphonic Heisenberg synthesizer.
2. A named mixer channel and desktop audio cable.
3. A MIDI note track, note collection, and one editable four-bar note region.
4. Twelve MIDI notes representing the four selected chord voicings.

If enabled tempo automation would take precedence, Harmonic Quest leaves the project unchanged and asks the player to disable that automation or use a clean project.

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
npm test
npm run lint
```

## Submission materials

- Working application: https://harmonic-quest-nexus.aviadcoh.chatgpt.site
- Source: https://github.com/aviad12g/harmonic-quest
- Local draft: [2:25 narrated concept walkthrough](demo/harmonic-quest-demo.mp4)
- Final public in-app demo: pending
- License: project code remains owned by the creator; Audiotool Nexus is MIT licensed
