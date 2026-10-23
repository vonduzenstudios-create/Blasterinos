import { Pix, rgb, mix, RNG } from '../engine/pixel';
import { vnoise, hash } from './tiles';

// Parallax backdrops, all painted procedurally. Gradients use a 4x4 Bayer
// dither so they keep a pixel-art texture instead of smooth banding.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dither = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function gradientColor(stops: [number, number][], t: number, x: number, y: number): number {
  // stops: [pos, color]; dithered step between neighbours
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    if (t >= p0 && t <= p1) {
      const f = (t - p0) / (p1 - p0);
      const steps = 4;
      const q = f * steps;
      const base = Math.floor(q), frac = q - base;
      const k = (base + (frac > dither(x, y) ? 1 : 0)) / steps;
      return mix(c0, c1, Math.min(1, k));
    }
  }
  return stops[stops.length - 1][1];
}
/** Seamless 1D noise over a width. */
function loopNoise(x: number, w: number, scale: number, seed: number) {
  const a = vnoise(x / scale, 0.5, seed), b = vnoise((x - w) / scale, 0.5, seed);
  return a * (1 - x / w) + b * (x / w);
}

export function skyCanvas(): HTMLCanvasElement {
  const W = 512, H = 640;
  const p = new Pix(W, H);
  const stops: [number, number][] = [
    [0, rgb('#0b0a26')], [0.3, rgb('#1d1a52')], [0.55, rgb('#3a3a8a')], [0.72, rgb('#7a5aa0')], [0.84, rgb('#e07a7a')], [0.93, rgb('#ffb070')], [1, rgb('#ffe0a0')],
  ];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, gradientColor(stops, y / H, x, y));
  const rng = new RNG(7);
  for (let i = 0; i < 160; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, Math.floor(H * 0.5));
    const b = rng.next();
    p.set(x, y, b > 0.9 ? rgb('#ffffff') : b > 0.6 ? rgb('#b0c0ff') : rgb('#6a70c0'));
    if (b > 0.97) { p.set(x + 1, y, rgb('#8090e0')); p.set(x - 1, y, rgb('#8090e0')); p.set(x, y + 1, rgb('#8090e0')); p.set(x, y - 1, rgb('#8090e0')); }
  }
  // cloud banks near the horizon
  for (let band = 0; band < 3; band++) {
    const cy = H * (0.66 + band * 0.08);
    const col = [rgb('#6a4a8a'), rgb('#c06a7a'), rgb('#f0a070')][band], hi = [rgb('#9a6aa8'), rgb('#f09a8a'), rgb('#ffd090')][band];
    for (let x = 0; x < W; x++) {
      const h = loopNoise(x, W, 26, 80 + band) * 22 + loopNoise(x, W, 7, 90 + band) * 6 - 6;
      for (let y = Math.floor(cy - h); y < cy + 4; y++) {
        const top = y < cy - h + 2;
        if (y < 0) continue;
        p.set(x, y, top ? hi : col);
      }
    }
  }
  return p.toCanvas();
}

export function mountainsCanvas(): HTMLCanvasElement {
  const W = 512, H = 180;
  const p = new Pix(W, H);
  const layers = [
    { base: 40, amp: 90, sc: 60, col: rgb('#4a3a7a'), hi: rgb('#7a5a9a'), seed: 1 },
    { base: 90, amp: 60, sc: 40, col: rgb('#2e2a5a'), hi: rgb('#4a4080'), seed: 2 },
  ];
  for (const L of layers) {
    for (let x = 0; x < W; x++) {
      const n = loopNoise(x, W, L.sc, L.seed) * 0.75 + loopNoise(x, W, L.sc / 4, L.seed + 10) * 0.25;
      const top = Math.floor(L.base + (1 - n) * L.amp * 0.8);
      for (let y = top; y < H; y++) {
        // light from the left side of slopes
        const slope = loopNoise(x + 2, W, L.sc, L.seed) - loopNoise(x - 2, W, L.sc, L.seed);
        const lit = slope > 0.01 && y < top + 30 && (y - top) / 30 < dither(x, y) + 0.3;
        p.set(x, y, lit ? L.hi : L.col);
      }
    }
  }
  // waterfall glimmers in the far cliffs
  for (const fx of [140, 380]) for (let y = 70; y < H; y++) if (hash(fx, y, 3) < 0.7) { p.set(fx, y, rgb('#8ab0e0')); if (y % 3) p.set(fx + 1, y, rgb('#6a80c0')); }
  return p.toCanvas();
}

function blob(p: Pix, cx: number, cy: number, r: number, cols: number[], W: number) {
  for (const ox of [-W, 0, W]) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      const edge = vnoise((x + ox) / 3, y / 3, 5) * 0.25;
      if (d > 1 - edge * 0.5) continue;
      // light comes from the top-left
      const l = (-dx * 0.4 - dy) / r * 0.5 + 0.5 + (vnoise(x / 2.5, y / 2.5, 6) - 0.5) * 0.5;
      const idx = l > 0.78 + dither(x, y) * 0.1 ? 3 : l > 0.55 ? 2 : l > 0.3 ? 1 : 0;
      p.set(x + ox, y, cols[idx]);
    }
  }
}

