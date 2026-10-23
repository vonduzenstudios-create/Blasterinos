import { Pix, rgb, ramp, mix, withAlpha, RNG, frame, type Frame, type Ramp } from '../engine/pixel';
import { OUTLINE, drawHumanoid, AX, AY, type Look, type Pose } from './humanoid';
import { vnoise, hash, TS } from './tiles';
import { dither } from './backgrounds';

// Stage 4, "Snowland": winter backdrops, the snowy ground painter, props, the
// snowmen, ski troopers and rolling snowballs, and Santa with his sack.

export interface SnowArt {
  sky: HTMLCanvasElement; peaks: HTMLCanvasElement; firs: HTMLCanvasElement; near: HTMLCanvasElement;
  pine: Frame[]; rock: Frame; cane: Frame; pole: Frame; workshop: Frame; pile: Frame; lamp: Frame;
  snowman: Frame[]; snowball: Frame[]; bigball: Frame; puff: Frame[]; wave: Frame[]; shard: Frame;
  skier: Frame[]; skierAir: Frame;
  thinIce: Frame[];
  santa: { stand: Frame[]; walk: Frame[]; crouch: Frame; air: Frame; laugh: Frame; down: Frame };
  arm: Frame; sack: Frame[]; present: Frame[]; shadow: Frame;
}

/** Tile ids for the Snowland map (its own set, painted by paintSnowChunk). */
export const ST = { E: 0, FILL: 1, ROCK: 2, ICE: 3, FLOE: 4, LOG: 6 } as const;

const SNOW = ['#5a6a9a', '#8a9ccc', '#b8c8ec', '#dce6fa', '#ffffff'].map(rgb);
const ICE = ['#22507e', '#3e80b8', '#6ab4e4', '#a6dcfa', '#e6f8ff'].map(rgb);
const ROCK = ['#141a28', '#222a3e', '#323e58', '#465676', '#5e7096'].map(rgb);
const WOOD = ['#2e1a0e', '#4e2e18', '#704424', '#9a6634', '#c48a4a'].map(rgb);
const PINE = ['#0c1e24', '#163238', '#22484a', '#306058'].map(rgb);

const wrap = (x: number, w: number) => ((Math.round(x) % w) + w) % w;
function loopNoise(x: number, w: number, scale: number, seed: number) {
  const a = vnoise(x / scale, 0.5, seed), b = vnoise((x - w) / scale, 0.5, seed);
  return a * (1 - x / w) + b * (x / w);
}
function gradient(stops: [number, string][], t: number, x: number, y: number) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    if (t >= p0 && t <= p1) {
      const q = ((t - p0) / (p1 - p0)) * 4;
      const k = (Math.floor(q) + (q - Math.floor(q) > dither(x, y) ? 1 : 0)) / 4;
      return mix(rgb(c0), rgb(c1), Math.min(1, k));
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

// ---------------------------------------------------------------- backdrops

function skyCanvas(): HTMLCanvasElement {
  const W = 512, H = 216;
  const p = new Pix(W, H);
  const stops: [number, string][] = [[0, '#060a22'], [0.3, '#141e4e'], [0.55, '#2c3a7a'], [0.75, '#5a5496'], [0.9, '#a07aac'], [1, '#e0a8b8']];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, gradient(stops, y / H, x, y));
  // stars
  for (let y = 0; y < H * 0.6; y++) for (let x = 0; x < W; x++) {
    const h = hash(x, y, 77);
    if (h < 0.0035) p.set(x, y, h < 0.001 ? rgb('#ffffff') : rgb('#a8b8e8'));
  }
  // the northern lights: hanging curtains that ripple along the sky
  const TAU = Math.PI * 2;
  for (const band of [{ y: 58, len: 46, a: 1, ph: 0 }, { y: 86, len: 34, a: 0.7, ph: 2.1 }]) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * TAU;
      const base = band.y + Math.sin(u * 2 + band.ph) * 16 + Math.sin(u * 5 + 1 + band.ph) * 6;
      const str = (0.45 + 0.55 * Math.max(0, Math.sin(u * 3 + 2 + band.ph))) * band.a * (0.55 + 0.45 * loopNoise(x, W, 6, 9));
      for (let y = Math.floor(base - band.len); y <= base; y++) {
        const k = (y - (base - band.len)) / band.len;
        const a = k * k * str;
        if (a * 0.85 <= dither(x, y)) continue;
        const col = k > 0.85 ? '#a0ffd0' : k > 0.5 ? '#40e8a0' : '#3aa8b8';
        p.set(x, y, mix(p.get(x, y), rgb(col), Math.min(0.85, 0.35 + a)));
      }
    }
  }
  // a big pale moon
  const mx = 120, my = 40;
  for (let y = my - 30; y < my + 30; y++) for (let x = mx - 30; x < mx + 30; x++) {
    const d = Math.hypot(x - mx, y - my);
    if (d < 13) p.set(x, y, vnoise(x / 4, y / 4, 5) > 0.62 ? rgb('#c8d0ec') : rgb('#f2f4ff'));
    else if (d < 30 && (30 - d) / 17 * 0.4 > dither(x, y)) p.set(x, y, mix(p.get(x, y), rgb('#c8d4ff'), 0.25));
  }
  return p.toCanvas();
}

