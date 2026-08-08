import assert from "node:assert/strict";
import test from "node:test";

import { createOfflineDocument } from "@audiotool/nexus";
import { createDiskWasmLoader } from "@audiotool/nexus/node";
import { Ticks } from "@audiotool/nexus/utils";

test("creates the Harmonic Quest Nexus arrangement", async () => {
  const nexus = await createOfflineDocument({ wasm: createDiskWasmLoader() });
  const totalTicks = Ticks.Bars(4);
  const progression = [
    [0, 4, 7],
    [9, 12, 16],
    [7, 11, 14],
    [0, 4, 7],
  ];

  const transaction = await nexus.createTransaction();
  const synth = transaction.create("heisenberg", {
    displayName: "Harmonic Quest · Chords",
    positionX: 120,
    positionY: 160,
    playModeIndex: 4,
    gain: 0.58,
    unisonoCount: 2,
    unisonoStereoSpreadFactor: 0.36,
  });
  const channel = transaction.create("mixerChannel", {});
  transaction.update(channel.fields.displayParameters.fields.orderAmongStrips, 0);
  transaction.update(channel.fields.displayParameters.fields.displayName, "Harmonic Quest");
  transaction.update(channel.fields.displayParameters.fields.colorIndex, 6);
  transaction.create("desktopAudioCable", {
    fromSocket: synth.fields.audioOutput.location,
    toSocket: channel.fields.audioInput.location,
    colorIndex: 6,
  });

  const track = transaction.create("noteTrack", {
    player: synth.location,
    orderAmongTracks: 0,
  });
  const collection = transaction.create("noteCollection", {});
  const noteRegion = transaction.create("noteRegion", {
    track: track.location,
    collection: collection.location,
  });
  transaction.update(noteRegion.fields.region.fields.positionTicks, 0);
  transaction.update(noteRegion.fields.region.fields.durationTicks, totalTicks);
  transaction.update(noteRegion.fields.region.fields.loopDurationTicks, totalTicks);
  transaction.update(noteRegion.fields.region.fields.collectionOffsetTicks, 0);
  transaction.update(noteRegion.fields.region.fields.loopOffsetTicks, 0);
  transaction.update(noteRegion.fields.region.fields.colorIndex, 6);
  transaction.update(noteRegion.fields.region.fields.displayName, "A major · I – vi – V – I");

  progression.forEach((tones, barIndex) => {
    tones.forEach((tone, toneIndex) => {
      transaction.create("note", {
        collection: collection.location,
        positionTicks: barIndex * Ticks.SemiBreve,
        durationTicks: Ticks.SemiBreve - Ticks.SemiQuaver,
        pitch: 57 + tone,
        velocity: toneIndex === 0 ? 0.76 : 0.64,
      });
    });
  });
  transaction.send();

  assert.equal(nexus.queryEntities.ofTypes("heisenberg").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("noteTrack").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("noteRegion").get().length, 1);
  assert.equal(nexus.queryEntities.ofTypes("note").get().length, 12);
});
