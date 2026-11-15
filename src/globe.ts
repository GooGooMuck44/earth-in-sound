export type Spot = { latitude: number; longitude: number };

const vertex = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const fragment = `
precision highp float;
uniform sampler2D day;
uniform sampler2D night;
uniform sampler2D clouds;
uniform vec2 center;
uniform float radius;
uniform float ratio;
uniform vec2 view;
uniform vec3 sun;
uniform float drift;
uniform vec3 spot;
uniform float marked;
uniform float time;

const float PI = 3.14159265;

vec3 toWorld(vec3 n) {
  float a = -view.x;
  vec3 r = vec3(n.x, n.y * cos(a) - n.z * sin(a), n.y * sin(a) + n.z * cos(a));
  float b = view.y;
  return vec3(r.x * cos(b) + r.z * sin(b), r.y, -r.x * sin(b) + r.z * cos(b));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 stars(vec2 frag) {
  vec2 cell = floor(frag / (2.6 * ratio));
  float h = hash(cell);
  if (h < 0.9965) return vec3(0.0);
  float glow = (h - 0.9965) / 0.0035;
  float tw = 0.65 + 0.35 * sin(time * (1.0 + glow * 2.0) + h * 80.0);
  return vec3(0.75, 0.82, 1.0) * glow * tw * 0.85;
}

void main() {
  vec2 p = (gl_FragCoord.xy - center) / radius;
  float d2 = dot(p, p);
  vec3 sky = vec3(0.012, 0.016, 0.03) + stars(gl_FragCoord.xy);
  if (d2 > 1.0) {
    float d = sqrt(d2);
    vec3 edge = toWorld(normalize(vec3(p, 0.0)));
    float lit = smoothstep(-0.35, 0.6, dot(edge, sun));
    float halo = exp(-(d - 1.0) * 22.0) * (0.25 + 0.75 * lit);
    vec3 col = sky * smoothstep(1.0, 1.06, d) + vec3(0.32, 0.58, 1.0) * halo * 0.9;
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  float z = sqrt(1.0 - d2);
  vec3 n = toWorld(vec3(p, z));
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  vec3 land = texture2D(day, uv).rgb;
  vec3 lights = texture2D(night, uv).rgb;
  float cloud = texture2D(clouds, vec2(fract(uv.x + drift), uv.y)).r;
  float light = dot(n, sun);
  float dayside = smoothstep(-0.12, 0.2, light);
  float direct = max(light, 0.0);
  vec3 lit = land * (0.08 + 1.05 * pow(direct, 0.8));
  float water = smoothstep(0.02, 0.12, land.b - max(land.r, land.g) + 0.06) * (1.0 - smoothstep(0.35, 0.6, land.g));
  vec3 eye = toWorld(vec3(0.0, 0.0, 1.0));
  vec3 mid = normalize(sun + eye);
  float glint = pow(max(dot(n, mid), 0.0), 60.0) * water * direct;
  lit += vec3(1.0, 0.92, 0.78) * glint * 0.7;
  float glow = smoothstep(0.12, 0.85, dot(lights, vec3(0.3, 0.5, 0.2)));
  vec3 dark = vec3(1.0, 0.76, 0.42) * glow * 1.4 + land * 0.03;
  vec3 col = mix(dark, lit, dayside);
  float shade = 0.05 + 0.95 * smoothstep(-0.15, 0.35, light);
  col = mix(col, vec3(0.97, 0.98, 1.0) * shade, cloud * 0.85);
  float rim = pow(1.0 - z, 2.6);
  col += vec3(0.3, 0.55, 1.0) * rim * (0.15 + 0.85 * smoothstep(-0.25, 0.5, light)) * 0.9;
  float twilight = exp(-pow(light / 0.06, 2.0)) * 0.09;
  col += vec3(1.0, 0.45, 0.2) * twilight * (1.0 - cloud * 0.5);
  if (marked > 0.5) {
    float g = acos(clamp(dot(n, spot), -1.0, 1.0));
    float ring = smoothstep(0.009, 0.004, abs(g - 0.055 - 0.012 * sin(time * 3.0)));
    float pin = smoothstep(0.016, 0.011, g);
    col = mix(col, vec3(1.0, 0.82, 0.42), max(ring * 0.9, pin));
  }
  float edge = smoothstep(1.0, 0.99, sqrt(d2));
  vec3 air = vec3(0.32, 0.58, 1.0) * 0.9 * (0.25 + 0.75 * smoothstep(-0.35, 0.6, light));
  gl_FragColor = vec4(mix(air, col, edge), 1.0);
}
`;

const deg = Math.PI / 180;

export function subsolar(date: Date): Spot {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const latitude = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const longitude = ((((12 - hours) * 15 + 180) % 360) + 360) % 360 - 180;
  return { latitude, longitude };
}

