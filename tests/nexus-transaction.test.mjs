import assert from "node:assert/strict";
import test from "node:test";

import { createOfflineDocument } from "@audiotool/nexus";
import { createDiskWasmLoader } from "@audiotool/nexus/node";
import { Ticks } from "@audiotool/nexus/utils";

import { writeHarmonicQuestArrangement } from "../app/nexus-arrangement.js";

const arrangement = {
  tempoBpm: 96,
  keyIndex: 9,
  keyName: "A",
  mode: "major",
  questId: "lift",
  chords: [
    { roman: "I", tones: [0, 4, 7] },
    { roman: "vi", tones: [9, 12, 16] },
    { roman: "V", tones: [7, 11, 14] },
    { roman: "I", tones: [0, 4, 7] },
  ],
};

async function createDocument() {
  return createOfflineDocument({ wasm: createDiskWasmLoader() });
}

async function writeArrangement(nexus, overrides = {}) {
  const transaction = await nexus.createTransaction();
  const result = writeHarmonicQuestArrangement(transaction, { ...arrangement, ...overrides });
  transaction.send();
  return result;
}

test("creates tempo config and the complete Harmonic Quest arrangement", async () => {
  const nexus = await createDocument();
  const result = await writeArrangement(nexus);

  assert.deepEqual(result, { status: "written", tempoConfigCreated: true });

  const configs = nexus.queryEntities.ofTypes("config").get();
  const grooves = nexus.queryEntities.ofTypes("groove").get();
  assert.equal(configs.length, 1);
  assert.equal(grooves.length, 1);
  assert.equal(configs[0].fields.tempoBpm.value, 96);
  assert.equal(configs[0].fields.signatureNumerator.value, 4);
  assert.equal(configs[0].fields.signatureDenominator.value, 4);
  assert.equal(grooves[0].fields.impact.value, 0);

  assert.equal(nexus.queryEntities.ofTypes("heisenberg").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("mixerChannel").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("desktopAudioCable").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("noteTrack").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("noteCollection").get().length, 1);

  const regions = nexus.queryEntities.ofTypes("noteRegion").get();
  assert.equal(regions.length, 1);
  assert.equal(regions[0].fields.region.fields.positionTicks.value, 0);
  assert.equal(regions[0].fields.region.fields.durationTicks.value, Ticks.Bars(4));
  assert.equal(regions[0].fields.region.fields.loopDurationTicks.value, Ticks.Bars(4));
  assert.equal(regions[0].fields.region.fields.displayName.value, "A major · I – vi – V – I");

  const notes = nexus.queryEntities.ofTypes("note").get();
  assert.equal(notes.length, 12);
  assert.deepEqual(
    [...new Set(notes.map((note) => note.fields.positionTicks.value))].sort((a, b) => a - b),
    [0, Ticks.SemiBreve, Ticks.SemiBreve * 2, Ticks.SemiBreve * 3],
  );
  assert.ok(notes.every((note) => note.fields.durationTicks.value === Ticks.SemiBreve - Ticks.SemiQuaver));
});

test("updates an existing config without creating another default groove", async () => {
  const nexus = await createDocument();
  const setup = await nexus.createTransaction();
  const existingGroove = setup.create("groove", {
    displayName: "Existing default",
    impact: 0.2,
  });
  setup.create("config", {
    defaultGroove: existingGroove.location,
    tempoBpm: 120,
  });
  setup.send();

  const result = await writeArrangement(nexus, { tempoBpm: 108 });

  assert.deepEqual(result, { status: "written", tempoConfigCreated: false });
  assert.equal(nexus.queryEntities.ofTypes("config").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("groove").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("config").getOne().fields.tempoBpm.value, 108);
  assert.equal(nexus.queryEntities.ofTypes("groove").getOne().fields.displayName.value, "Existing default");
});

test("preserves enabled tempo automation and makes no arrangement changes", async () => {
  const nexus = await createDocument();
  const setup = await nexus.createTransaction();
  const tempoTrack = setup.create("tempoAutomationTrack", { isEnabled: true });
  setup.create("automationEvent", {
    collection: tempoTrack.location,
    positionTicks: 0,
    value: 0.5,
  });
  setup.send();

  const result = await writeArrangement(nexus);

  assert.deepEqual(result, {
    status: "blocked",
    reason: "tempo-automation",
    automationEventCount: 1,
  });
  assert.equal(nexus.queryEntities.ofTypes("config").get().length, 0);
  assert.equal(nexus.queryEntities.ofTypes("groove").get().length, 0);
  assert.equal(nexus.queryEntities.ofTypes("heisenberg").get().length, 0);
  assert.equal(nexus.queryEntities.ofTypes("note").get().length, 0);
});
