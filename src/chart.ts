import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { ClimateTrack } from "./data";

const orBlank = (value: number | undefined) => (value != null && Number.isFinite(value) ? value : null);
const themeColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const signedTicks = (_plot: uPlot, ticks: number[]) => ticks.map((tick) => (tick > 0 ? "+" : "") + tick.toFixed(1));

export class ClimateChart {
  private plot: uPlot | null = null;
  private playhead = document.createElement("div");
  private track: ClimateTrack | null = null;
  private currentStep = 0;
  private resizeFrame = 0;
  private picture: HTMLDivElement | null = null;
  onJump: (stepNumber: number) => void = () => {};

  constructor(private container: HTMLElement) {
    this.playhead.className = "playhead";
    new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        if (this.plot) {
          const next = this.fitSize();
          if (this.plot.width !== next.width || this.plot.height !== next.height) this.plot.setSize(next);
        }
        if (this.picture) this.movePlayhead(this.currentStep);
      });
    }).observe(container);
  }

  private fitSize() {
    const width = this.container.clientWidth;
    return { width, height: Math.max(220, Math.min(380, Math.round(width * 0.42))) };
  }

  render(track: ClimateTrack) {
    this.track = track;
    this.plot?.destroy();
    this.plot = null;
    this.picture?.remove();
    this.picture = null;
    if (track.scan) {
      this.showPicture(track);
      return;
    }
    const positions = track.points.map((point) => point.position);
    const warmColor = themeColor("--temp");
    const axisStyle = {
      stroke: themeColor("--muted"),
      grid: { stroke: themeColor("--grid"), width: 1 },
      ticks: { show: false },
    };
    const yearAxis = {
      ...axisStyle,
      values: (_plot: uPlot, ticks: number[]) => ticks.map((tick) => String(Math.floor(tick))),
    };
    const sharedOptions = {
      ...this.fitSize(),
      cursor: { y: false, points: { show: false } },
    };

    let options: uPlot.Options;
    let series: uPlot.AlignedData;
    if (track.kind === "global") {
      series = [positions, track.points.map((point) => point.temperature)];
      options = {
        ...sharedOptions,
        scales: { x: { time: false } },
        legend: { show: false },
        axes: [yearAxis, { ...axisStyle, label: "°C", values: signedTicks }],
        series: [{}, { label: "Anomaly", stroke: warmColor, width: 2, fill: themeColor("--temp-fill") }],
      };
    } else if (track.kind === "events") {
      const dayBars = uPlot.paths.bars!({ size: [0.8, 14] });
      series = [positions, track.points.map((point) => point.temperature)];
      options = {
        ...sharedOptions,
        scales: { x: { time: false } },
        legend: { show: false },
        axes: [
          { ...axisStyle, values: (_plot: uPlot, ticks: number[]) => ticks.map((tick) => track.points[Math.round(tick)]?.label ?? "") },
          { ...axisStyle, label: "events" },
        ],
        series: [{}, { label: "Events", stroke: warmColor, fill: themeColor("--temp-fill"), paths: dayBars, points: { show: false } }],
      };
    } else if (track.kind === "zones") {
      series = [
        positions,
        track.points.map((point) => orBlank(point.arctic)),
        track.points.map((point) => orBlank(point.tropics)),
        track.points.map((point) => orBlank(point.antarctic)),
      ];
      options = {
        ...sharedOptions,
        scales: { x: { time: false } },
        legend: { show: true, live: false },
        axes: [yearAxis, { ...axisStyle, label: "°C", values: signedTicks }],
        series: [
          {},
          { label: "Arctic", stroke: themeColor("--arctic"), width: 2 },
          { label: "Tropics", stroke: themeColor("--tropics"), width: 2 },
          { label: "Antarctic", stroke: themeColor("--antarctic"), width: 1.5 },
        ],
      };
    } else {
      const rainBars = uPlot.paths.bars!({ size: [0.7, 8] });
      series = [
        positions,
        track.points.map((point) => point.temperature),
        track.points.map((point) => orBlank(point.rainfall)),
        track.points.map((point) => orBlank(point.sunshine)),
      ];
      options = {
        ...sharedOptions,
        scales: { x: { time: false }, rain: { range: (_plot, _lowest, highest) => [0, highest * 2.2] } },
        legend: { show: true, live: false },
        axes: [
          yearAxis,
          { ...axisStyle, label: "°C", scale: "°C" },
          { ...axisStyle, scale: "rain", side: 1, grid: { show: false }, label: "mm/day" },
        ],
        series: [
          {},
          { label: "Temperature", scale: "°C", stroke: warmColor, width: 2 },
          { label: "Rain", scale: "rain", fill: themeColor("--rain"), stroke: themeColor("--rain"), paths: rainBars, points: { show: false } },
          { label: "Sunshine", scale: "sun", stroke: themeColor("--sun"), width: 1, dash: [4, 4] },
        ],
      };
    }
    options.hooks = { setSize: [() => this.movePlayhead(this.currentStep)] };
    this.plot = new uPlot(options, series, this.container);
    this.plot.over.appendChild(this.playhead);
    this.plot.over.addEventListener("click", () => {
      const clickedStep = this.plot?.cursor.idx;
      if (clickedStep != null) this.onJump(clickedStep);
    });
    this.movePlayhead(0);
  }

  private showPicture(track: ClimateTrack) {
    const frame = document.createElement("div");
    frame.className = "scan-frame";
    for (const picture of track.scan!.pictures) {
      const image = document.createElement("img");
      image.src = picture.imageUrl;
      image.alt = track.scan!.description;
      frame.appendChild(image);
    }
    frame.appendChild(this.playhead);
    frame.addEventListener("click", (event) => {
      const box = frame.getBoundingClientRect();
      const share = (event.clientX - box.left) / box.width;
      const perPicture = track.points.length / track.scan!.pictures.length;
      const shown = this.shownPicture();
      this.onJump(Math.min(track.points.length - 1, shown * perPicture + Math.floor(share * perPicture)));
    });
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
      const pictures = this.track.scan.pictures.length;
      const perPicture = this.track.points.length / pictures;
      const shown = this.shownPicture();
      [...this.picture.querySelectorAll("img")].forEach((image, order) => (image.hidden = order !== shown));
      const share = ((stepNumber % perPicture) + 0.5) / perPicture;
      this.playhead.style.transform = `translateX(${share * this.picture.clientWidth}px)`;
      return;
    }
    if (!this.plot || !this.track) return;
    const position = this.track.points[stepNumber]?.position;
    if (position == null) return;
    this.currentStep = stepNumber;
    this.playhead.style.transform = `translateX(${this.plot.valToPos(position, "x")}px)`;
  }
}
