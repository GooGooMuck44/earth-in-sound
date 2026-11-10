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
  onJump: (stepNumber: number) => void = () => {};

  constructor(private container: HTMLElement) {
    this.playhead.className = "playhead";
    new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        if (!this.plot) return;
        const next = this.sizeForContainer();
        if (this.plot.width !== next.width || this.plot.height !== next.height) this.plot.setSize(next);
      });
    }).observe(container);
  }

  private sizeForContainer() {
    const width = this.container.clientWidth;
    return { width, height: Math.max(220, Math.min(380, Math.round(width * 0.42))) };
  }

  render(track: ClimateTrack) {
    this.track = track;
    this.plot?.destroy();
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
      ...this.sizeForContainer(),
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

  movePlayhead(stepNumber: number) {
    if (!this.plot || !this.track) return;
    const position = this.track.points[stepNumber]?.position;
    if (position == null) return;
    this.currentStep = stepNumber;
    this.playhead.style.transform = `translateX(${this.plot.valToPos(position, "x")}px)`;
  }
}