function peaksCanvas(): HTMLCanvasElement {
  const W = 512, H = 130;
  const p = new Pix(W, H);
  const ridges = [
    { n: 7, top: 8, var: 30, slope: [0.9, 1.5], rock: '#4a5a96', shade: '#3a4680', snow: '#c8d4f4', lit: '#eef2ff', sh: '#98a6d8', seed: 41 },
    { n: 6, top: 40, var: 22, slope: [0.7, 1.2], rock: '#2e3a6a', shade: '#242e58', snow: '#a8b8e4', lit: '#d4def6', sh: '#7a8cc4', seed: 42 },
  ];
  for (const r of ridges) {
    const rng = new RNG(r.seed);
    const tops = new Float32Array(W).fill(H);
    const peakOf = new Int32Array(W).fill(-1);
    const peaks: { c: number; h: number }[] = [];
    for (let i = 0; i < r.n; i++) {
      const c = (i + rng.range(-0.3, 0.3)) * (W / r.n), h = r.top + rng.range(0, r.var);
      const sl = rng.range(r.slope[0], r.slope[1]), sr = rng.range(r.slope[0], r.slope[1]);
      peaks.push({ c, h });
      for (let dx = -200; dx <= 200; dx++) {
        const x = wrap(c + dx, W);
        // jagged: a little noise on the flanks
        const y = h + Math.abs(dx) * (dx < 0 ? sl : sr) + (hash(x, 0, r.seed) - 0.5) * 2 + vnoise(x / 5, 0, r.seed) * 5;
        if (y < tops[x]) { tops[x] = y; peakOf[x] = i; }
      }
    }
    for (let x = 0; x < W; x++) {
      const pk = peaks[peakOf[x]];
      const dx = ((x - pk.c + W * 1.5) % W) - W / 2;
      const snowLine = pk.h + 26 + vnoise(x / 4, 0, r.seed + 3) * 14;
      for (let y = Math.floor(tops[x]); y < H; y++) {
        const lit = dx < 0;
        let c: string;
        if (y < snowLine) c = y === Math.floor(tops[x]) ? r.lit : lit ? (vnoise(x / 3, y / 3, 4) > 0.3 ? r.lit : r.snow) : r.sh;
        else c = lit ? r.rock : r.shade;
        // snow gullies streak down the rock
        if (y >= snowLine && y < snowLine + 30 && vnoise(x / 2, y / 14, r.seed + 7) > 0.68) c = lit ? r.snow : r.sh;
        p.set(x, y, rgb(c));
      }
    }
  }
  return p.toCanvas();
}

/** A fir silhouette into a Pix (used for the backdrops and the prop). */
function firShape(p: Pix, cx: number, base: number, h: number, cols: number[], snowCol: number, seed: number) {
  const tiers = Math.max(3, Math.round(h / 12));
  const trunkH = Math.max(2, Math.round(h * 0.1));
  p.rect(cx - 1, base - trunkH, 3, trunkH, cols[0]);
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers;
    const top = base - trunkH - h + (h * k) * 0.92;
    const bot = top + h / tiers * 1.6;
    const hw = (1 - k * 0.8) * h * 0.32 + 2;
    for (let y = Math.floor(top); y <= bot; y++) {
      const f = (y - top) / (bot - top);
      const w = Math.max(0.5, f * hw);
      for (let x = Math.floor(cx - w); x <= cx + w; x++) {
        const edge = y >= bot - 1 - (hash(x, t, seed) < 0.5 ? 1 : 0);
        const side = x < cx ? 1 : 0;
        p.set(x, y, edge ? cols[0] : cols[1 + side]);
      }
      // snow sitting on each tier's upper slope
      const sw = Math.max(0, w * 0.7);
      if (f < 0.75) for (let x = Math.floor(cx - sw); x <= cx + sw * 0.6; x++) if (vnoise(x / 2, y / 2, seed) > 0.45 - f * 0.3) p.set(x, y, snowCol);
    }
  }
}

function firsCanvas(): HTMLCanvasElement {
  const W = 512, H = 130;
  const p = new Pix(W, H);
  const hill = (x: number) => 52 + loopNoise(x, W, 70, 21) * 30;
  const rng = new RNG(23);
  for (let i = 0; i < 46; i++) {
    const x = rng.range(0, W), h = rng.range(16, 34);
    const b = hill(x) + 4;
    const q = new Pix(60, 50);
    firShape(q, 30, 48, h, [rgb('#1c2c50'), rgb('#2a3c66'), rgb('#34487a')], rgb('#8ea0d0'), i);
    for (let y = 0; y < 50; y++) for (let xx = 0; xx < 60; xx++) {
      const c = q.get(xx, y);
      if (c) p.set(wrap(x + xx - 30, W), Math.round(b - 48 + y), c);
    }
  }
  for (let x = 0; x < W; x++) for (let y = Math.floor(hill(x)); y < H; y++) {
    p.set(x, y, y < hill(x) + 2 ? rgb('#a8b8e4') : vnoise(x / 8, y / 4, 3) > 0.6 ? rgb('#7a8cc4') : rgb('#8698cc'));
  }
  return p.toCanvas();
}

function nearCanvas(): HTMLCanvasElement {
  const W = 512, H = 150;
  const p = new Pix(W, H);
  const hill = (x: number) => 84 + loopNoise(x, W, 90, 31) * 40;
  const rng = new RNG(33);
  for (let i = 0; i < 22; i++) {
    const x = rng.range(0, W), h = rng.range(40, 70);
    const b = hill(x) + 6;
    const q = new Pix(80, 90);
    firShape(q, 40, 88, h, [rgb('#0e1830'), rgb('#18264a'), rgb('#22345e')], rgb('#6a7cb4'), i + 50);
    for (let y = 0; y < 90; y++) for (let xx = 0; xx < 80; xx++) {
      const c = q.get(xx, y);
      if (c) p.set(wrap(x + xx - 40, W), Math.round(b - 88 + y), c);
    }
  }
  for (let x = 0; x < W; x++) for (let y = Math.floor(hill(x)); y < H; y++) {
    p.set(x, y, y < hill(x) + 2 ? rgb('#8496cc') : vnoise(x / 9, y / 5, 8) > 0.62 ? rgb('#56689e') : rgb('#62749e'));
  }
  return p.toCanvas();
}

// ---------------------------------------------------------------- ground

