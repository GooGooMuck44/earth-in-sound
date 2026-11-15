import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { ClimatePoint, ClimateTrack } from "./data";
import { signed } from "./findings";

const orBlank = (value: number | undefined) => (value != null && Number.isFinite(value) ? value : null);
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export function tickDigits(ticks: number[]) {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  if (!step || !Number.isFinite(step)) return 1;
  const power = Math.floor(Math.log10(step) + 1e-9);
  const mantissa = Number((step / 10 ** power).toFixed(6));
  return Math.max(0, -power + (Number.isInteger(mantissa) ? 0 : 1));
}
const signedTicks = (_plot: uPlot, ticks: number[]) => {
  const digits = tickDigits(ticks);
  return ticks.map((tick) => (tick > 0 ? "+" : tick < 0 ? "−" : "") + Math.abs(tick).toFixed(digits));
};
const plainTicks = (_plot: uPlot, ticks: number[]) => {
  const digits = tickDigits(ticks);
  return ticks.map((tick) => (tick < 0 ? "−" : "") + Math.abs(tick).toFixed(digits));
};

interface Line {
  name: string;
  color: string;
  dash?: number[];
  read: (point: ClimatePoint) => number | undefined;
  scale?: string;
  bars?: boolean;
  width?: number;
  units: string;
  digits: number;
  signed?: boolean;
}

export interface Key {
  name: string;
  color: string;
  style: "solid" | "dash" | "dot" | "bar";
}

export class ClimateChart {
  private plot: uPlot | null = null;
  private playhead = document.createElement("div");
  private marker = document.createElement("div");
  private tip = document.createElement("div");
  private track: ClimateTrack | null = null;
  private lines: Line[] = [];
  private currentStep = 0;
  private resizeFrame = 0;
  private picture: HTMLDivElement | null = null;
  private dragging = false;
  onJump: (stepNumber: number) => void = () => {};
  onKey: (keys: Key[]) => void = () => {};

