"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  audiotool,
  type AuthenticatedClient,
  type BrowserAuthResult,
} from "@audiotool/nexus";
import { Ticks } from "@audiotool/nexus/utils";

const CLIENT_ID = "4412a0cc-00ef-4e83-a232-0e8b9d577ef0";
const QUEST_STORAGE_KEY = "harmonic-quest:oauth-return";

const KEYS = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

type Mode = "major" | "minor";

type Chord = {
  roman: string;
  label: string;
  tones: number[];
  tension: number;
  character: string;
};

type Quest = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  mode: Mode;
  accent: string;
};

type ProjectOption = {
  name: string;
  resourceName: string;
  url: string;
};

type StoredQuest = {
  questId: string;
  keyIndex: number;
  tempo: number;
  progression: number[];
};

const QUESTS: Quest[] = [
  {
    id: "lift",
    eyebrow: "BRIGHT ARC",
    title: "Open the sky",
    description: "Begin grounded, gather energy, and arrive somewhere brighter.",
    mode: "major",
    accent: "acid",
  },
  {
    id: "drift",
    eyebrow: "SOFT GRAVITY",
    title: "Float, don’t resolve",
    description: "Favor gentle detours and a loop that can keep breathing.",
    mode: "major",
    accent: "blue",
  },
  {
    id: "shadow",
    eyebrow: "DARK TURN",
    title: "Find the hidden door",
    description: "Build pressure in minor, then reveal an unexpected way home.",
    mode: "minor",
    accent: "coral",
  },
];

const CHORDS: Record<Mode, Chord[]> = {
  major: [
    { roman: "I", label: "Tonic", tones: [0, 4, 7], tension: 8, character: "home" },
    { roman: "ii", label: "Minor two", tones: [2, 5, 9], tension: 48, character: "forward pull" },
    { roman: "iii", label: "Minor three", tones: [4, 7, 11], tension: 38, character: "soft ambiguity" },
    { roman: "IV", label: "Subdominant", tones: [5, 9, 12], tension: 34, character: "open lift" },
    { roman: "V", label: "Dominant", tones: [7, 11, 14], tension: 88, character: "bright pressure" },
    { roman: "vi", label: "Relative minor", tones: [9, 12, 16], tension: 30, character: "bittersweet" },
    { roman: "vii°", label: "Leading tone", tones: [11, 14, 17], tension: 96, character: "edge" },
  ],
  minor: [
    { roman: "i", label: "Minor tonic", tones: [0, 3, 7], tension: 12, character: "dark home" },
    { roman: "ii°", label: "Diminished two", tones: [2, 5, 8], tension: 86, character: "unease" },
    { roman: "III", label: "Major three", tones: [3, 7, 10], tension: 26, character: "silver light" },
    { roman: "iv", label: "Minor four", tones: [5, 8, 12], tension: 46, character: "deepening" },
    { roman: "v", label: "Minor five", tones: [7, 10, 14], tension: 70, character: "restrained pull" },
    { roman: "VI", label: "Major six", tones: [8, 12, 15], tension: 35, character: "wide horizon" },
    { roman: "VII", label: "Major seven", tones: [10, 14, 17], tension: 62, character: "cinematic rise" },
  ],
};

const MAJOR_PATHS: Record<number, number[]> = {
  0: [5, 3, 1, 4],
  1: [4, 3, 5, 0],
  2: [5, 3, 1, 4],
  3: [4, 0, 1, 5],
  4: [0, 5, 3, 1],
  5: [3, 1, 4, 0],
  6: [0, 2, 5, 3],
};

const MINOR_PATHS: Record<number, number[]> = {
  0: [5, 3, 6, 4],
  1: [4, 0, 2, 5],
  2: [5, 3, 6, 0],
  3: [4, 6, 0, 5],
  4: [0, 5, 2, 6],
  5: [3, 6, 0, 4],
  6: [0, 2, 5, 3],
};

function candidateIndices(mode: Mode, current: number, step: number, questId: string) {
  const source = mode === "major" ? MAJOR_PATHS : MINOR_PATHS;
  const candidates = [...(source[current] ?? [0, 3, 4])];

  if (step === 3) {
    const preferred = questId === "drift" ? (mode === "major" ? 5 : 5) : 0;
    const reordered = [preferred, ...candidates.filter((item) => item !== preferred)];
    return reordered.slice(0, 3);
  }

  const rotation = questId === "drift" ? 1 : questId === "shadow" ? 2 : 0;
  return [...candidates.slice(rotation), ...candidates.slice(0, rotation)].slice(0, 3);
}