/** Paint the Snowland terrain (a smooth snow surface plus its own tiles) into one chunk. */
export function paintSnowChunk(n: number, cx: number, cy: number, surf: (x: number) => number, icy: (x: number) => boolean,
  tile: (tx: number, ty: number) => number): Pix | null {
  const size = n * TS, x0 = cx * size, y0 = cy * size;
  const p = new Pix(size, size);
  let any = false;
  for (let x = 0; x < size; x++) {
    const wx = x0 + x;
    const s = surf(wx);
    if (!isFinite(s) || s >= y0 + size) continue;
    const sl = (surf(wx + 3) - surf(wx - 3)) / 6;
    const ice = icy(wx);
    const crust = 11 + vnoise(wx / 7, 0, 5) * 6;
    for (let y = Math.max(0, Math.ceil(s) - y0); y < size; y++) {
      const wy = y0 + y, d = wy - s;
      any = true;
      let c: number;
      if (ice && d < 6) {
        c = d < 1 ? ICE[4] : (wx + wy * 2) % 19 < 2 ? ICE[4] : vnoise(wx / 6, wy / 3, 2) > 0.55 ? ICE[3] : ICE[2];
        if (d > 4) c = ICE[1];
      } else if (d < crust) {
        if (d < 1.5) c = SNOW[4];
        else {
          const lit = sl < -0.12 ? 1 : sl > 0.12 ? -1 : 0;
          const k = 3 + lit * (d < 5 ? 1 : 0) - (d > crust - 4 ? 1 : 0) - (vnoise(wx / 5, wy / 4, 7) > 0.68 ? 1 : 0);
          c = SNOW[Math.max(1, Math.min(4, k))];
          if (hash(wx, wy, 13) < 0.012) c = SNOW[4];
        }
      } else if (d < crust + 3 && vnoise(wx / 3, wy / 2, 9) > 0.45) c = SNOW[1];
      else {
        const n2 = vnoise(wx / 6, wy / 6, 3) * 0.7 + hash(wx, wy, 4) * 0.3;
        c = ROCK[n2 < 0.3 ? 1 : n2 < 0.62 ? 2 : n2 < 0.86 ? 3 : 4];
        if (vnoise(wx / 4, wy / 4, 11) > 0.82) c = SNOW[1];
        c = mix(c, ROCK[0], Math.min(0.75, (d - crust) / 140));
      }
      p.set(x, y, c);
    }
  }
  // tiles (only the parts that stick out above the snow)
  for (let ty = cy * n; ty < cy * n + n; ty++) for (let tx = cx * n; tx < cx * n + n; tx++) {
    const t = tile(tx, ty);
    if (t === ST.E || t === ST.FILL) continue;
    any = true;
    const ox = (tx - cx * n) * TS, oy = (ty - cy * n) * TS;
    const solidish = (k: number) => k === ST.ROCK || k === ST.ICE || k === ST.FILL;
    const openUp = !solidish(tile(tx, ty - 1));
    const openL = !solidish(tile(tx - 1, ty)), openR = !solidish(tile(tx + 1, ty));
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const wx = tx * TS + x, wy = ty * TS + y;
      if (wy >= surf(wx) + 2) continue;
      let c = 0;
      if (t === ST.ROCK) {
        const n2 = vnoise(wx / 5, wy / 5, 3) * 0.7 + hash(wx, wy, 9) * 0.3;
        c = ROCK[n2 < 0.3 ? 2 : n2 < 0.65 ? 3 : 4];
        if ((openL && x < 2) || (openUp && y < 2)) c = ROCK[4];
        if (openR && x > 13) c = ROCK[1];
        const cap = 3 + Math.floor(vnoise(wx / 3, 0, 6) * 4);
        if (openUp && y < cap) c = y === 0 ? SNOW[4] : SNOW[3];
        else if (openUp && y === cap && hash(wx, 0, 8) < 0.4) c = SNOW[2];
      } else if (t === ST.ICE) {
        c = ICE[2];
        if ((x + y * 2 + tx * 5) % 13 < 2) c = ICE[3];
        if (vnoise(wx / 4, wy / 4, 12) > 0.72) c = ICE[1];
        if (openL && x < 1) c = ICE[4];
        if (openR && x > 14) c = ICE[0];
        if (y === 15 && !solidish(tile(tx, ty + 1))) c = ICE[0];
        if (openUp && y < 2) c = y === 0 ? SNOW[4] : ICE[4];
      } else if (t === ST.FLOE) {
        if (y < 6) c = y === 0 ? SNOW[4] : y < 2 ? ICE[4] : (wx * 2 + y) % 11 < 2 ? ICE[4] : ICE[2 + (vnoise(wx / 5, y, 2) > 0.5 ? 1 : 0)];
        if (y === 5) c = ICE[1];
        // icicles
        const len = Math.floor(hash(wx >> 1, ty, 31) * 9);
        if (y >= 6 && y < 6 + len && (wx & 1) === 0) c = y > 4 + len ? ICE[4] : ICE[3];
      } else if (t === ST.LOG) {
        if (y < 3) c = y === 0 ? SNOW[4] : SNOW[3];
        else if (y < 9) c = WOOD[y === 3 ? 4 : y > 7 ? 1 : (wx % 16 === 0 ? 1 : 3)];
      }
      if (c) p.set(ox + x, oy + y, c);
    }
  }
  if (!any) return null;
  p.outline(OUTLINE);
  return p;
}

// ---------------------------------------------------------------- props

function pineFrame(h: number, seed: number): Frame {
  const W = Math.round(h * 0.8) + 8, H = h + 6;
  const p = new Pix(W, H);
  firShape(p, W / 2, H - 1, h, PINE, SNOW[4], seed);
  // second pass: snow shadows
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.get(x, y) === SNOW[4] && p.get(x, y + 1) !== SNOW[4] && hash(x, y, seed) < 0.5) p.set(x, y + 1, SNOW[2]);
  p.outline(OUTLINE);
  return frame(p, Math.floor(W / 2), H - 1);
}

function rockFrame(): Frame {
  const p = new Pix(32, 20);
  p.volume(p.shape(ramp('#222a3e', '#323e58', '#5e7096'), (c, id) => p.ellipse(16, 13, 14, 7, c, id)), ROCK.slice(1));
  const id = p.newPart();
  p.ellipse(15, 8, 12, 4, SNOW[3], id);
  p.rect(5, 8, 22, 2, SNOW[3], id);
  p.volume(id, SNOW.slice(2));
  p.outline(OUTLINE);
  return frame(p, 16, 19);
}

function caneFrame(): Frame {
  const p = new Pix(16, 44);
  const red = rgb('#d82030'), white = rgb('#fff4f4');
  const col = (x: number, y: number) => ((x + y) >> 2) % 2 === 0 ? red : white;
  for (let y = 10; y < 44; y++) for (let x = 7; x < 11; x++) p.set(x, y, col(x, y));
  for (let a = 0; a <= Math.PI; a += 0.04) for (let r = 4; r < 8; r++) {
    const x = 8 - Math.cos(a) * r * 0.85 + 1, y = 10 - Math.sin(a) * r * 0.9;
    p.set(x - 4, y, col(Math.round(x), Math.round(y)));
  }
  for (let y = 10; y < 44; y++) p.set(10, y, mix(p.get(10, y), OUTLINE, 0.3));
  p.outline(OUTLINE);
  return frame(p, 9, 43);
}

