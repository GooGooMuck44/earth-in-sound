import * as Tone from "tone";
import type { ClimatePoint, TrackKind } from "./data";

export const pentatonic = [
  "C3", "D3", "E3", "G3", "A3",
  "C4", "D4", "E4", "G4", "A4",
  "C5", "D5", "E5", "G5", "A5",
  "C6",
];

export type ZoneVoice = "arctic" | "tropics" | "antarctic";
export type HitInstrument = "crackle" | "storm" | "volcano" | "ice" | "pluck";
export type LeadSound = "glass" | "piano" | "pad" | "pluck";

const leadPresets: Record<LeadSound, { harmonicity: number; modulationIndex: number; envelope: [number, number, number, number] }> = {
  glass: { harmonicity: 2, modulationIndex: 3, envelope: [0.01, 0.3, 0.2, 0.8] },
  piano: { harmonicity: 1, modulationIndex: 1.2, envelope: [0.005, 0.8, 0.05, 1.2] },
  pad: { harmonicity: 0.5, modulationIndex: 0.8, envelope: [0.25, 0.4, 0.7, 1.8] },
  pluck: { harmonicity: 3, modulationIndex: 8, envelope: [0.002, 0.12, 0, 0.2] },
};

const hitFor: Record<string, HitInstrument> = {
  wildfires: "crackle",
  severeStorms: "storm",
  volcanoes: "volcano",
  seaLakeIce: "ice",
  snow: "ice",
};

export interface SoundStep {
  notes: string[];
  zoneNotes?: { voice: ZoneVoice; note: string }[];
  hits?: { instrument: HitInstrument; strength: number; pan: number; note: string }[];
  brightness: number;
  heat: number;
  bassNote?: string;
  spokenWord?: string;
  pan?: number;
}

const scaleBetween = (value: number, lowest: number, highest: number) =>
  highest === lowest ? 0.5 : (value - lowest) / (highest - lowest);

const valueRange = (values: number[]) => {
  const usable = values.filter(Number.isFinite);
  return [Math.min(...usable), Math.max(...usable)] as const;
};

const noteFor = (level: number) =>
  pentatonic[Math.max(0, Math.min(pentatonic.length - 1, Math.round(level * (pentatonic.length - 1))))];

export function longitudeToPan(longitude: number): number {
  if (!Number.isFinite(longitude)) return 0;
  return Math.max(-1, Math.min(1, longitude / 180));
}

export function evenlySpacedHitOffsets(hitCount: number, secondsPerStep: number): number[] {
  if (hitCount <= 0 || secondsPerStep <= 0) return [];
  return Array.from({ length: hitCount }, (_, order) => (order * secondsPerStep) / hitCount);
}

export function supportsLeadSound(kind: TrackKind): boolean {
  return kind === "global" || kind === "place" || kind === "scan";
}

export function shouldLoopPlayback(loopRequested: boolean, recording: boolean): boolean {
  return loopRequested && !recording;
}

export function globalSteps(points: ClimatePoint[]): SoundStep[] {
  const [coldest, warmest] = valueRange(points.map((point) => point.temperature));
  return points.map((point) => {
    const level = scaleBetween(point.temperature, coldest, warmest);
    const newDecade = point.position % 10 === 0;
    return {
      notes: [noteFor(level)],
      brightness: 350 + level * 5000,
      heat: level,
      bassNote: newDecade ? "C2" : undefined,
      spokenWord: newDecade ? String(point.position) : undefined,
    };
  });
}

export function zoneSteps(points: ClimatePoint[]): SoundStep[] {
  const allZones = points.flatMap((point) => [point.arctic ?? NaN, point.tropics ?? NaN, point.antarctic ?? NaN]);
  const [coldest, warmest] = valueRange(allZones);
  const [globalCold, globalWarm] = valueRange(points.map((point) => point.temperature));
  return points.map((point) => {
    const globalLevel = scaleBetween(point.temperature, globalCold, globalWarm);
    const newDecade = point.position % 10 === 0;
    const zoneNotes = (["arctic", "tropics", "antarctic"] as ZoneVoice[])
      .filter((voice) => Number.isFinite(point[voice]))
      .map((voice) => ({ voice, note: noteFor(scaleBetween(point[voice]!, coldest, warmest)) }));
    return {
      notes: [],
      zoneNotes,
      brightness: 400 + globalLevel * 4500,
      heat: globalLevel * 0.8,
      bassNote: newDecade ? "C2" : undefined,
      spokenWord: newDecade ? String(point.position) : undefined,
    };
  });
}

