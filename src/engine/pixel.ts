// A tiny pixel painter: every sprite in the game is rasterized here from code.
// Shapes are drawn into "parts" so each part can get its own top-light / bottom-shadow
// shading, then the whole image gets a dark outline, which is what gives the art its
// hand-pixeled look.

export type Ramp = [number, number, number]; // shadow, base, highlight

export function rgb(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
export function ramp(dark: string, base: string, light: string): Ramp {
  return [rgb(dark), rgb(base), rgb(light)];
}
export function mix(a: number, b: number, t: number): number {
  const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
  const br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0;
}
export function withAlpha(c: number, a: number): number {
  return (((Math.round(a * 255) & 255) << 24) | (c & 0xffffff)) >>> 0;
}

export class RNG {
  s: number;
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s / 4294967296; }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}

export class Pix {
  w: number; h: number;
  data: Uint32Array;
  part: Uint16Array;
  private nextPart = 1;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.data = new Uint32Array(w * h);
    this.part = new Uint16Array(w * h);
  }
  newPart() { return this.nextPart++; }
  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number) { return this.inb(x, y) ? this.data[y * this.w + x] : 0; }
  set(x: number, y: number, c: number, p = 0) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inb(x, y)) return;
    const i = y * this.w + x;
    this.data[i] = c; this.part[i] = c === 0 ? 0 : p;
  }
  /** Only paints over pixels that are already opaque (for details on top of a shape). */
  over(x: number, y: number, c: number) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inb(x, y)) return;
    const i = y * this.w + x;
    if (this.data[i] !== 0) this.data[i] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: number, p = 0) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, p);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, p = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35);
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, p);
      }
  }
  circle(cx: number, cy: number, r: number, c: number, p = 0) { this.ellipse(cx, cy, r, r, c, p); }
  /** Thick line made of discs: used for limbs, necks, gun barrels. */
  line(x0: number, y0: number, x1: number, y1: number, c: number, thick = 1, p = 0) {
    const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const r = (thick - 1) / 2;
    for (let i = 0; i <= len; i++) {
      const t = i / len;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (thick <= 1) this.set(x, y, c, p);
      else if (thick === 2) { this.set(x, y, c, p); this.set(x + 1, y, c, p); this.set(x, y + 1, c, p); this.set(x + 1, y + 1, c, p); }
      else this.circle(x, y, r, c, p);
    }
  }
  poly(pts: [number, number][], c: number, p = 0) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) {
          xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c, p);
    }
  }
  /** Shade a part: lit from the top-left, shadow toward the bottom-right. */
  shade(p: number, r: Ramp, strength = 1) {
    const { w, h, part, data } = this;
    const out = data.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (part[i] !== p) continue;
      const pu = y > 0 ? part[i - w] : 0, pl = x > 0 ? part[i - 1] : 0;
      const pd = y < h - 1 ? part[i + w] : 0, pr = x < w - 1 ? part[i + 1] : 0;
      const pd2 = y < h - 2 ? part[i + 2 * w] : 0;
      if (pu !== p || (strength > 1 && pl !== p)) out[i] = r[2];
      else if (pd !== p || pr !== p || (strength > 1 && pd2 !== p)) out[i] = r[0];
      else out[i] = r[1];
    }
    this.data = out;
  }
  /**
   * Rounded "3D" shading for big shapes: a distance field from the part's edge acts
   * as a height map, its slope gives a normal, and the light comes from the top-left.
   * cols run dark -> light. pattern() can nudge the ramp index (e.g. for scales).
   */
  volume(p: number, cols: number[], opts: { pattern?: (x: number, y: number) => number; flat?: number } = {}) {
    const { w, h, part } = this;
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) d[i] = part[i] === p ? INF : 0;
    const D1 = 1, D2 = 1.414;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + D1); else m = Math.min(m, D1);
      if (y > 0) m = Math.min(m, d[i - w] + D1); else m = Math.min(m, D1);
      if (x > 0 && y > 0) m = Math.min(m, d[i - w - 1] + D2);
      if (x < w - 1 && y > 0) m = Math.min(m, d[i - w + 1] + D2);
      d[i] = m;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; if (d[i] === 0) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + D1); else m = Math.min(m, D1);
      if (y < h - 1) m = Math.min(m, d[i + w] + D1); else m = Math.min(m, D1);
      if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + D2);
      if (x > 0 && y < h - 1) m = Math.min(m, d[i + w - 1] + D2);
      d[i] = m;
    }
    let maxD = 1;
    for (let i = 0; i < w * h; i++) if (d[i] > maxD) maxD = d[i];
    const R = Math.max(2, maxD * (opts.flat ?? 1));
    const H = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return 0;
      const v = Math.min(d[y * w + x], R) / R;
      return Math.sqrt(1 - (1 - v) * (1 - v));
    };
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const n = cols.length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (part[i] !== p) continue;
      const gx = H(x + 1, y) - H(x - 1, y), gy = H(x, y + 1) - H(x, y - 1);
      // outward normal is -gradient; light from top-left
      const lit = (gx * 0.55 + gy * 0.85) * 2.2 * R / 6;
      const b = 0.5 + Math.max(-0.6, Math.min(0.6, lit)) + (H(x, y) - 0.6) * 0.25;
      const th = (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
      let k = Math.round(b * (n - 1) + th * 0.9);
      if (opts.pattern) k += opts.pattern(x, y);
      this.data[i] = cols[Math.max(0, Math.min(n - 1, k))];
    }
  }
  /** Paint a part with base color and shade it in one call. */
  shape(r: Ramp, draw: (c: number, p: number) => void, strength = 1) {
    const p = this.newPart();
    draw(r[1], p);
    this.shade(p, r, strength);
    return p;
  }
  /** Sprinkle texture onto existing pixels of a part (or all pixels when p = -1). */
  speckle(p: number, c: number, density: number, rng: RNG) {
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] === 0) continue;
      if (p >= 0 && this.part[i] !== p) continue;
      if (rng.next() < density) this.data[i] = c;
    }
  }
  outline(c: number, diagonal = false) {
    const { w, h, data } = this;
    const out = data.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i] !== 0) continue;
      const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h && data[yy * w + xx] !== 0 && (data[yy * w + xx] >>> 24) > 200;
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1) ||
        (diagonal && (n(x - 1, y - 1) || n(x + 1, y - 1) || n(x - 1, y + 1) || n(x + 1, y + 1)))) out[i] = c;
    }
    this.data = out;
  }
  /** Copy another Pix onto this one (opaque pixels only). */
  blit(src: Pix, dx: number, dy: number, flip = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.data[y * src.w + (flip ? src.w - 1 - x : x)];
      if (c !== 0) this.set(dx + x, dy + y, c);
    }
  }
  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.data);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

/** A finished sprite frame with its anchor (feet / center) in pixels. */
export interface Frame { canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number; }
export function frame(p: Pix, ax: number, ay: number): Frame {
  return { canvas: p.toCanvas(), w: p.w, h: p.h, ax, ay };
}