function poleFrame(): Frame {
  const p = new Pix(16, 70);
  const red = rgb('#d82030'), white = rgb('#fff4f4');
  for (let y = 12; y < 70; y++) for (let x = 5; x < 11; x++) p.set(x, y, ((x * 2 + y) >> 3) % 2 === 0 ? red : white);
  for (let y = 12; y < 70; y++) { p.set(5, y, mix(p.get(5, y), rgb('#ffffff'), 0.4)); p.set(10, y, mix(p.get(10, y), OUTLINE, 0.35)); }
  p.volume(p.shape(ramp('#a07010', '#f0c030', '#fff4a0'), (c, id) => p.circle(8, 7, 6, c, id)), ['#7a5008', '#c89020', '#f0c030', '#fff0a0', '#ffffff'].map(rgb));
  p.outline(OUTLINE);
  return frame(p, 8, 69);
}

function lampFrame(): Frame {
  const p = new Pix(14, 52);
  p.rect(6, 10, 2, 42, rgb('#2a2e3a'));
  p.rect(5, 48, 4, 4, rgb('#3a3e4a'));
  p.rect(3, 2, 8, 9, rgb('#3a3e4a'));
  p.rect(4, 3, 6, 7, rgb('#ffd870'));
  p.rect(5, 4, 3, 4, rgb('#fff8d0'));
  p.rect(2, 0, 10, 2, SNOW[4]);
  p.outline(OUTLINE);
  return frame(p, 7, 51);
}

function presentFrame(box: string, rib: string, w = 12, h = 12): Pix {
  const p = new Pix(w + 4, h + 5);
  const b = rgb(box), r = rgb(rib);
  const id = p.newPart();
  p.rect(2, 5, w, h, b, id);
  p.shade(id, [mix(b, OUTLINE, 0.4), b, mix(b, rgb('#ffffff'), 0.35)]);
  p.rect(2, 4, w, 2, mix(b, rgb('#ffffff'), 0.2));
  const mx = 2 + Math.floor(w / 2) - 1;
  p.rect(mx, 4, 2, h + 1, r);
  p.rect(2, 4 + Math.floor(h / 2), w, 2, r);
  // bow
  p.circle(mx - 2, 2, 2, r); p.circle(mx + 3, 2, 2, r);
  p.set(mx - 2, 2, mix(r, OUTLINE, 0.4)); p.set(mx + 3, 2, mix(r, OUTLINE, 0.4));
  p.outline(OUTLINE);
  return p;
}

function pileFrame(): Frame {
  const p = new Pix(56, 30);
  const boxes: [string, string, number, number, number, number][] = [
    ['#2a9a48', '#f0c030', 0, 12, 14, 14], ['#d02838', '#fff0f0', 14, 8, 16, 18], ['#3a6ad0', '#ffffff', 30, 14, 12, 12],
    ['#e0b020', '#d02838', 40, 10, 12, 16], ['#a040c0', '#f0c030', 8, 0, 10, 10], ['#e06a20', '#2a9a48', 24, 0, 12, 10],
  ];
  for (const [b, r, x, y, w, h] of boxes) p.blit(presentFrame(b, r, w, h), x, y);
  return frame(p, 28, 29);
}

function workshopFrame(): Frame {
  const W = 180, H = 128;
  const p = new Pix(W, H);
  // log walls
  const wall = p.newPart();
  p.rect(18, 52, 144, 76, WOOD[2], wall);
  for (let y = 52; y < 128; y++) for (let x = 18; x < 162; x++) {
    const ly = (y - 52) % 8;
    p.set(x, y, ly === 0 ? WOOD[1] : ly === 1 ? WOOD[3] : vnoise(x / 9, y, 4) > 0.6 ? WOOD[3] : WOOD[2]);
  }
  for (let y = 52; y < 128; y += 8) { p.circle(18, y + 4, 3, WOOD[3]); p.circle(161, y + 4, 3, WOOD[1]); }
  // roof with a thick blanket of snow
  p.poly([[6, 56], [90, 6], [174, 56]], WOOD[1]);
  for (let x = 2; x < 178; x++) {
    const top = 56 - (90 - Math.abs(x - 90)) * (50 / 84) - 3;
    const th = 7 + vnoise(x / 6, 0, 3) * 4;
    for (let y = Math.floor(top); y < top + th; y++) p.set(x, y, y < top + 1.5 ? SNOW[4] : y > top + th - 2 ? SNOW[2] : SNOW[3]);
    // drips over the eaves
    if (Math.abs(x - 90) > 80) for (let y = 56; y < 60 + hash(x, 0, 4) * 6; y++) p.set(x, y, SNOW[3]);
  }
  // chimney
  p.rect(124, 14, 16, 26, rgb('#7a3a2a'));
  for (let y = 14; y < 40; y += 4) for (let x = 124; x < 140; x++) if ((x + (y % 8 === 0 ? 0 : 4)) % 8 === 0 || y % 4 === 0) p.set(x, y, rgb('#5a2a1e'));
  p.rect(122, 10, 20, 5, SNOW[4]);
  // glowing windows
  for (const wx of [34, 120]) {
    p.rect(wx - 2, 70, 30, 26, WOOD[0]);
    for (let y = 72; y < 94; y++) for (let x = wx; x < wx + 26; x++) p.set(x, y, gradient([[0, '#fff2b0'], [1, '#f09830']], (y - 72) / 22, x, y));
    p.rect(wx + 12, 72, 2, 22, WOOD[0]); p.rect(wx, 82, 26, 2, WOOD[0]);
    p.rect(wx - 3, 96, 32, 4, SNOW[3]);
  }
  // door with a wreath
  p.rect(76, 82, 28, 46, WOOD[0]);
  p.rect(78, 84, 24, 44, rgb('#8a2a22'));
  for (let y = 86; y < 128; y += 10) p.rect(79, y, 22, 1, rgb('#6a1e18'));
  p.set(98, 106, rgb('#f0c030')); p.set(98, 107, rgb('#f0c030'));
  for (let a = 0; a < Math.PI * 2; a += 0.06) for (let r = 5; r < 9; r++) p.set(90 + Math.cos(a) * r, 64 + Math.sin(a) * r, hash(Math.round(a * 20), r, 3) < 0.15 ? rgb('#e02030') : (r & 1 ? rgb('#1e6a30') : rgb('#2a8a3a')));
  p.rect(88, 71, 4, 4, rgb('#e02030'));
  // string lights along the eaves
  const bulbs = ['#ff4040', '#40ff70', '#ffd040', '#40a0ff'].map(rgb);
  for (let x = 12, i = 0; x < 170; x += 8, i++) {
    const y = 58 + Math.round(Math.sin((x - 12) / 158 * Math.PI) * 5);
    p.set(x, y - 1, OUTLINE); p.rect(x, y, 2, 3, bulbs[i % 4]);
  }
  p.outline(OUTLINE);
  return frame(p, W / 2, H - 1);
}