export function eventSteps(points: ClimatePoint[]): SoundStep[] {
  const busiest = Math.max(1, ...points.map((point) => point.temperature));
  return points.map((point) => {
    const level = point.temperature / busiest;
    const hits = (point.happenings ?? []).flatMap((group) =>
      Array.from({ length: group.count }, () => ({
        instrument: hitFor[group.category] ?? "pluck",
        strength: Math.min(1, 0.25 + Math.log10(1 + group.count) / 2),
        pan: longitudeToPan(group.longitude),
        note: noteFor(Math.min(1, group.count / 20)),
      })),
    );
    const startOfWeek = point.position % 7 === 0;
    return {
      notes: [],
      hits,
      brightness: 600 + level * 4000,
      heat: level * 0.5,
      bassNote: startOfWeek ? "C2" : undefined,
      spokenWord: startOfWeek ? point.label : undefined,
    };
  });
}

export function scanSteps(points: ClimatePoint[]): SoundStep[] {
  const [coolest, warmest] = valueRange(points.flatMap((point) => point.bands ?? []));
  const [dimmest, brightest] = valueRange(points.map((point) => point.temperature));
  return points.map((point, column) => {
    const bands = (point.bands ?? []).map((value, band) => ({ value, band, detail: point.bandDetail?.[band] ?? 1 }));
    const present = bands.filter((band) => Number.isFinite(band.value));
    const busiest = point.bandDetail ? 1 + Math.round(average(present.map((band) => band.detail)) * (present.length - 1)) : present.length;
    const playing = point.bandDetail ? [...present].sort((first, second) => second.detail - first.detail).slice(0, busiest) : present;
    const notes = playing
      .sort((first, second) => first.band - second.band)
      .map(({ value, band }) => {
        const northLift = ((bands.length - 1 - band) / Math.max(1, bands.length - 1)) * 0.25;
        return noteFor(Math.min(1, scaleBetween(value, coolest, warmest) * 0.75 + northLift));
      });
    const level = Number.isFinite(point.temperature) ? scaleBetween(point.temperature, dimmest, brightest) : 0;
    const longitude = point.longitude ?? 0;
    const landmark = column % 10 === 0;
    return {
      notes,
      brightness: 300 + level * 4500,
      heat: level * 0.4,
      pan: Math.max(-1, Math.min(1, longitude / 180)),
      bassNote: landmark ? "C2" : undefined,
      spokenWord: landmark ? spokenLon(longitude - 3) : undefined,
    };
  });
}

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

function spokenLon(longitude: number) {
  const rounded = Math.round(longitude);
  if (rounded === 0) return "0 degrees";
  if (Math.abs(rounded) === 180) return "180 degrees";
  return `${Math.abs(rounded)} ${rounded < 0 ? "west" : "east"}`;
}

export function placeSteps(points: ClimatePoint[]): SoundStep[] {
  const [coldest, warmest] = valueRange(points.map((point) => point.temperature));
  const [driest, wettest] = valueRange(points.map((point) => point.rainfall ?? NaN));
  const [dullest, sunniest] = valueRange(points.map((point) => point.sunshine ?? NaN));
  return points.map((point) => {
    const warmth = scaleBetween(point.temperature, coldest, warmest);
    const wetness = Number.isFinite(point.rainfall) ? scaleBetween(point.rainfall!, driest, wettest) : 0;
    const sunniness = Number.isFinite(point.sunshine) ? scaleBetween(point.sunshine!, dullest, sunniest) : 0.5;
    const rootPosition = Math.round(warmth * (pentatonic.length - 1));
    const raindrops = 1 + Math.round(wetness * 3);
    const notes = Array.from({ length: raindrops }, (_, drop) => pentatonic[Math.max(0, rootPosition - drop * 2)]);
    const isJanuary = point.label.startsWith("Jan");
    return {
      notes,
      brightness: 250 + sunniness * 4500,
      heat: warmth * 0.6,
      bassNote: isJanuary ? "C2" : undefined,
      spokenWord: isJanuary ? point.label.slice(4) : undefined,
    };
  });
}