function pitchClassDistance(a: number, b: number) {
  const distance = Math.abs((a % 12) - (b % 12));
  return Math.min(distance, 12 - distance);
}

function voiceLeadingScore(chords: Chord[]) {
  if (chords.length < 2) return 72;
  let total = 0;
  let comparisons = 0;
  for (let index = 1; index < chords.length; index += 1) {
    for (const tone of chords[index].tones) {
      total += Math.min(...chords[index - 1].tones.map((previous) => pitchClassDistance(tone, previous)));
      comparisons += 1;
    }
  }
  return Math.max(48, Math.round(100 - (total / comparisons) * 11));
}

function describeMove(previous: Chord, next: Chord) {
  if (next.roman.toLowerCase() === "i") return "A clear arrival: the ear recognizes home immediately.";
  if (next.tension > previous.tension + 25) return `The ${next.roman} raises the stakes with ${next.character}.`;
  if (next.tension < previous.tension - 25) return `Pressure releases into ${next.character} without ending the story.`;
  return `Shared tones make this a smooth turn toward ${next.character}.`;
}

function noteName(keyIndex: number, semitones: number) {
  return KEYS[(keyIndex + semitones) % 12];
}

async function within<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof window.setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

type ConnectionSignal = {
  getValue: () => boolean;
  subscribe: (
    callback: (connected: boolean) => void,
    initialTrigger?: boolean,
  ) => { terminate: () => void };
};

async function waitUntilConnected(signal: ConnectionSignal, timeoutMs: number) {
  if (signal.getValue()) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let subscription: { terminate: () => void } | undefined;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription?.terminate();
      reject(new Error("Audiotool synchronized the project but its live write connection is not ready yet. Keep the Studio open, then retry."));
    }, timeoutMs);

    subscription = signal.subscribe((connected) => {
      if (!connected || settled) return;
      settled = true;
      window.clearTimeout(timer);
      subscription?.terminate();
      resolve();
    }, true);

    if (settled) subscription.terminate();
  });
}