// ---------------------------------------------------------------- enemies

function snowmanFrame(pose: number): Frame {
  const W = 34, H = 46;
  const p = new Pix(W, H);
  const balls: [number, number, number][] = [[16, 36, 9], [16, 23, 7], [16, 12, 5.5]];
  for (const [x, y, r] of balls) p.volume(p.shape(ramp('#8a9ccc', '#dce6fa', '#ffffff'), (c, id) => p.circle(x, y, r, c, id)), SNOW.slice(1));
  // coal buttons, angry eyes, a carrot nose and a crooked top hat
  for (const y of [19, 24, 29]) p.rect(16, y, 2, 2, rgb('#1a1a22'));
  p.rect(16, 10, 2, 2, rgb('#1a1a22')); p.rect(19, 10, 2, 2, rgb('#1a1a22'));
  p.line(15, 8, 18, 9, rgb('#1a1a22')); p.line(19, 9, 22, 7, rgb('#1a1a22'));
  p.line(21, 12, 27, 13, rgb('#f07818'), 2);
  p.set(27, 13, rgb('#ffb060'));
  p.line(17, 15, 21, 14, rgb('#1a1a22'));
  p.rect(10, 6, 13, 2, rgb('#1e1e28'));
  p.rect(12, 0, 9, 6, rgb('#2a2a36'));
  p.rect(12, 4, 9, 1, rgb('#c02030'));
  // a red scarf
  p.rect(10, 17, 13, 3, rgb('#c02030'));
  p.rect(10, 18, 3, 7, rgb('#a01828'));
  // stick arms: 0 idle, 1 wind up (snowball held behind), 2 throw
  const stick = rgb('#5a3a20');
  p.line(9, 22, 2, 18, stick, 1); p.line(4, 19, 2, 16, stick, 1);
  if (pose === 0) { p.line(23, 22, 31, 19, stick, 1); p.line(29, 20, 31, 17, stick, 1); }
  if (pose === 1) { p.line(22, 21, 24, 13, stick, 1); p.line(10, 21, 4, 10, stick, 1); p.volume(p.shape(ramp('#8a9ccc', '#dce6fa', '#ffffff'), (c, id) => p.circle(4, 8, 3, c, id)), SNOW.slice(2)); }
  if (pose === 2) { p.line(23, 22, 32, 24, stick, 1); p.line(30, 24, 32, 27, stick, 1); }
  p.outline(OUTLINE);
  return frame(p, 16, 45);
}

function snowballFrames(): Frame[] {
  return [0, 1].map((k) => {
    const p = new Pix(8, 8);
    p.volume(p.shape(ramp('#8a9ccc', '#dce6fa', '#ffffff'), (c, id) => p.circle(3.5, 3.5, 3, c, id)), SNOW.slice(1));
    if (k) p.set(2, 4, SNOW[1]); else p.set(4, 2, SNOW[1]);
    p.outline(OUTLINE);
    return frame(p, 4, 4);
  });
}

function bigballFrame(): Frame {
  const p = new Pix(32, 32);
  const id = p.newPart();
  p.circle(15.5, 15.5, 13, SNOW[3], id);
  // lumpy edge
  for (let a = 0; a < Math.PI * 2; a += 0.5) p.circle(15.5 + Math.cos(a) * 12, 15.5 + Math.sin(a) * 12, 2 + hash(Math.round(a * 10), 0, 5) * 2, SNOW[3], id);
  p.volume(id, SNOW, { pattern: (x, y) => (vnoise(x / 3, y / 3, 6) > 0.66 ? -1 : 0) });
  // stuff it picked up rolling downhill: twigs, a rock, a boot
  p.line(6, 10, 11, 13, rgb('#5a3a20'));
  p.rect(20, 20, 4, 3, ROCK[3]);
  p.rect(9, 21, 3, 3, rgb('#3a2a20'));
  p.outline(OUTLINE);
  return frame(p, 16, 16);
}

function puffFrames(): Frame[] {
  return [0, 1, 2, 3, 4].map((k) => {
    const p = new Pix(28, 28);
    const rng = new RNG(5 + k);
    const r = 4 + k * 2.5;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + k * 0.3;
      const cr = (k < 3 ? 4 : 3) - (k > 3 ? 1 : 0);
      if (k === 4 && rng.next() < 0.4) continue;
      p.circle(14 + Math.cos(a) * r * 0.8, 14 + Math.sin(a) * r * 0.6, cr + rng.range(0, 2), k < 2 ? SNOW[4] : k < 4 ? SNOW[3] : SNOW[2]);
    }
    if (k < 2) p.circle(14, 14, 4 - k, SNOW[4]);
    return frame(p, 14, 14);
  });
}

function waveFrames(): Frame[] {
  return [0, 1, 2].map((k) => {
    const p = new Pix(24, 24);
    const rng = new RNG(40 + k);
    for (let i = 0; i < 16; i++) {
      const x = 2 + rng.range(0, 20), h = 6 + (1 - Math.abs(x - 12) / 12) * 14 + rng.range(-3, 3);
      p.circle(x, 23 - rng.range(0, h), rng.range(1.5, 3.5), rng.next() < 0.5 ? SNOW[4] : SNOW[3]);
    }
    p.rect(1, 21, 22, 3, SNOW[2]);
    p.outline(withAlpha(OUTLINE, 1));
    return frame(p, 12, 23);
  });
}

function shardFrame(): Frame {
  const p = new Pix(4, 4);
  p.rect(0, 1, 3, 2, ICE[3]); p.set(1, 0, ICE[4]); p.set(2, 3, ICE[1]);
  return frame(p, 2, 2);
}