export class SoundEngine {
  private ready = false;
  private leadSynth!: Tone.PolySynth<Tone.FMSynth>;
  private zoneSynths!: Record<ZoneVoice, Tone.PolySynth>;
  private bassSynth!: Tone.MonoSynth;
  private hitPlayers!: Record<HitInstrument, { panner: Tone.Panner; play: (note: string, strength: number, time: number) => void }>;
  private toneFilter!: Tone.Filter;
  private leadPanner!: Tone.Panner;
  private hazeLevel!: Tone.Gain;
  private masterVolume!: Tone.Volume;
  wave: Tone.Waveform | null = null;
  private recorder: Tone.Recorder | null = null;
  private steps: SoundStep[] = [];
  private secondsPerStep = 0.5;
  narrate = false;
  onStep: (stepNumber: number) => void = () => {};
  onEnd: () => void = () => {};

  get transport() {
    return Tone.getTransport();
  }

  get playing() {
    return this.transport.state === "started";
  }

  get currentStep() {
    return Math.min(
      this.steps.length - 1,
      Math.max(0, Math.floor(this.transport.seconds / this.secondsPerStep + 1e-6)),
    );
  }

  get canRecord() {
    return typeof MediaRecorder !== "undefined";
  }

  async init() {
    await Tone.start();
    if (this.ready) return;
    this.masterVolume = new Tone.Volume(-6).toDestination();
    this.wave = new Tone.Waveform(256);
    this.masterVolume.connect(this.wave);
    const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.3 }).connect(this.masterVolume);
    this.toneFilter = new Tone.Filter(1200, "lowpass", -24).connect(reverb);
    this.leadSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 3,
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.8 },
      modulationEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.5 },
      volume: -10,
    });
    this.leadPanner = new Tone.Panner(0).connect(this.toneFilter);
    this.leadSynth.connect(this.leadPanner);
    this.leadSynth.maxPolyphony = 24;
    const zoneSynth = (pan: number, options: ConstructorParameters<typeof Tone.Synth>[0]) => {
      const synth = new Tone.PolySynth(Tone.Synth, options as object);
      synth.maxPolyphony = 12;
      synth.connect(new Tone.Panner(pan).connect(this.toneFilter));
      return synth;
    };
    this.zoneSynths = {
      arctic: zoneSynth(-0.8, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 1 },
        volume: -12,
      }),
      tropics: zoneSynth(0, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.05, decay: 0.3, sustain: 0.3, release: 0.8 },
        volume: -14,
      }),
      antarctic: zoneSynth(0.8, {
        oscillator: { type: "square" },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.05, release: 0.6 },
        volume: -22,
      }),
    };
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.6, sustain: 0.3, release: 1.5 },
      volume: -8,
    }).connect(reverb);
    const pannedInto = (destination: Tone.InputNode) => new Tone.Panner(0).connect(destination);
    const crackleSynth = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
      volume: -18,
    });
    const crackleSpot = pannedInto(this.masterVolume);
    crackleSynth.connect(crackleSpot);
    const stormDrum = new Tone.MembraneSynth({ volume: -6 });
    const stormSpot = pannedInto(reverb);
    stormDrum.connect(stormSpot);
    const volcanoDrum = new Tone.MembraneSynth({ octaves: 6, volume: -2 });
    const volcanoSpot = pannedInto(reverb);
    volcanoDrum.connect(volcanoSpot);
    const iceBell = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.6, release: 0.3 },
      harmonicity: 5.1,
      resonance: 3000,
      volume: -24,
    });
    const iceSpot = pannedInto(reverb);
    iceBell.connect(iceSpot);
    const pluckSynth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.3 },
      volume: -12,
    });
    const pluckSpot = pannedInto(this.toneFilter);
    pluckSynth.connect(pluckSpot);
    this.hitPlayers = {
      crackle: {
        panner: crackleSpot,
        play: (_note, strength, time) => {
          const crackles = 1 + Math.round(strength * 4);
          for (let crackle = 0; crackle < crackles; crackle++) {
            crackleSynth.triggerAttackRelease(0.03, time + crackle * 0.035, strength);
          }
        },
      },
      storm: { panner: stormSpot, play: (_note, strength, time) => stormDrum.triggerAttackRelease("G1", 0.3, time, strength) },
      volcano: { panner: volcanoSpot, play: (_note, strength, time) => volcanoDrum.triggerAttackRelease("C1", 0.6, time, strength) },
      ice: { panner: iceSpot, play: (_note, strength, time) => iceBell.triggerAttackRelease("C5", 0.4, time, strength) },
      pluck: { panner: pluckSpot, play: (note, strength, time) => pluckSynth.triggerAttackRelease(note, 0.15, time, strength) },
    };
    this.hazeLevel = new Tone.Gain(0).connect(this.masterVolume);
    const hazeBand = new Tone.Filter(900, "bandpass").connect(this.hazeLevel);
    new Tone.Noise("pink").connect(hazeBand).start();
    this.ready = true;
  }

  useLeadSound(sound: LeadSound) {
    if (!this.ready) return;
    const preset = leadPresets[sound];
    const [attack, decay, sustain, release] = preset.envelope;
    this.leadSynth.set({
      harmonicity: preset.harmonicity,
      modulationIndex: preset.modulationIndex,
      envelope: { attack, decay, sustain, release },
    });
  }

  setVolume(decibels: number) {
    if (this.ready) this.masterVolume.volume.rampTo(decibels, 0.1);
  }

  load(steps: SoundStep[], secondsPerStep: number, startStep = 0) {
    const transport = this.transport;
    transport.stop();
    transport.cancel(0);
    this.steps = steps;
    this.secondsPerStep = secondsPerStep;
    const painter = Tone.getDraw();
    steps.forEach((step, stepNumber) => {
      transport.schedule((time) => {
        this.leadPanner.pan.setValueAtTime(step.pan ?? 0, time);
        const gap = secondsPerStep / Math.max(1, step.notes.length);
        step.notes.forEach((note, order) =>
          this.leadSynth.triggerAttackRelease(note, Math.max(0.08, gap * 0.9), time + order * gap),
        );
        step.zoneNotes?.forEach(({ voice, note }) =>
          this.zoneSynths[voice].triggerAttackRelease(note, Math.max(0.08, secondsPerStep * 0.85), time),
        );
        const hitOffsets = evenlySpacedHitOffsets(step.hits?.length ?? 0, secondsPerStep);
        step.hits?.forEach((hit, order) => {
          const player = this.hitPlayers[hit.instrument];
          const hitTime = time + hitOffsets[order];
          player.panner.pan.setValueAtTime(hit.pan, hitTime);
          player.play(hit.note, hit.strength, hitTime);
        });
        this.toneFilter.frequency.rampTo(step.brightness, Math.min(0.2, secondsPerStep * 0.8), time);
        this.hazeLevel.gain.rampTo(step.heat * step.heat * 0.12, secondsPerStep, time);
        if (step.bassNote) this.bassSynth.triggerAttackRelease(step.bassNote, secondsPerStep * 2, time);
        painter.schedule(() => {
          this.onStep(stepNumber);
          if (this.narrate && step.spokenWord) speakAloud(step.spokenWord);
        }, time);
      }, stepNumber * secondsPerStep);
    });
    transport.schedule((time) => {
      painter.schedule(() => {
        this.stop();
        this.onEnd();
      }, time);
    }, steps.length * secondsPerStep);
    transport.seconds = startStep * secondsPerStep;
  }

  play() {
    if (this.steps.length) this.transport.start();
  }

  pause() {
    this.transport.pause();
    this.silence();
  }

  stop() {
    this.transport.stop();
    this.silence();
  }

  jumpTo(stepNumber: number) {
    const safeStep = Math.max(0, Math.min(this.steps.length - 1, stepNumber));
    this.transport.seconds = safeStep * this.secondsPerStep;
    this.onStep(safeStep);
  }

  startRecording() {
    if (!this.ready || !this.canRecord) return false;
    this.recorder = new Tone.Recorder();
    this.masterVolume.connect(this.recorder);
    this.recorder.start();
    return true;
  }

  async finishRecording(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder) return null;
    this.recorder = null;
    const recording = await recorder.stop();
    this.masterVolume.disconnect(recorder);
    recorder.dispose();
    return recording;
  }

  get recording() {
    return this.recorder !== null;
  }

  private silence() {
    if (!this.ready) return;
    this.leadSynth.releaseAll();
    Object.values(this.zoneSynths).forEach((synth) => synth.releaseAll());
    this.hazeLevel.gain.rampTo(0, 0.2);
    window.speechSynthesis?.cancel();
  }
}

function speakAloud(text: string) {
  const speech = window.speechSynthesis;
  if (!speech) return;
  speech.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.2;
  utterance.volume = 0.8;
  speech.speak(utterance);
}