export function toVector({ latitude, longitude }: Spot): [number, number, number] {
  const a = latitude * deg;
  const b = longitude * deg;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)];
}

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export class Globe {
  readonly canvas: HTMLCanvasElement;
  readonly ready: Promise<void>;
  lat = 18;
  lon = 0;
  spin = 0;
  tilt = 0;
  picked: Spot | null = null;
  layout = { x: 0.5, y: 0.5, r: 0.4 };
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private frame = 0;
  private running = false;
  private last = 0;
  private drift = 0;
  private idleUntil = 0;
  private calm: boolean;
  private textures: WebGLTexture[] = [];

  constructor(canvas: HTMLCanvasElement, base: string, calm: boolean) {
    this.canvas = canvas;
    this.calm = calm;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    this.program = this.build();
    const big = Math.min(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) > 900;
    const size = big ? "" : "-sm";
    const files = [`earth${size}.jpg`, `night${size}.jpg`, "clouds.jpg"];
    this.ready = Promise.all(files.map((file) => load(`${base}home/${file}`))).then((images) => {
      this.textures = images.map((image, index) => this.upload(image, index));
      this.draw(performance.now());
    });
  }

  private build() {
    const gl = this.gl;
    const shader = (type: number, source: string) => {
      const item = gl.createShader(type)!;
      gl.shaderSource(item, source);
      gl.compileShader(item);
      if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item) ?? "shader");
      return item;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link");
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    ["day", "night", "clouds"].forEach((name, index) => gl.uniform1i(gl.getUniformLocation(program, name), index));
    return program;
  }

  private upload(image: HTMLImageElement, unit: number) {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private size() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(this.canvas.clientWidth * ratio);
    const height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return { width, height, ratio };
  }

  geometry() {
    const box = this.canvas.getBoundingClientRect();
    const r = this.layout.r * Math.min(box.width, box.height);
    return { cx: box.left + this.layout.x * box.width, cy: box.top + this.layout.y * box.height, r };
  }

  spotAt(clientX: number, clientY: number): Spot | null {
    const { cx, cy, r } = this.geometry();
    const x = (clientX - cx) / r;
    const y = -(clientY - cy) / r;
    const d2 = x * x + y * y;
    if (d2 > 1) return null;
    const z = Math.sqrt(1 - d2);
    const a = -this.lat * deg;
    const ry = y * Math.cos(a) - z * Math.sin(a);
    const rz = y * Math.sin(a) + z * Math.cos(a);
    const b = this.lon * deg;
    const wx = x * Math.cos(b) + rz * Math.sin(b);
    const wz = -x * Math.sin(b) + rz * Math.cos(b);
    return { latitude: Math.asin(Math.max(-1, Math.min(1, ry))) / deg, longitude: Math.atan2(wx, wz) / deg };
  }

  turn(dLon: number, dLat: number) {
    this.lon = ((((this.lon + dLon) % 360) + 540) % 360) - 180;
    this.lat = Math.max(-75, Math.min(75, this.lat + dLat));
    this.hold();
    if (!this.running) this.draw(performance.now());
  }

  hold(ms = 3500) {
    this.idleUntil = performance.now() + ms;
  }

  draw(now: number) {
    if (!this.textures.length) return;
    const gl = this.gl;
    const { width, height, ratio } = this.size();
    gl.viewport(0, 0, width, height);
    const u = (name: string) => gl.getUniformLocation(this.program, name);
    const r = this.layout.r * Math.min(width, height);
    gl.uniform2f(u("center"), this.layout.x * width, (1 - this.layout.y) * height);
    gl.uniform1f(u("radius"), r);
    gl.uniform1f(u("ratio"), ratio);
    gl.uniform2f(u("view"), this.lat * deg, this.lon * deg);
    gl.uniform3fv(u("sun"), toVector(subsolar(new Date())));
    gl.uniform1f(u("drift"), this.drift);
    gl.uniform1f(u("time"), now / 1000);
    gl.uniform1f(u("marked"), this.picked ? 1 : 0);
    if (this.picked) gl.uniform3fv(u("spot"), toVector(this.picked));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private tick = (now: number) => {
    if (!this.running) return;
    const step = Math.min(now - (this.last || now), 64);
    this.last = now;
    if (!this.calm) {
      this.drift = (this.drift + step * 0.0000015) % 1;
      if (now > this.idleUntil) this.lon = ((this.lon + step * 0.004 + 540) % 360) - 180;
      if (Math.abs(this.spin) > 0.001 || Math.abs(this.tilt) > 0.001) {
        this.turn(this.spin * step, this.tilt * step);
        this.spin *= 0.94;
        this.tilt *= 0.94;
      }
    }
    this.draw(now);
    this.frame = requestAnimationFrame(this.tick);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }
}