const skierLook: Look = {
  skin: ramp('#8a5a3a', '#c08860', '#e0b088'),
  hair: ramp('#1a1a1a', '#2a2a2a', '#3a3a3a'),
  head: 'mask',
  headColor: ramp('#8a96b8', '#d4dcf0', '#ffffff'),
  accent: ramp('#a04808', '#f08a20', '#ffd080'),
  torso: ramp('#8a96b8', '#d4dcf0', '#ffffff'),
  vest: ramp('#3a4660', '#5a6a8a', '#8496b8'),
  pants: ramp('#7a86a8', '#b8c4e0', '#e8eeff'),
  boots: ramp('#1a1a22', '#2e2e3a', '#4a4a58'),
  gun: ramp('#22232c', '#4a4c5a', '#8a8ea0'),
  bulk: 0,
};

function skierFrame(pose: Pose, skiDy = 0): Frame {
  const h = drawHumanoid(skierLook, pose);
  const p = new Pix(52, 46);
  p.blit(h, 4, 0);
  // skis: long red planks with an upturned tip
  const y = AY + 1 + skiDy;
  const ski = rgb('#c82028'), hi = rgb('#ff6a5a');
  for (let x = 6; x < 46; x++) { p.set(x, y, ski); p.set(x, y + 1, mix(ski, OUTLINE, 0.45)); if (x % 5 === 0) p.set(x, y, hi); }
  p.set(46, y - 1, ski); p.set(47, y - 2, ski); p.set(47, y - 3, hi);
  p.outline(OUTLINE);
  return frame(p, AX + 4, AY + 1 + skiDy);
}

// ---------------------------------------------------------------- Santa

const SUIT = ['#4a0610', '#7a0a14', '#b01a24', '#d8302c', '#ff6a58'].map(rgb);
const FUR = ['#7a88b0', '#b8c4e0', '#e4eaf8', '#ffffff'].map(rgb);
const SKIN = ['#8a4836', '#c87a60', '#f0a888', '#ffd0b8'].map(rgb);
const BOOT = ['#0e0a10', '#1e1820', '#34303a', '#4e4856'].map(rgb);

interface SantaPose { bob?: number; legs?: [number, number, number, number]; crouch?: number; laugh?: boolean; down?: boolean }