export function canopyCanvas(): HTMLCanvasElement {
  const W = 512, H = 200;
  const p = new Pix(W, H);
  const rng = new RNG(11);
  const far = [rgb('#0f2a2e'), rgb('#163a3a'), rgb('#1f4c44'), rgb('#2d6450')];
  // ruins: a stepped temple silhouette
  const tx = 300;
  for (let s = 0; s < 6; s++) {
    const w = 100 - s * 14, y0 = 120 - s * 14;
    for (let y = y0; y < y0 + 14; y++) for (let x = tx - w / 2; x < tx + w / 2; x++) {
      const brick = ((y >> 2) + ((x + (y >> 2) * 3) >> 3)) % 2 === 0;
      p.set(x, y, hash(x, y, 4) < 0.08 ? rgb('#16302e') : brick ? rgb('#2a4a48') : rgb('#244040'));
    }
  }
  for (let y = 36; y < 50; y++) for (let x = tx - 6; x < tx + 6; x++) p.set(x, y, rgb('#0a1a1c'));
  for (let i = 0; i < 70; i++) blob(p, rng.range(0, W), rng.range(90, 170), rng.range(14, 30), far, W);
  for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, y < 152 ? far[1] : far[0]);
  return p.toCanvas();
}

export function jungleNearCanvas(): HTMLCanvasElement {
  const W = 512, H = 240;
  const p = new Pix(W, H);
  const rng = new RNG(23);
  const trunk = [rgb('#0e1410'), rgb('#18221a'), rgb('#243226'), rgb('#324434')];
  const leaves = [rgb('#0a2414'), rgb('#123a1c'), rgb('#1c5226'), rgb('#2e6e30')];
  // tall trunks
  for (let i = 0; i < 7; i++) {
    const x0 = rng.range(0, W), w = rng.range(8, 16);
    for (let y = 0; y < H; y++) {
      const sway = Math.sin(y / 40 + i) * 2;
      for (let x = Math.floor(x0 - w / 2 + sway); x < x0 + w / 2 + sway; x++) {
        const t = (x - (x0 - w / 2 + sway)) / w;
        const idx = t < 0.2 ? 3 : t < 0.5 ? 2 : t < 0.85 ? 1 : 0;
        const bark = vnoise(x / 2, y / 7, 9) > 0.7 ? Math.max(0, idx - 1) : idx;
        p.set(((x % W) + W) % W, y, trunk[bark]);
      }
    }
  }
  // hanging vines
  for (let i = 0; i < 26; i++) {
    let x = rng.range(0, W); const len = rng.range(30, 140);
    for (let y = 0; y < len; y++) {
      x += Math.sin(y / 9 + i) * 0.3;
      p.set(((Math.round(x) % W) + W) % W, y, leaves[y % 7 === 0 ? 3 : 2]);
      if (y % 11 === 5) { p.set(((Math.round(x + 1) % W) + W) % W, y, leaves[3]); p.set(((Math.round(x + 2) % W) + W) % W, y + 1, leaves[2]); }
    }
  }
  // leaf masses at top and undergrowth at bottom
  for (let i = 0; i < 40; i++) blob(p, rng.range(0, W), rng.range(-10, 30), rng.range(12, 26), leaves, W);
  for (let i = 0; i < 50; i++) blob(p, rng.range(0, W), rng.range(170, 230), rng.range(12, 24), leaves, W);
  for (let y = 210; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, leaves[0]);
  return p.toCanvas();
}

/** Dark wet cliff face behind the waterfall climb, tiles vertically. */
export function cliffCanvas(): HTMLCanvasElement {
  const W = 512, H = 256;
  const p = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = vnoise(x / 18, y / 18, 41) * 0.6 + vnoise(x / 6, y / 6, 42) * 0.4;
    const e = Math.abs(vnoise(x / 10, y / 10, 43) - 0.5);
    let c = n < 0.4 ? rgb('#141c28') : n < 0.6 ? rgb('#1c2636') : rgb('#263246');
    if (e < 0.03) c = rgb('#0a0e16');
    if (vnoise(x / 4, y / 30, 44) > 0.82) c = mix(c, rgb('#3a6a8a'), 0.4);
    if (vnoise(x / 12, y / 12, 45) > 0.78) c = mix(c, rgb('#1e4a2a'), 0.6);
    p.set(x, y, c);
  }
  return p.toCanvas();
}

/** A foreground fern / leaf cluster drawn in front of the action for depth. */
export function fernCanvas(seed: number): HTMLCanvasElement {
  const W = 64, H = 48;
  const p = new Pix(W, H);
  const rng = new RNG(seed);
  const cols = [rgb('#06140a'), rgb('#0c2412'), rgb('#14361a'), rgb('#1e4a22')];
  for (let f = 0; f < 7; f++) {
    const ang = -Math.PI / 2 + rng.range(-1.2, 1.2);
    const len = rng.range(22, 40);
    const bx = W / 2 + rng.range(-8, 8), by = H;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const a = ang + t * 0.6 * (ang < -Math.PI / 2 ? -1 : 1);
      const x = bx + Math.cos(a) * i, y = by + Math.sin(a) * i;
      p.set(x, y, cols[2]);
      const leaf = Math.round((1 - t) * 6);
      for (let k = 1; k <= leaf; k++) {
        p.set(x + Math.cos(a + 1.2) * k, y + Math.sin(a + 1.2) * k + k * 0.3, cols[k < 2 ? 3 : 1]);
        p.set(x + Math.cos(a - 1.2) * k, y + Math.sin(a - 1.2) * k + k * 0.3, cols[k < 2 ? 2 : 0]);
      }
    }
  }
  return p.toCanvas();
}
