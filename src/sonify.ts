// Data → sound. Pure mapping functions first, then the Tone.js engine that plays them.
import * as Tone from "tone";
import type { Point } from "./data";

// Major pentatonic over 3 octaves: any combination of these notes sounds consonant.
export const SCALE = [
  "C3", "D3", "E3", "G3", "A3",
  "C4", "D4", "E4", "G4", "A4",
  "C5", "D5", "E5", "G5", "A5",
  "C6",
];

export interface Step {
  notes: string[]; // played evenly spread across the step
  cutoff: number; // lowpass Hz: brightness
  heat: number; // 0–1, drives the background noise "heat haze"
  bass?: string; // optional low orientation note (decades / January)
  speak?: string; // optional narration
}

const norm = (v: number, lo: number, hi: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
const range = (vs: number[]) => {
  const f = vs.filter(Number.isFinite);
  return [Math.min(...f), Math.max(...f)] as const;
};
const pitch = (n: number) => SCALE[Math.max(0, Math.min(SCALE.length - 1, Math.round(n * (SCALE.length - 1))))];

/** GISTEMP: warmer year → higher note, brighter tone, more heat haze. A bass note marks each decade. */
export function globalSteps(points: Point[]): Step[] {
  const [lo, hi] = range(points.map((p) => p.temp));
  return points.map((p) => {
    const n = norm(p.temp, lo, hi);
    const decade = p.x % 10 === 0;
    return {
      notes: [pitch(n)],
      cutoff: 350 + n * 5000,
      heat: n,
      bass: decade ? "C2" : undefined,
      speak: decade ? String(p.x) : undefined,
    };
  });
}

/** NASA POWER monthly: temperature → pitch, rain → 1–4 notes, sunshine → brightness. */
export function placeSteps(points: Point[]): Step[] {
  const [t0, t1] = range(points.map((p) => p.temp));
  const [r0, r1] = range(points.map((p) => p.rain ?? NaN));
  const [s0, s1] = range(points.map((p) => p.sun ?? NaN));
  return points.map((p) => {
    const tn = norm(p.temp, t0, t1);
    const rn = Number.isFinite(p.rain) ? norm(p.rain!, r0, r1) : 0;
    const sn = Number.isFinite(p.sun) ? norm(p.sun!, s0, s1) : 0.5;
    const idx = Math.round(tn * (SCALE.length - 1));
    const hits = 1 + Math.round(rn * 3);
    // Rainy months become a falling arpeggio around the temperature note, like drops.
    const notes = Array.from({ length: hits }, (_, h) => SCALE[Math.max(0, idx - h * 2)]);
    const january = p.label.startsWith("Jan");
    return {
      notes,
      cutoff: 250 + sn * 4500,
      heat: tn * 0.6,
      bass: january ? "C2" : undefined,
      speak: january ? p.label.slice(4) : undefined,
    };
  });
}

// ---------- Engine ----------

export class Engine {
  private built = false;
  private synth!: Tone.PolySynth;
  private bass!: Tone.MonoSynth;
  private filter!: Tone.Filter;
  private noiseGain!: Tone.Gain;
  private master!: Tone.Volume;
  private steps: Step[] = [];
  private stepSec = 0.5;
  narrate = false;
  onStep: (i: number) => void = () => {};
  onEnd: () => void = () => {};

  get transport() {
    return Tone.getTransport();
  }
  get playing() {
    return this.transport.state === "started";
  }
  get index() {
    return Math.min(this.steps.length - 1, Math.max(0, Math.floor(this.transport.seconds / this.stepSec + 1e-6)));
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  async init() {
    await Tone.start();
    if (this.built) return;
    this.master = new Tone.Volume(-6).toDestination();
    const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.3 }).connect(this.master);
    this.filter = new Tone.Filter(1200, "lowpass", -24).connect(reverb);
    this.synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 3,
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.8 },
      modulationEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.5 },
      volume: -10,
    }).connect(this.filter);
    this.synth.maxPolyphony = 24;
    this.bass = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.6, sustain: 0.3, release: 1.5 },
      volume: -8,
    }).connect(reverb);
    // Pink noise "heat haze" that swells as the data gets hotter.
    this.noiseGain = new Tone.Gain(0).connect(this.master);
    const haze = new Tone.Filter(900, "bandpass").connect(this.noiseGain);
    new Tone.Noise("pink").connect(haze).start();
    this.built = true;
  }

  setVolume(db: number) {
    if (this.built) this.master.volume.rampTo(db, 0.1);
  }

  /** Replaces whatever is scheduled with a new track, starting at `startIndex`. */
  load(steps: Step[], stepSec: number, startIndex = 0) {
    const t = this.transport;
    t.stop();
    t.cancel(0);
    this.steps = steps;
    this.stepSec = stepSec;
    const draw = Tone.getDraw();
    steps.forEach((s, i) => {
      t.schedule((time) => {
        const each = stepSec / s.notes.length;
        s.notes.forEach((n, h) => this.synth.triggerAttackRelease(n, Math.max(0.08, each * 0.9), time + h * each));
        this.filter.frequency.rampTo(s.cutoff, Math.min(0.2, stepSec * 0.8), time);
        this.noiseGain.gain.rampTo(s.heat * s.heat * 0.12, stepSec, time);
        if (s.bass) this.bass.triggerAttackRelease(s.bass, stepSec * 2, time);
        draw.schedule(() => {
          this.onStep(i);
          if (this.narrate && s.speak) speak(s.speak);
        }, time);
      }, i * stepSec);
    });
    t.schedule((time) => {
      draw.schedule(() => {
        this.stop();
        this.onEnd();
      }, time);
    }, steps.length * stepSec);
    t.seconds = startIndex * stepSec;
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
  seek(i: number) {
    const clamped = Math.max(0, Math.min(this.steps.length - 1, i));
    this.transport.seconds = clamped * this.stepSec;
    this.onStep(clamped);
  }
  private silence() {
    if (!this.built) return;
    this.synth.releaseAll();
    this.noiseGain.gain.rampTo(0, 0.2);
    window.speechSynthesis?.cancel();
  }
}

function speak(text: string) {
  const s = window.speechSynthesis;
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.2;
  u.volume = 0.8;
  s.speak(u);
}