function drawSanta(o: SantaPose): Frame {
  const W = 72, H = 88;
  const p = new Pix(W, H);
  const fy = H - 1;
  const cr = o.crouch ?? 0;
  const bob = (o.bob ?? 0) + cr;
  const [bdx, blift, fdx, flift] = o.legs ?? [0, 0, 0, 0];
  if (o.down) {
    // sat down hard in the snow, legs out front, seeing stars
    const hipY = fy - 10;
    for (const [x, d] of [[30, 0], [40, 1]] as [number, number][]) {
      const id = p.newPart();
      p.line(x, hipY, x + 16, hipY + 2 - d, SUIT[2], 9, id);
      p.volume(id, SUIT.slice(1));
      p.volume(p.shape(ramp('#0e0a10', '#1e1820', '#4e4856'), (c, k) => p.ellipse(x + 20, hipY - 1 - d, 5, 7, c, k)), BOOT);
    }
    const body = p.newPart();
    p.ellipse(30, fy - 26, 21, 19, SUIT[3], body);
    p.volume(body, SUIT);
    p.rect(10, fy - 22, 41, 5, BOOT[1]);
    p.rect(30, fy - 23, 8, 7, rgb('#f0c030'));
    p.rect(32, fy - 21, 4, 3, BOOT[1]);
    const beard = p.newPart();
    p.ellipse(30, fy - 42, 11, 10, FUR[3], beard);
    p.volume(beard, FUR);
    p.volume(p.shape(ramp('#8a4836', '#f0a888', '#ffd0b8'), (c, k) => p.ellipse(30, fy - 52, 8, 6, c, k)), SKIN);
    p.circle(35, fy - 50, 2, rgb('#e86a6a'));
    // dizzy x eyes
    for (const ex of [27, 33]) { p.set(ex - 1, fy - 55, OUTLINE); p.set(ex + 1, fy - 53, OUTLINE); p.set(ex, fy - 54, OUTLINE); p.set(ex + 1, fy - 55, OUTLINE); p.set(ex - 1, fy - 53, OUTLINE); }
    const hat = p.newPart();
    p.poly([[22, fy - 56], [38, fy - 56], [14, fy - 64]], SUIT[3], hat);
    p.volume(hat, SUIT.slice(1));
    p.rect(20, fy - 58, 20, 4, FUR[3]);
    p.circle(13, fy - 64, 3, FUR[3]);
    p.outline(OUTLINE);
    return frame(p, 34, fy);
  }
  const hipY = fy - 20 + bob;
  // legs: red trousers tucked into big black boots
  const leg = (x: number, dx: number, lift: number, back: boolean) => {
    const ky = hipY + 9 - lift * 0.5, fx = x + dx, ffy = fy - lift;
    const id = p.newPart();
    p.line(x, hipY, x + dx * 0.5, ky, back ? SUIT[1] : SUIT[2], 9, id);
    p.volume(id, back ? SUIT.slice(0, 4) : SUIT.slice(1));
    const b = p.newPart();
    p.rect(fx - 5, ky, 10, ffy - ky - 3, BOOT[1], b);
    p.ellipse(fx + 2, ffy - 3, 7, 3.5, BOOT[1], b);
    p.volume(b, back ? BOOT.slice(0, 3) : BOOT);
    p.rect(fx - 6, ky - 1, 12, 3, back ? FUR[1] : FUR[2]);
  };
  leg(28, bdx, blift, true);
  leg(42, fdx, flift, false);
  // the free arm: a fist planted on the hip
  const arm = p.newPart();
  p.line(22, hipY - 34, 14, hipY - 20, SUIT[1], 8, arm);
  p.line(14, hipY - 20, 22, hipY - 12, SUIT[1], 7, arm);
  p.volume(arm, SUIT.slice(0, 4));
  // the belly
  const body = p.newPart();
  p.ellipse(36, hipY - 22, 22, 21, SUIT[3], body);
  p.ellipse(34, hipY - 38, 15, 10, SUIT[3], body);
  p.volume(body, SUIT);
  // fur hem and the fur strip down the front
  const hem = p.newPart();
  for (let x = 16; x <= 56; x++) {
    const yb = hipY - 4 + Math.round(Math.sqrt(Math.max(0, 1 - ((x - 36) / 21) ** 2)) * 4);
    for (let y = yb - 4; y <= yb; y++) p.set(x, y, FUR[2], hem);
  }
  for (let y = hipY - 34; y < hipY - 4; y++) { const x = 50 + Math.round((y - (hipY - 20)) ** 2 / 120); p.rect(x - 3, y, 5, 1, FUR[2], hem); }
  p.volume(hem, FUR);
  // belt and buckle
  p.rect(14, hipY - 21, 44, 6, BOOT[1]);
  p.rect(14, hipY - 21, 44, 1, BOOT[3]);
  p.rect(42, hipY - 23, 10, 10, rgb('#f0c030'));
  p.rect(44, hipY - 21, 6, 6, BOOT[1]);
  p.set(42, hipY - 23, rgb('#fff4a0'));
  // mitten on the hip
  p.volume(p.shape(ramp('#0e0a10', '#1e1820', '#4e4856'), (c, k) => p.circle(21, hipY - 13, 4, c, k)), BOOT);
  // head
  const hx = o.laugh ? 40 : 42, hy = hipY - 52 + (o.laugh ? -2 : 0);
  p.volume(p.shape(ramp('#8a4836', '#f0a888', '#ffd0b8'), (c, k) => p.ellipse(hx, hy, 9, 9, c, k)), SKIN);
  // a big white beard spilling over the chest
  const beard = p.newPart();
  p.ellipse(hx - 1, hy + 13, 12, 11, FUR[3], beard);
  p.ellipse(hx + 1, hy + 20, 8, 7, FUR[3], beard);
  p.ellipse(hx - 7, hy + 5, 4, 6, FUR[3], beard);
  p.volume(beard, FUR, { pattern: (x, y) => ((x + y * 3) % 7 === 0 ? -1 : 0) });
  // mustache, nose, cheek, angry brow
  const stache = p.newPart();
  p.ellipse(hx + 3, hy + 6, 7, 2.5, FUR[3], stache);
  p.volume(stache, FUR.slice(1));
  p.volume(p.shape(ramp('#a03030', '#e86a6a', '#ffb0a0'), (c, k) => p.circle(hx + 7, hy + 3, 2.5, c, k)), ['#8a2a2a', '#c84848', '#e86a6a', '#ffb0a0'].map(rgb));
  p.rect(hx, hy + 2, 2, 2, rgb('#ff8a8a'));
  if (o.laugh) {
    p.ellipse(hx + 3, hy + 11, 4, 3, rgb('#4a0a14'));
    p.rect(hx + 1, hy + 9, 5, 1, rgb('#ffffff'));
    p.line(hx + 1, hy - 1, hx + 3, hy - 2, OUTLINE); p.line(hx + 3, hy - 2, hx + 5, hy - 1, OUTLINE);
    p.line(hx + 1, hy - 4, hx + 5, hy - 4, FUR[3]);
  } else {
    p.rect(hx + 3, hy - 1, 2, 2, OUTLINE);
    p.set(hx + 3, hy - 1, rgb('#ffffff'));
    p.line(hx, hy - 5, hx + 6, hy - 2, FUR[3], 2);
    p.line(hx + 1, hy - 3, hx + 6, hy - 2, OUTLINE);
  }
  // the hat flops back
  const hat = p.newPart();
  p.poly([[hx - 10, hy - 8], [hx + 9, hy - 9], [hx + 2, hy - 18], [hx - 14, hy - 20], [hx - 24, hy - 11]], SUIT[3], hat);
  p.volume(hat, SUIT.slice(1));
  const brim = p.newPart();
  p.rect(hx - 11, hy - 11, 22, 5, FUR[3], brim);
  p.ellipse(hx - 11, hy - 9, 2, 2.5, FUR[3], brim);
  p.volume(brim, FUR);
  p.volume(p.shape(ramp('#7a88b0', '#ffffff', '#ffffff'), (c, k) => p.circle(hx - 25, hy - 9, 4, c, k)), FUR);
  p.outline(OUTLINE);
  return frame(p, 36, fy);
}

function armFrame(): Frame {
  const p = new Pix(28, 14);
  const id = p.newPart();
  p.line(3, 7, 17, 7, SUIT[3], 9, id);
  p.volume(id, SUIT.slice(1));
  p.rect(16, 2, 4, 10, FUR[3]);
  p.rect(16, 2, 1, 10, FUR[1]);
  p.volume(p.shape(ramp('#0e0a10', '#1e1820', '#4e4856'), (c, k) => p.circle(23, 7, 4.5, c, k)), BOOT);
  p.outline(OUTLINE);
  return frame(p, 3, 7);
}

/**
 * The sack: a big, saggy, flesh-coloured pouch, wrinkled and sprouting the odd
 * wiry hair, cinched at the neck with a red drawstring and stuffed with presents.
 * k: 0 hanging, 1 squashed on impact, 2 neck open for throwing.
 */
