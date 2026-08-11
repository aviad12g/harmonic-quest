import { Ticks } from "@audiotool/nexus/utils";

/**
 * @typedef {Object} ArrangementChord
 * @property {string} roman
 * @property {readonly number[]} tones
 */

/**
 * @typedef {Object} ArrangementOptions
 * @property {number} tempoBpm
 * @property {number} keyIndex
 * @property {string} keyName
 * @property {"major" | "minor"} mode
 * @property {string} questId
 * @property {readonly ArrangementChord[]} chords
 * @property {(stage: string) => void} [onStage]
 */

/**
 * @typedef {{ status: "written", tempoConfigCreated: boolean }} ArrangementWritten
 * @typedef {{ status: "blocked", reason: "tempo-automation", automationEventCount: number }} TempoAutomationBlocked
 * @typedef {{ status: "blocked", reason: "ambiguous-config" | "ambiguous-tempo-automation" }} AmbiguousProjectBlocked
 * @typedef {ArrangementWritten | TempoAutomationBlocked | AmbiguousProjectBlocked} ArrangementResult
 */

/**
 * Add a complete Harmonic Quest arrangement to an Audiotool transaction.
 *
 * Project tempo is updated atomically with the MIDI arrangement. An enabled
 * tempo-automation track takes precedence over Config. In that case this
 * function returns before making any changes so the caller cannot report a
 * tempo that Audiotool would ignore.
 *
 * @param {import("@audiotool/nexus").SafeTransactionBuilder} transaction
 * @param {ArrangementOptions} options
 * @returns {ArrangementResult}
 */
export function writeHarmonicQuestArrangement(transaction, options) {
  const {
    tempoBpm,
    keyIndex,
    keyName,
    mode,
    questId,
    chords,
    onStage = () => {},
  } = options;

  onStage("checking project tempo automation");
  const tempoAutomationTracks = transaction.entities
    .ofTypes("tempoAutomationTrack")
    .get();
  if (tempoAutomationTracks.length > 1) {
    return { status: "blocked", reason: "ambiguous-tempo-automation" };
  }

  const tempoAutomationTrack = tempoAutomationTracks[0];
  if (tempoAutomationTrack?.fields.isEnabled.value) {
    const automationEventCount = transaction.entities
      .ofTypes("automationEvent")
      .pointingTo.locations(tempoAutomationTrack.location)
      .get().length;
    return { status: "blocked", reason: "tempo-automation", automationEventCount };
  }

  onStage("setting the project tempo");
  const configs = transaction.entities.ofTypes("config").get();
  if (configs.length > 1) {
    return { status: "blocked", reason: "ambiguous-config" };
  }

  let tempoConfigCreated = false;
  const config = configs[0];
  if (config) {
    transaction.update(config.fields.tempoBpm, tempoBpm);
  } else {
    onStage("creating the default project tempo configuration");
    const defaultGroove = transaction.create("groove", {
      functionIndex: 1,
      durationTicks: Ticks.SemiQuaver * 2,
      impact: 0,
      displayName: "Harmonic Quest · Default groove",
    });
    transaction.create("config", {
      defaultGroove: defaultGroove.location,
      tempoBpm,
      baseFrequencyHz: 440,
      signatureNumerator: 4,
      signatureDenominator: 4,
    });
    tempoConfigCreated = true;
  }

  const colorIndex = questId === "shadow" ? 10 : questId === "drift" ? 22 : 6;
  const totalTicks = Ticks.Bars(4);

  onStage("querying existing tracks and channels");
  const trackOrder = transaction.entities.ofTypes("noteTrack").get().length;
  const stripOrder = transaction.entities.ofTypes("mixerChannel").get().length;
  onStage("finding earlier Harmonic Quest devices");
  const previousSynths = transaction.entities
    .ofTypes("heisenberg")
    .get()
    .filter((entity) => entity.fields.displayName.value === "Harmonic Quest · Chords");

  onStage("replacing an earlier Harmonic Quest arrangement");
  previousSynths.forEach((entity) => transaction.removeWithDependencies(entity));
  onStage("creating the Heisenberg synth");
  const synth = transaction.create("heisenberg", {
    displayName: "Harmonic Quest · Chords",
    positionX: 120,
    positionY: 160 + stripOrder * 36,
    playModeIndex: 4,
    gain: 0.58,
    unisonoCount: 2,
    unisonoStereoSpreadFactor: 0.36,
  });
  onStage("creating the mixer channel");
  const channel = transaction.create("mixerChannel", {});
  onStage("labeling the mixer channel");
  transaction.update(channel.fields.displayParameters.fields.orderAmongStrips, stripOrder);
  transaction.update(channel.fields.displayParameters.fields.displayName, "Harmonic Quest");
  transaction.update(channel.fields.displayParameters.fields.colorIndex, colorIndex);
  onStage("connecting the synth to the mixer");
  transaction.create("desktopAudioCable", {
    fromSocket: synth.fields.audioOutput.location,
    toSocket: channel.fields.audioInput.location,
    colorIndex: questId === "shadow" ? 10 : 6,
  });
  onStage("creating the MIDI track");
  const track = transaction.create("noteTrack", {
    player: synth.location,
    orderAmongTracks: trackOrder,
  });
  onStage("creating the note collection");
  const collection = transaction.create("noteCollection", {});
  onStage("creating the four-bar MIDI region");
  const noteRegion = transaction.create("noteRegion", {
    track: track.location,
    collection: collection.location,
  });
  onStage("setting the MIDI region timing");
  transaction.update(noteRegion.fields.region.fields.positionTicks, 0);
  transaction.update(noteRegion.fields.region.fields.durationTicks, totalTicks);
  transaction.update(noteRegion.fields.region.fields.loopDurationTicks, totalTicks);
  transaction.update(noteRegion.fields.region.fields.collectionOffsetTicks, 0);
  transaction.update(noteRegion.fields.region.fields.loopOffsetTicks, 0);
  transaction.update(noteRegion.fields.region.fields.colorIndex, colorIndex);
  transaction.update(
    noteRegion.fields.region.fields.displayName,
    `${keyName} ${mode} · ${chords.map((chord) => chord.roman).join(" – ")}`,
  );
  onStage("creating the chord notes");
  chords.forEach((chord, barIndex) => {
    chord.tones.forEach((tone, toneIndex) => {
      transaction.create("note", {
        collection: collection.location,
        positionTicks: barIndex * Ticks.SemiBreve,
        durationTicks: Ticks.SemiBreve - Ticks.SemiQuaver,
        pitch: 48 + keyIndex + tone,
        velocity: toneIndex === 0 ? 0.76 : 0.64,
      });
    });
  });
  onStage("validating and sending the transaction");

  return { status: "written", tempoConfigCreated };
}
