import * as Tone from "tone";
import type { ClimatePoint } from "./data";

export const pentatonicScale = [
  "C3", "D3", "E3", "G3", "A3",
  "C4", "D4", "E4", "G4", "A4",
  "C5", "D5", "E5", "G5", "A5",
  "C6",
];

export type ZoneVoice = "arctic" | "tropics" | "antarctic";

export interface SoundStep {
  notes: string[];
  zoneNotes?: { voice: ZoneVoice; note: string }[];
  brightness: number;
  heat: number;
  bassNote?: string;
  spokenWord?: string;
}

const scaleBetween = (value: number, lowest: number, highest: number) =>
  highest === lowest ? 0.5 : (value - lowest) / (highest - lowest);

const valueRange = (values: number[]) => {
  const usable = values.filter(Number.isFinite);
  return [Math.min(...usable), Math.max(...usable)] as const;
};

const noteFor = (level: number) =>
  pentatonicScale[Math.max(0, Math.min(pentatonicScale.length - 1, Math.round(level * (pentatonicScale.length - 1))))];

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

export function placeSteps(points: ClimatePoint[]): SoundStep[] {
  const [coldest, warmest] = valueRange(points.map((point) => point.temperature));
  const [driest, wettest] = valueRange(points.map((point) => point.rainfall ?? NaN));
  const [dullest, sunniest] = valueRange(points.map((point) => point.sunshine ?? NaN));
  return points.map((point) => {
    const warmth = scaleBetween(point.temperature, coldest, warmest);
    const wetness = Number.isFinite(point.rainfall) ? scaleBetween(point.rainfall!, driest, wettest) : 0;
    const sunniness = Number.isFinite(point.sunshine) ? scaleBetween(point.sunshine!, dullest, sunniest) : 0.5;
    const rootPosition = Math.round(warmth * (pentatonicScale.length - 1));
    const raindrops = 1 + Math.round(wetness * 3);
    const notes = Array.from({ length: raindrops }, (_, drop) => pentatonicScale[Math.max(0, rootPosition - drop * 2)]);
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
  private leadSynth!: Tone.PolySynth;
  private zoneSynths!: Record<ZoneVoice, Tone.PolySynth>;
  private bassSynth!: Tone.MonoSynth;
  private toneFilter!: Tone.Filter;
  private hazeLevel!: Tone.Gain;
  private masterVolume!: Tone.Volume;
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
    const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.3 }).connect(this.masterVolume);
    this.toneFilter = new Tone.Filter(1200, "lowpass", -24).connect(reverb);
    this.leadSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 3,
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.8 },
      modulationEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.5 },
      volume: -10,
    }).connect(this.toneFilter);
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
    this.hazeLevel = new Tone.Gain(0).connect(this.masterVolume);
    const hazeBand = new Tone.Filter(900, "bandpass").connect(this.hazeLevel);
    new Tone.Noise("pink").connect(hazeBand).start();
    this.ready = true;
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
        const gap = secondsPerStep / Math.max(1, step.notes.length);
        step.notes.forEach((note, order) =>
          this.leadSynth.triggerAttackRelease(note, Math.max(0.08, gap * 0.9), time + order * gap),
        );
        step.zoneNotes?.forEach(({ voice, note }) =>
          this.zoneSynths[voice].triggerAttackRelease(note, Math.max(0.08, secondsPerStep * 0.85), time),
        );
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