function sackFrame(k: number): Frame {
  const W = 52, H = 56;
  const p = new Pix(W, H);
  const FLESH = ['#5a2a26', '#8a4a3e', '#b8705e', '#dc9a82', '#f4c0a6'].map(rgb);
  const rng = new RNG(99);
  const cx = 26;
  const sq = k === 1 ? 1 : 0;
  const ry = sq ? 14 : 17, rx = sq ? 23 : 20, cy = sq ? 38 : 34;
  // presents peeking out of the neck
  if (k === 2) {
    p.blit(presentFrame('#2a9a48', '#f0c030', 10, 10), cx - 12, 0);
    p.blit(presentFrame('#3a6ad0', '#ffffff', 10, 9), cx + 1, 1);
  } else {
    p.rect(cx - 6, 1, 7, 6, rgb('#2a9a48')); p.rect(cx - 3, 1, 1, 6, rgb('#f0c030'));
    p.rect(cx + 1, 2, 6, 5, rgb('#d02838')); p.rect(cx + 1, 4, 6, 1, rgb('#fff0f0'));
  }
  const body = p.newPart();
  // the gathered neck flares out into the pouch
  const neckTop = k === 2 ? 8 : 5;
  for (let y = neckTop; y < cy; y++) {
    const t = (y - neckTop) / (cy - neckTop);
    const w = (k === 2 ? 6 : 5) + t * t * rx * 0.9;
    for (let x = Math.floor(cx - w); x <= cx + w; x++) p.set(x, y, FLESH[3], body);
  }
  p.ellipse(cx, cy, rx, ry, FLESH[3], body);
  // a heavy, saggy bottom that bulges to either side
  p.ellipse(cx - 7, cy + ry * 0.45, rx * 0.55, ry * 0.55, FLESH[3], body);
  p.ellipse(cx + 7, cy + ry * 0.45, rx * 0.55, ry * 0.55, FLESH[3], body);
  p.volume(body, FLESH);
  // wrinkles: crinkled creases running around the pouch
  for (const [yy, len] of [[cy - 9, 0.45], [cy - 1, 0.7], [cy + 7, 0.55]] as [number, number][]) {
    const half = rx * len;
    const off = rng.range(-3, 3);
    for (let x = cx - half + off; x < cx + half + off; x += 1) {
      const y = yy + Math.sin(x / 2.3 + yy) * 1.2 + Math.abs(x - cx) * 0.18;
      if (p.part[Math.round(y) * W + Math.round(x)] === body && Math.sin(x * 1.7 + yy) > -0.3) p.over(x, y, FLESH[2]);
      if (Math.sin(x * 1.7 + yy) > 0.4) p.over(x, y - 1, FLESH[4]);
    }
  }
  // a seam down the middle where the cloth was stitched together
  for (let y = cy - ry + 4; y < cy + ry + 3; y++) {
    const x = cx + Math.sin(y / 3) * 0.8;
    p.over(x, y, FLESH[1]);
    if (y % 3 === 0) p.over(x + 1, y, FLESH[2]);
  }
  // drawstring
  p.rect(cx - 7, neckTop + 3, 14, 3, rgb('#c01828'));
  p.rect(cx - 7, neckTop + 3, 14, 1, rgb('#ff5a50'));
  p.line(cx + 6, neckTop + 5, cx + 10, neckTop + 12, rgb('#c01828'));
  p.line(cx + 5, neckTop + 5, cx + 7, neckTop + 13, rgb('#c01828'));
  p.outline(OUTLINE);
  // wiry hairs, curling off the surface and past the outline
  const hair = rgb('#2a1610');
  const pts: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.part[y * W + x] === body) pts.push([x, y]);
  for (let i = 0; i < 34; i++) {
    const [x, y] = pts[Math.floor(rng.next() * pts.length)];
    if (y < cy - ry + 6) continue;
    const dir = x < cx ? -1 : 1;
    let hx = x, hy = y;
    const n = 3 + Math.floor(rng.next() * 3);
    for (let s = 0; s < n; s++) {
      p.set(hx, hy, hair);
      hx += dir * (rng.next() < 0.7 ? 1 : 0);
      hy += s % 2 === 0 ? 1 : (rng.next() < 0.5 ? -1 : 0);
    }
  }
  return frame(p, cx, 3);
}

function shadowFrame(): Frame {
  const p = new Pix(48, 8);
  p.ellipse(24, 4, 22, 3, withAlpha(rgb('#1a2040'), 0.45));
  return frame(p, 24, 4);
}

function thinIceFrames(): Frame[] {
  return [0, 1, 2].map((k) => {
    const p = new Pix(48, 10);
    const id = p.newPart();
    p.rect(0, 1, 48, 6, ICE[3], id);
    p.shade(id, [ICE[1], ICE[3], ICE[4]]);
    for (let x = 0; x < 48; x++) if ((x * 3) % 13 < 2) p.set(x, 3, ICE[4]);
    p.rect(0, 0, 48, 1, SNOW[4]);
    const rng = new RNG(7);
    for (let c = 0; c < k * 3; c++) {
      let x = rng.range(4, 44), y = 1;
      for (let s = 0; s < 7; s++) { p.set(x, y, ICE[0]); x += rng.range(-1.5, 1.5); y += 1; if (y > 6) break; }
    }
    p.outline(OUTLINE);
    return frame(p, 0, 0);
  });
}

export function buildSnow(): SnowArt {
  const sk = (legs: [number, number, number, number], aim: number, lean = 18, hipY = -12): Pose => ({ hipX: -2, hipY, lean, legs, aim });
  return {
    sky: skyCanvas(), peaks: peaksCanvas(), firs: firsCanvas(), near: nearCanvas(),
    pine: [pineFrame(44, 1), pineFrame(60, 2), pineFrame(78, 3)],
    rock: rockFrame(), cane: caneFrame(), pole: poleFrame(), workshop: workshopFrame(), pile: pileFrame(), lamp: lampFrame(),
    snowman: [snowmanFrame(0), snowmanFrame(1), snowmanFrame(2)],
    snowball: snowballFrames(), bigball: bigballFrame(), puff: puffFrames(), wave: waveFrames(), shard: shardFrame(),
    skier: [skierFrame(sk([40, -25, 60, -20], 0)), skierFrame(sk([35, -30, 55, -25], 0, 22, -11))],
    skierAir: skierFrame({ hipX: -2, hipY: -14, lean: 10, legs: [55, -10, 70, 0], aim: 0 }, -3),
    thinIce: thinIceFrames(),
    santa: {
      stand: [drawSanta({}), drawSanta({ bob: 1 })],
      walk: [drawSanta({ legs: [-5, 0, 5, 3] }), drawSanta({ legs: [-2, 3, 2, 0], bob: 1 }), drawSanta({ legs: [5, 3, -5, 0] }), drawSanta({ legs: [2, 0, -2, 3], bob: 1 })],
      crouch: drawSanta({ crouch: 5, legs: [-3, 0, 3, 0] }),
      air: drawSanta({ legs: [-4, 9, 4, 9], bob: -2 }),
      laugh: drawSanta({ laugh: true, bob: 1 }),
      down: drawSanta({ down: true }),
    },
    arm: armFrame(), sack: [sackFrame(0), sackFrame(1), sackFrame(2)],
    present: [presentFrame('#d02838', '#f0c030'), presentFrame('#2a9a48', '#d02838'), presentFrame('#3a6ad0', '#ffffff')].map((p) => frame(p, 8, p.h - 1)),
    shadow: shadowFrame(),
  };
}
