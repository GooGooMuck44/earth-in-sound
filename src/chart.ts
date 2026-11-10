// uPlot chart with a playhead that follows the music.
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { Dataset } from "./data";

const num = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : null);
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Chart {
  private u: uPlot | null = null;
  private head = document.createElement("div");
  private ds: Dataset | null = null;
  private cur = 0;
  onSeek: (i: number) => void = () => {};

  constructor(private el: HTMLElement) {
    this.head.className = "playhead";
    new ResizeObserver(() => this.u?.setSize(this.size())).observe(el);
  }

  private size() {
    const w = this.el.clientWidth;
    return { width: w, height: Math.max(220, Math.min(380, Math.round(w * 0.42))) };
  }

  render(ds: Dataset) {
    this.ds = ds;
    this.u?.destroy();
    const xs = ds.points.map((p) => p.x);
    const temp = css("--temp");
    const axis = { stroke: css("--muted"), grid: { stroke: css("--grid"), width: 1 }, ticks: { show: false } };
    const xAxis = { ...axis, values: (_: uPlot, ticks: number[]) => ticks.map((t) => String(Math.floor(t))) };

    let opts: uPlot.Options;
    let data: uPlot.AlignedData;
    if (ds.kind === "global") {
      data = [xs, ds.points.map((p) => p.temp)];
      opts = {
        ...this.size(),
        scales: { x: { time: false } },
        legend: { show: false },
        cursor: { y: false, points: { show: false } },
        axes: [xAxis, { ...axis, label: "°C vs 1951–1980", values: (_, t) => t.map((v) => (v > 0 ? "+" : "") + v.toFixed(1)) }],
        series: [{}, { label: "Anomaly", stroke: temp, width: 2, fill: css("--temp-fill") }],
      };
    } else {
      const bars = uPlot.paths.bars!({ size: [0.7, 8] });
      data = [xs, ds.points.map((p) => p.temp), ds.points.map((p) => num(p.rain)), ds.points.map((p) => num(p.sun))];
      opts = {
        ...this.size(),
        scales: { x: { time: false }, rain: { range: (_u, _lo, hi) => [0, hi * 2.2] } },
        legend: { show: true, live: false },
        cursor: { y: false, points: { show: false } },
        axes: [
          xAxis,
          { ...axis, label: "°C", scale: "°C" },
          { ...axis, scale: "rain", side: 1, grid: { show: false }, label: "rain mm/day" },
        ],
        series: [
          {},
          { label: "Temperature °C", scale: "°C", stroke: temp, width: 2 },
          { label: "Rain", scale: "rain", fill: css("--rain"), stroke: css("--rain"), paths: bars, points: { show: false } },
          { label: "Sunshine", scale: "sun", stroke: css("--sun"), width: 1, dash: [4, 4] },
        ],
      };
    }
    opts.hooks = { setSize: [() => this.setPlayhead(this.cur)] };
    this.u = new uPlot(opts, data, this.el);
    this.u.over.appendChild(this.head);
    this.u.over.addEventListener("click", () => {
      const i = this.u?.cursor.idx;
      if (i != null) this.onSeek(i);
    });
    this.setPlayhead(0);
  }

  setPlayhead(i: number) {
    if (!this.u || !this.ds) return;
    const x = this.ds.points[i]?.x;
    if (x == null) return;
    this.cur = i;
    this.head.style.transform = `translateX(${this.u.valToPos(x, "x")}px)`;
  }
}