export default function Home() {
  const [questId, setQuestId] = useState("lift");
  const [keyIndex, setKeyIndex] = useState(0);
  const [tempo, setTempo] = useState(96);
  const [progression, setProgression] = useState<number[]>([0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "signed-in" | "error">("loading");
  const [audioToolUser, setAudioToolUser] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectUrl, setProjectUrl] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("Connect a project when your four-bar quest is complete.");
  const clientRef = useRef<BrowserAuthResult | null>(null);

  const quest = QUESTS.find((item) => item.id === questId) ?? QUESTS[0];
  const chords = CHORDS[quest.mode];
  const chosenChords = progression.map((index) => chords[index]);
  const candidates = progression.length < 4
    ? candidateIndices(quest.mode, progression.at(-1) ?? 0, progression.length, questId)
    : [];
  const flowScore = voiceLeadingScore(chosenChords);
  const arcScore = Math.min(100, 34 + progression.length * 14 + new Set(progression).size * 7);

  function selectQuest(nextQuestId: string) {
    setQuestId(nextQuestId);
    setProgression([0]);
    setSyncState("idle");
    setSyncMessage("New quest selected. Build four bars, then send them to Audiotool.");
  }

  useEffect(() => {
    const raw = window.sessionStorage.getItem(QUEST_STORAGE_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(QUEST_STORAGE_KEY);

    try {
      const stored = JSON.parse(raw) as Partial<StoredQuest>;
      const validQuest = QUESTS.some((item) => item.id === stored.questId);
      const validKey = Number.isInteger(stored.keyIndex) && Number(stored.keyIndex) >= 0 && Number(stored.keyIndex) < KEYS.length;
      const validTempo = Number.isInteger(stored.tempo) && Number(stored.tempo) >= 60 && Number(stored.tempo) <= 150;
      const validProgression = Array.isArray(stored.progression)
        && stored.progression.length >= 1
        && stored.progression.length <= 4
        && stored.progression.every((index) => Number.isInteger(index) && index >= 0 && index < 7);

      if (!validQuest || !validKey || !validTempo || !validProgression) return;
      setQuestId(stored.questId as string);
      setKeyIndex(stored.keyIndex as number);
      setTempo(stored.tempo as number);
      setProgression(stored.progression as number[]);
      setSyncState("idle");
      setSyncMessage("Your quest was restored after Audiotool authorization. Choose a project and send it live.");
    } catch {
      // Ignore malformed device-local state and keep the fresh quest.
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function initializeAudiotool() {
      try {
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const redirectUrl = isLocal ? "http://127.0.0.1:3000/" : `${window.location.origin}/`;
        const at = await audiotool({
          clientId: CLIENT_ID,
          redirectUrl,
          scope: "project:write",
        });
        if (!active) return;
        clientRef.current = at;

        if (at.status === "authenticated") {
          setAuthState("signed-in");
          setAudioToolUser(at.userName.replace(/^users\//, ""));
          try {
            const response = await at.projects.listProjects({ pageSize: 30 });
            if (!active) return;
            const options = response.projects.map((project) => {
              const id = project.name.replace(/^projects\//, "");
              return {
                name: project.displayName || "Untitled project",
                resourceName: project.name,
                url: `https://www.audiotool.com/studio?project=${id}`,
              };
            });
            setProjects(options);
            if (options[0]) setProjectUrl(options[0].url);
          } catch {
            setProjects([]);
          }
        } else {
          setAuthState(at.error ? "error" : "signed-out");
        }
      } catch {
        if (active) setAuthState("error");
      }
    }

    void initializeAudiotool();
    return () => {
      active = false;
    };
  }, []);

  const projectSelectValue = useMemo(
    () => projects.some((project) => project.url === projectUrl) ? projectUrl : "custom",
    [projectUrl, projects],
  );

  function chooseChord(index: number) {
    if (progression.length >= 4) return;
    setProgression((current) => [...current, index]);
    setSyncState("idle");
    setSyncMessage("Choice captured. Finish the four-bar arc before syncing.");
  }

  function undoChord() {
    setProgression((current) => current.length > 1 ? current.slice(0, -1) : current);
    setSyncState("idle");
  }

  function restartQuest() {
    setProgression([0]);
    setSyncState("idle");
    setSyncMessage("Fresh canvas. Choose the next harmonic move.");
  }

  function playProgression() {
    if (isPlaying || chosenChords.length === 0) return;
    const context = new AudioContext();
    const secondsPerBeat = 60 / tempo;
    const chordDuration = secondsPerBeat * 2;
    const start = context.currentTime + 0.08;
    setIsPlaying(true);

    chosenChords.forEach((chord, chordIndex) => {
      const startAt = start + chordIndex * chordDuration;
      chord.tones.forEach((tone, toneIndex) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const midi = 48 + keyIndex + tone;
        oscillator.type = toneIndex === 0 ? "triangle" : "sine";
        oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(toneIndex === 0 ? 0.13 : 0.08, startAt + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + chordDuration - 0.04);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + chordDuration);
      });
    });

    window.setTimeout(() => {
      setIsPlaying(false);
      void context.close();
    }, chosenChords.length * chordDuration * 1000 + 200);
  }

  function handleAudiotoolAuth() {
    const at = clientRef.current;
    if (!at) return;
    if (at.status === "authenticated") at.logout();
    else {
      const storedQuest: StoredQuest = { questId, keyIndex, tempo, progression };
      window.sessionStorage.setItem(QUEST_STORAGE_KEY, JSON.stringify(storedQuest));
      at.login();
    }
  }

  async function createAudiotoolProject() {
    const at = clientRef.current;
    if (!at || at.status !== "authenticated") {
      setSyncState("error");
      setSyncMessage("Sign in to Audiotool before creating a project.");
      return;
    }

    setSyncState("syncing");
    setSyncMessage("Creating a clean Audiotool project for this quest…");
    try {
      const result = await at.projects.createProject({
        project: { displayName: "Harmonic Quest Session" },
      });
      if (result instanceof Error || !result.project) {
        throw result instanceof Error ? result : new Error("Audiotool did not return the new project.");
      }

      const id = result.project.name.replace(/^projects\//, "");
      const option: ProjectOption = {
        name: result.project.displayName || "Harmonic Quest Session",
        resourceName: result.project.name,
        url: `https://www.audiotool.com/studio?project=${id}`,
      };
      setProjects((current) => [option, ...current.filter((project) => project.resourceName !== option.resourceName)]);
      setProjectUrl(option.url);
      setSyncState("done");
      setSyncMessage("Clean Audiotool project created and selected. Complete the quest, then send it live.");
    } catch (error) {
      setSyncState("error");
      setSyncMessage(error instanceof Error ? error.message : "Audiotool could not create the project.");
    }
  }

  async function sendToAudiotool() {
    const at = clientRef.current;
    if (!at || at.status !== "authenticated") {
      setSyncState("error");
      setSyncMessage("Sign in to Audiotool first, then choose a project.");
      return;
    }
    if (progression.length < 4) {
      setSyncState("error");
      setSyncMessage("Complete all four bars before sending the arrangement.");
      return;
    }
    if (!projectUrl.trim()) {
      setSyncState("error");
      setSyncMessage("Paste or select an Audiotool project URL.");
      return;
    }

    setSyncState("syncing");
    setSyncMessage("Opening the live project and writing your progression…");

    let nexus: Awaited<ReturnType<AuthenticatedClient["open"]>> | undefined;
    let syncStage = "opening the project session";
    try {
      const selectedProject = projects.find((project) => project.url === projectUrl);
      nexus = await within(
        at.open(selectedProject?.resourceName ?? projectUrl.trim()),
        15_000,
        "Audiotool did not open the project session within 15 seconds. Open the project once in Audiotool, then retry.",
      );
      syncStage = "starting document synchronization";
      setSyncMessage("Project session opened. Synchronizing the Audiotool timeline…");
      await within(
        nexus.start(),
        20_000,
        "Audiotool opened the project but did not finish synchronizing within 20 seconds. Retry when the studio is fully loaded.",
      );
      syncStage = "waiting for the live write connection";
      setSyncMessage("Project synchronized. Waiting for Audiotool's live write connection…");
      await waitUntilConnected(nexus.connected, 20_000);
      setSyncMessage("Live connection ready. Building one atomic Audiotool transaction…");
      const totalTicks = Ticks.Bars(4);
      syncStage = "querying the live arrangement";
      await within(
        nexus.modify((transaction) => {
          syncStage = "querying existing tracks and channels";
          const trackOrder = transaction.entities.ofTypes("noteTrack").get().length;
          const stripOrder = transaction.entities.ofTypes("mixerChannel").get().length;
          syncStage = "finding earlier Harmonic Quest devices";
          const previousSynths = transaction.entities
            .ofTypes("heisenberg")
            .get()
            .filter((entity) => entity.fields.displayName.value === "Harmonic Quest · Chords");

          syncStage = "replacing an earlier Harmonic Quest arrangement";
          previousSynths.forEach((entity) => transaction.removeWithDependencies(entity));
          syncStage = "creating the Heisenberg synth";
          const synth = transaction.create("heisenberg", {
            displayName: "Harmonic Quest · Chords",
            positionX: 120,
            positionY: 160 + stripOrder * 36,
            playModeIndex: 4,
            gain: 0.58,
            unisonoCount: 2,
            unisonoStereoSpreadFactor: 0.36,
          });
          syncStage = "creating the mixer channel";
          const channel = transaction.create("mixerChannel", {});
          syncStage = "labeling the mixer channel";
          transaction.update(channel.fields.displayParameters.fields.orderAmongStrips, stripOrder);
          transaction.update(channel.fields.displayParameters.fields.displayName, "Harmonic Quest");
          transaction.update(
            channel.fields.displayParameters.fields.colorIndex,
            questId === "shadow" ? 10 : questId === "drift" ? 22 : 6,
          );
          syncStage = "connecting the synth to the mixer";
          transaction.create("desktopAudioCable", {
            fromSocket: synth.fields.audioOutput.location,
            toSocket: channel.fields.audioInput.location,
            colorIndex: questId === "shadow" ? 10 : 6,
          });
          syncStage = "creating the MIDI track";
          const track = transaction.create("noteTrack", {
            player: synth.location,
            orderAmongTracks: trackOrder,
          });
          syncStage = "creating the note collection";
          const collection = transaction.create("noteCollection", {});
          syncStage = "creating the four-bar MIDI region";
          const noteRegion = transaction.create("noteRegion", {
            track: track.location,
            collection: collection.location,
          });
          syncStage = "setting the MIDI region timing";
          transaction.update(noteRegion.fields.region.fields.positionTicks, 0);
          transaction.update(noteRegion.fields.region.fields.durationTicks, totalTicks);
          transaction.update(noteRegion.fields.region.fields.loopDurationTicks, totalTicks);
          transaction.update(noteRegion.fields.region.fields.collectionOffsetTicks, 0);
          transaction.update(noteRegion.fields.region.fields.loopOffsetTicks, 0);
          transaction.update(
            noteRegion.fields.region.fields.colorIndex,
            questId === "shadow" ? 10 : questId === "drift" ? 22 : 6,
          );
          transaction.update(
            noteRegion.fields.region.fields.displayName,
            `${KEYS[keyIndex]} ${quest.mode} · ${chosenChords.map((chord) => chord.roman).join(" – ")}`,
          );
          syncStage = "creating the chord notes";
          chosenChords.forEach((chord, barIndex) => {
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
          syncStage = "validating and sending the transaction";
        }),
        20_000,
        "Audiotool's live write did not complete within 20 seconds. Keep the Studio open, then retry.",
      );

      setSyncMessage("Transaction validated and sent to Audiotool.");
      const completedNexus = nexus;
      nexus = undefined;
      void completedNexus.stop().catch(() => {
        // The transaction has already been sent; background cleanup should not obscure success.
      });
      setSyncState("done");
      setSyncMessage("Progression written live: synth, mixer channel, MIDI region, and all four chords are now in Audiotool.");
    } catch (error) {
      if (nexus) {
        const failedNexus = nexus;
        nexus = undefined;
        void failedNexus.stop().catch(() => {
          // The original synchronization error is the useful one.
        });
      }
      setSyncState("error");
      const detail = error instanceof Error ? error.message : "Audiotool could not sync this project yet.";
      const debugDetail = new URLSearchParams(window.location.search).get("debug") === "nexus" && error instanceof Error
        ? error.stack ?? detail
        : detail;
      setSyncMessage(`Audiotool failed while ${syncStage}: ${debugDetail}`);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Harmonic Quest home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Harmonic Quest</span>
        </a>
        <div className="topbar-actions">
          <span className="nexus-pill"><b /> Built on Audiotool Nexus</span>
          <button className="account-button" type="button" onClick={handleAudiotoolAuth} disabled={authState === "loading"}>
            {authState === "signed-in" ? `@${audioToolUser}` : authState === "loading" ? "Checking Nexus…" : "Connect Audiotool"}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker"><span>01</span> COMPOSE BY EAR</p>
          <h1>Turn instinct into<br /><em>musical intent.</em></h1>
          <p className="hero-lede">
            A four-move harmony game that lets you hear every choice, understand why it works,
            and write the finished idea straight into a live Audiotool session.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#quest">Start a quest <span>↗</span></a>
            <button className="text-button" type="button" onClick={playProgression}>Hear the seed <span>▶</span></button>
          </div>
          <div className="category-row" aria-label="Hackathon categories">
            <span>Songstarter</span><span>Composition</span><span>Music Games</span><span>Connect</span>
          </div>
        </div>

        <div className={`hero-orbit ${quest.accent}`} aria-hidden="true">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="orbit-center">
            <small>CURRENT KEY</small>
            <strong>{KEYS[keyIndex]}</strong>
            <span>{quest.mode}</span>
          </div>
          {chosenChords.map((chord, index) => (
            <span className={`orbit-note orbit-note-${index + 1}`} key={`${chord.roman}-${index}`}>{chord.roman}</span>
          ))}
          <p>LISTEN • CHOOSE • LEARN • SEND</p>
        </div>
      </section>

      <section className="quest-section" id="quest">
        <div className="section-heading">
          <div>
            <p className="kicker"><span>02</span> CHOOSE A FEELING</p>
            <h2>What should this loop <em>feel like?</em></h2>
          </div>
          <p>Each quest changes the harmonic paths offered by the theory engine. There is no wrong answer—only a different story.</p>
        </div>

        <div className="quest-grid">
          {QUESTS.map((item, index) => (
            <button
              className={`quest-card ${questId === item.id ? "selected" : ""} ${item.accent}`}
              type="button"
              key={item.id}
              onClick={() => selectQuest(item.id)}
              aria-pressed={questId === item.id}
            >
              <span className="quest-index">0{index + 1}</span>
              <small>{item.eyebrow}</small>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
              <i aria-hidden="true">↗</i>
            </button>
          ))}
        </div>
      </section>

      <section className="composer-section">
        <div className="composer-toolbar">
          <div>
            <p className="kicker"><span>03</span> BUILD THE ARC</p>
            <h2>Your four-bar journey</h2>
          </div>
          <div className="controls">
            <label>
              Key
              <select value={keyIndex} onChange={(event) => setKeyIndex(Number(event.target.value))}>
                {KEYS.map((key, index) => <option value={index} key={key}>{key}</option>)}
              </select>
            </label>
            <label>
              Tempo
              <input type="range" min="70" max="132" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} />
              <output>{tempo}</output>
            </label>
            <button className="play-button" type="button" onClick={playProgression} disabled={isPlaying}>
              {isPlaying ? "Playing…" : "▶ Play loop"}
            </button>
          </div>
        </div>

        <div className="timeline" aria-label="Four bar chord progression">
          {[0, 1, 2, 3].map((bar) => {
            const chord = chosenChords[bar];
            return (
              <article className={`bar-card ${chord ? "filled" : "empty"}`} key={bar}>
                <div className="bar-top"><span>BAR 0{bar + 1}</span><span>{chord ? `${chord.tension}% pull` : "waiting"}</span></div>
                {chord ? (
                  <>
                    <strong>{chord.roman}</strong>
                    <p>{noteName(keyIndex, chord.tones[0])} · {chord.label}</p>
                    <div className="mini-piano" aria-hidden="true">
                      {Array.from({ length: 8 }).map((_, pianoIndex) => <i className={chord.tones.some((tone) => tone % 7 === pianoIndex % 7) ? "on" : ""} key={pianoIndex} />)}
                    </div>
                  </>
                ) : (
                  <>
                    <strong>—</strong>
                    <p>Choose your next move</p>
                    <div className="empty-lines"><i /><i /><i /></div>
                  </>
                )}
              </article>
            );
          })}
        </div>

        <div className="decision-panel">
          <div className="decision-copy">
            <span className="step-badge">{progression.length < 4 ? `MOVE ${progression.length} OF 3` : "QUEST COMPLETE"}</span>
            <h3>{progression.length < 4 ? "Where does your ear want to go?" : "Your harmonic arc is ready."}</h3>
            <p>
              {progression.length < 4
                ? `You are leaving ${chosenChords.at(-1)?.roman}. Pick a path and hear how the emotional pressure changes.`
                : `${KEYS[keyIndex]} ${quest.mode}: ${chosenChords.map((chord) => chord.roman).join(" — ")}`}
            </p>
            <div className="decision-actions">
              <button type="button" onClick={undoChord} disabled={progression.length === 1}>← Undo</button>
              <button type="button" onClick={restartQuest}>Start over</button>
            </div>
          </div>
          <div className="candidate-grid">
            {candidates.map((candidate, index) => {
              const chord = chords[candidate];
              const previous = chosenChords.at(-1) ?? chords[0];
              return (
                <button className="candidate-card" type="button" key={`${candidate}-${index}`} onClick={() => chooseChord(candidate)}>
                  <span>{String.fromCharCode(65 + index)}</span>
                  <strong>{chord.roman}</strong>
                  <small>{chord.character}</small>
                  <p>{describeMove(previous, chord)}</p>
                  <i aria-hidden="true">Choose ↗</i>
                </button>
              );
            })}
            {progression.length === 4 && (
              <div className="completion-card">
                <span>✓</span>
                <strong>Four bars, one clear story.</strong>
                <p>Preview it again, or send the full MIDI arrangement into Audiotool below.</p>
                <button type="button" onClick={playProgression}>{isPlaying ? "Playing…" : "▶ Hear the full loop"}</button>
              </div>
            )}
          </div>
        </div>

        <div className="theory-strip">
          <div><small>HARMONIC ARC</small><strong>{arcScore}</strong><span>/100</span></div>
          <div className="meter"><i style={{ width: `${arcScore}%` }} /></div>
          <div><small>VOICE LEADING</small><strong>{flowScore}</strong><span>/100</span></div>
          <div className="meter cool"><i style={{ width: `${flowScore}%` }} /></div>
          <p>{chosenChords.length > 1 ? describeMove(chosenChords.at(-2)!, chosenChords.at(-1)!) : "A tonic seed gives the listener a stable reference point."}</p>
        </div>
      </section>

      <section className="nexus-section" id="nexus">
        <div className="nexus-copy">
          <p className="kicker"><span>04</span> MAKE IT REAL</p>
          <h2>From choice to<br /><em>live session.</em></h2>
          <p>
            Nexus turns your completed quest into native Audiotool objects: a Heisenberg synth,
            mixer channel, MIDI track, note region, and playable chord voicings.
          </p>
          <ol>
            <li><span>1</span><div><strong>Sign in</strong><small>Authorize project:write through Audiotool.</small></div></li>
            <li><span>2</span><div><strong>Choose a project</strong><small>Use one of yours or paste a live studio URL.</small></div></li>
            <li><span>3</span><div><strong>Send the progression</strong><small>Watch the arrangement appear in the multiplayer DAW.</small></div></li>
          </ol>
        </div>

        <div className="nexus-console">
          <div className="console-head">
            <div><i /><i /><i /></div>
            <span>NEXUS BRIDGE / PROJECT:WRITE</span>
          </div>
          <div className="connection-state">
            <span className={authState === "signed-in" ? "connected" : ""} />
            <div>
              <small>AUDIOTOOL ACCOUNT</small>
              <strong>{authState === "signed-in" ? `Connected as @${audioToolUser}` : authState === "loading" ? "Checking connection…" : "Not connected"}</strong>
            </div>
            <button type="button" onClick={handleAudiotoolAuth} disabled={authState === "loading"}>
              {authState === "signed-in" ? "Disconnect" : "Connect"}
            </button>
          </div>

          <label className="project-select">
            <span>Target project</span>
            <select
              value={projectSelectValue}
              onChange={(event) => {
                if (event.target.value !== "custom") setProjectUrl(event.target.value);
                else setProjectUrl("");
              }}
              disabled={authState !== "signed-in"}
            >
              {projects.map((project) => <option value={project.url} key={project.url}>{project.name}</option>)}
              <option value="custom">Paste another project URL…</option>
            </select>
          </label>

          <label className="project-url">
            <span>Audiotool studio URL</span>
            <input
              type="url"
              value={projectUrl}
              onChange={(event) => setProjectUrl(event.target.value)}
              placeholder="https://www.audiotool.com/studio?project=…"
            />
          </label>

          {authState === "signed-in" && (
            <button
              className="new-project-link"
              type="button"
              onClick={() => void createAudiotoolProject()}
              disabled={syncState === "syncing"}
            >
              Create a clean Audiotool project ↗
            </button>
          )}

          <div className="payload-preview">
            <span>ARRANGEMENT PAYLOAD</span>
            <code>{`key      ${KEYS[keyIndex]} ${quest.mode}\ntempo    ${tempo} bpm\nbars     ${chosenChords.map((chord) => chord.roman).join(" · ") || "—"}\nobjects  synth + channel + cable + MIDI`}</code>
          </div>

          <button className="send-button" type="button" onClick={() => void sendToAudiotool()} disabled={syncState === "syncing"}>
            {syncState === "syncing" ? "Writing to Audiotool…" : "Send progression to Audiotool"}<span>↗</span>
          </button>
          <p className={`sync-message ${syncState}`}>{syncState === "done" ? "✓ " : syncState === "error" ? "! " : ""}{syncMessage}</p>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Harmonic Quest</span></div>
        <p>Built for Audiotool Let’s Build! 2026 · Your ideas remain yours.</p>
        <div className="footer-links">
          <a href="https://github.com/aviad12g/harmonic-quest" target="_blank" rel="noreferrer">Source ↗</a>
          <a href="https://github.com/audiotool/nexus" target="_blank" rel="noreferrer">Nexus SDK ↗</a>
        </div>
      </footer>
    </main>
  );
}