  constructor(private container: HTMLElement) {
    this.playhead.className = "playhead";
    this.marker.className = "marker";
    this.tip.className = "tip";
    this.tip.setAttribute("aria-hidden", "true");
    new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        if (this.plot) {
          const next = this.fitSize();
          if (this.plot.width !== next.width || this.plot.height !== next.height) this.plot.setSize(next);
        }
        this.movePlayhead(this.currentStep);
      });
    }).observe(container);
  }

  private fitSize() {
    const width = Math.max(240, this.container.clientWidth);
    const tall = window.innerWidth >= 900 ? 0.4 : 0.62;
    return { width, height: Math.max(210, Math.min(360, Math.round(width * tall))) };
  }

  private linesFor(track: ClimateTrack): Line[] {
    const warm = token("--coral");
    switch (track.kind) {
      case "global":
        return [{ name: "Global", color: warm, read: (point) => point.temperature, units: "°C", digits: 2, signed: true, width: 2 }];
      case "zones":
        return [
          { name: track.bands?.[0] ?? "Arctic", color: token("--ice"), read: (point) => point.arctic, units: "°C", digits: 2, signed: true, width: 2 },
          { name: track.bands?.[1] ?? "Tropics", color: token("--sun"), dash: [7, 5], read: (point) => point.tropics, units: "°C", digits: 2, signed: true, width: 2 },
          { name: track.bands?.[2] ?? "Antarctic", color: token("--water"), dash: [2, 4], read: (point) => point.antarctic, units: "°C", digits: 2, signed: true, width: 2 },
        ];
      case "place":
        return [
          { name: "Temperature", color: warm, read: (point) => point.temperature, units: "°C", digits: 1, width: 2, scale: "c" },
          { name: "Rain", color: token("--water"), read: (point) => point.rainfall, units: "mm/day", digits: 1, scale: "rain", bars: true },
          { name: "Sunlight", color: token("--sun"), dash: [4, 4], read: (point) => point.sunshine, units: "MJ/m²/day", digits: 1, scale: "sun", width: 1.5 },
        ];
      case "compare":
        return track.places!.map((place, side) => ({
          name: place.name,
          color: side ? token("--water") : token("--coral"),
          dash: side ? [7, 5] : undefined,
          read: side ? (point: ClimatePoint) => point.other : (point: ClimatePoint) => point.temperature,
          units: "°C",
          digits: 1,
          width: 2,
        }));
      case "events":
        return [{ name: "Tracked events", color: token("--accent"), read: (point) => point.temperature, units: "events", digits: 0, bars: true }];
      default:
        return [];
    }
  }

  render(track: ClimateTrack) {
    this.track = track;
    this.plot?.destroy();
    this.plot = null;
    this.picture?.remove();
    this.picture = null;
    this.tip.remove();
    this.container.querySelector(".empty")?.remove();
    if (track.scan) {
      this.lines = [];
      this.onKey([]);
      this.showPicture(track);
      return;
    }
    if (!track.points.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No data in this range";
      this.container.appendChild(empty);
      this.onKey([]);
      return;
    }
    this.lines = this.linesFor(track);
    this.onKey(this.lines.map((line) => ({ name: line.name, color: line.color, style: line.bars ? "bar" : !line.dash ? "solid" : line.dash[0] > 4 ? "dash" : "dot" })));
    const font = `500 12px ${token("--font")}`;
    const axis = {
      stroke: token("--text-2"),
      font,
      labelFont: font,
      grid: { stroke: token("--grid"), width: 1 },
      ticks: { show: false },
      gap: 6,
    };
    const xValues =
      track.kind === "events"
        ? (_plot: uPlot, ticks: number[]) => ticks.map((tick) => track.points[Math.round(tick)]?.label ?? "")
        : (_plot: uPlot, ticks: number[]) => ticks.map((tick) => String(Math.floor(tick)));
    const years = track.points.at(-1)!.position - track.points[0].position;
    const xAxis = { ...axis, values: xValues, space: track.kind === "events" ? 70 : years < 3 ? 80 : 60 };
    const positions = track.points.map((point) => point.position);
    const data: uPlot.AlignedData = [positions, ...this.lines.map((line) => track.points.map((point) => orBlank(line.read(point))))];
    const scales: uPlot.Scales = { x: { time: false } };
    const axes: uPlot.Axis[] = [xAxis];
    if (track.kind === "place") {
      scales.rain = { range: (_plot, _low, high) => [0, Math.max(1, high) * 2.4] };
      scales.sun = { range: (_plot, low, high) => [low - (high - low) * 3, high + (high - low) * 0.1] };
      scales.c = { range: (_plot, low, high) => [low - (high - low) * 0.05, high + (high - low) * 0.6] };
      axes.push({ ...axis, scale: "c", label: "°C", size: 48 });
      axes.push({ ...axis, scale: "rain", side: 1, grid: { show: false }, label: "mm/day", size: 44 });
    } else if (track.kind === "events") {
      axes.push({ ...axis, scale: "y", label: "events", values: plainTicks, size: 48 });
    } else {
      axes.push({ ...axis, scale: "y", label: "°C", values: track.kind === "compare" ? plainTicks : signedTicks, size: 52 });
    }
    const bars = uPlot.paths.bars!({ size: [0.75, 12] });
    const options: uPlot.Options = {
      ...this.fitSize(),
      scales,
      axes,
      legend: { show: false },
      cursor: { y: false, points: { show: false }, drag: { x: false, y: false } },
      series: [
        {},
        ...this.lines.map((line) => ({
          label: line.name,
          scale: line.scale ?? "y",
          stroke: line.color,
          width: line.width ?? 1,
          ...(line.dash ? { dash: line.dash } : {}),
          ...(line.bars ? { fill: line.color + "66" } : track.kind === "global" ? { fill: line.color + "1f" } : {}),
          paths: line.bars ? bars : undefined,
          points: { show: false },
          spanGaps: false,
        })),
      ],
      hooks: {
        setSize: [() => this.movePlayhead(this.currentStep)],
        setCursor: [(plot) => this.showTip(plot.cursor.idx ?? null, plot.cursor.left ?? 0)],
      },
    };
    this.plot = new uPlot(options, data, this.container);
    const over = this.plot.over;
    over.append(this.playhead, this.marker, this.tip);
    over.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      over.setPointerCapture(event.pointerId);
      this.jumpFromPointer(event);
    });
    over.addEventListener("pointermove", (event) => this.dragging && this.jumpFromPointer(event));
    const release = () => (this.dragging = false);
    over.addEventListener("pointerup", release);
    over.addEventListener("pointercancel", release);
    over.addEventListener("pointerleave", () => !this.dragging && this.showTip(null, 0));
    this.movePlayhead(Math.min(this.currentStep, track.points.length - 1));
  }

  private jumpFromPointer(event: PointerEvent) {
    if (!this.plot || !this.track) return;
    const box = this.plot.over.getBoundingClientRect();
    const x = Math.max(0, Math.min(box.width, event.clientX - box.left));
    const index = this.plot.posToIdx(x);
    if (index != null && index >= 0) this.onJump(Math.min(this.track.points.length - 1, index));
  }

  private showTip(index: number | null, left: number) {
    if (!this.track || index == null || index < 0 || !this.track.points[index]) {
      this.tip.hidden = true;
      return;
    }
    const point = this.track.points[index];
    const rows = this.lines
      .map((line) => {
        const value = line.read(point);
        const shown = value == null || !Number.isFinite(value) ? "no data" : `${line.signed ? signed(value, line.digits) : value.toFixed(line.digits)} ${line.units}`;
        return `<span><i style="background:${line.color}"></i>${line.name} <b>${shown}</b></span>`;
      })
      .join("");
    this.tip.innerHTML = `<strong>${point.label}</strong>${rows}`;
    this.tip.hidden = false;
    const width = this.plot?.over.clientWidth ?? 0;
    const flip = left > width / 2;
    this.tip.style.left = flip ? "" : `${left + 12}px`;
    this.tip.style.right = flip ? `${width - left + 12}px` : "";
  }

  private showPicture(track: ClimateTrack) {
    const frame = document.createElement("div");
    frame.className = "scan-frame";
    for (const picture of track.scan!.pictures) {
      const image = document.createElement("img");
      image.src = picture.imageUrl;
      image.alt = track.scan!.description;
      image.width = 720;
      image.height = 360;
      frame.appendChild(image);
    }
    frame.appendChild(this.playhead);
    const jump = (event: PointerEvent) => {
      const box = frame.getBoundingClientRect();
      const share = Math.max(0, Math.min(0.999, (event.clientX - box.left) / box.width));
      const perPicture = track.points.length / track.scan!.pictures.length;
      this.onJump(Math.min(track.points.length - 1, this.shownPicture() * perPicture + Math.floor(share * perPicture)));
    };
    frame.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      frame.setPointerCapture(event.pointerId);
      jump(event);
    });
    frame.addEventListener("pointermove", (event) => this.dragging && jump(event));
    frame.addEventListener("pointerup", () => (this.dragging = false));
    frame.addEventListener("pointercancel", () => (this.dragging = false));
    this.container.appendChild(frame);
    this.picture = frame;
    this.movePlayhead(0);
  }

  private shownPicture() {
    if (!this.track?.scan) return 0;
    const perPicture = this.track.points.length / this.track.scan.pictures.length;
    return Math.floor(this.currentStep / perPicture);
  }

  movePlayhead(stepNumber: number) {
    if (this.picture && this.track?.scan) {
      this.currentStep = stepNumber;
      const perPicture = this.track.points.length / this.track.scan.pictures.length;
      const shown = this.shownPicture();
      [...this.picture.querySelectorAll("img")].forEach((image, order) => (image.hidden = order !== shown));
      const share = ((stepNumber % perPicture) + 0.5) / perPicture;
      this.playhead.style.transform = `translateX(${share * this.picture.clientWidth}px)`;
      return;
    }
    if (!this.plot || !this.track) return;
    const point = this.track.points[stepNumber];
    if (!point) return;
    this.currentStep = stepNumber;
    const x = this.plot.valToPos(point.position, "x");
    this.playhead.style.transform = `translateX(${x}px)`;
    const line = this.lines[0];
    const value = line ? line.read(point) : undefined;
    if (line && value != null && Number.isFinite(value) && !line.bars) {
      const y = this.plot.valToPos(value, line.scale ?? "y");
      this.marker.hidden = false;
      this.marker.style.transform = `translate(${x}px, ${y}px)`;
      this.marker.style.borderColor = line.color;
    } else {
      this.marker.hidden = true;
    }
  }
}
