import { Pix, rgb, ramp, mix, withAlpha, RNG, frame, type Frame, type Ramp } from '../engine/pixel';
import { OUTLINE, drawHumanoid, AX, AY, type Look, type Pose } from './humanoid';
import { vnoise, hash, TS } from './tiles';
import { dither } from './backgrounds';

// Stage 4, "Snowland": winter backdrops, the snowy ground painter, the arctic
// outpost props, grenadiers, ski troopers, ice boulders and the Glacier Walker.

export interface SnowArt {
  sky: HTMLCanvasElement; peaks: HTMLCanvasElement; firs: HTMLCanvasElement; near: HTMLCanvasElement;
  pine: Frame[]; rock: Frame; beacon: Frame; mast: Frame; outpost: Frame; crates: Frame; lamp: Frame;
  grenadier: Frame[]; grenade: Frame[]; snowball: Frame[]; boulder: Frame; puff: Frame[]; wave: Frame[]; shard: Frame;
  skier: Frame[]; skierAir: Frame;
  thinIce: Frame[];
  walker: { stand: Frame[]; walk: Frame[]; crouch: Frame; air: Frame; vent: Frame; down: Frame };
  arm: Frame; hammer: Frame[]; mine: Frame; scrap: Frame[]; shadow: Frame;
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

function snowballFrames(): Frame[] {
  return [0, 1].map((k) => {
    const p = new Pix(8, 8);
    p.volume(p.shape(ramp('#8a9ccc', '#dce6fa', '#ffffff'), (c, id) => p.circle(3.5, 3.5, 3, c, id)), SNOW.slice(1));
    if (k) p.set(2, 4, SNOW[1]); else p.set(4, 2, SNOW[1]);
    p.outline(OUTLINE);
    return frame(p, 4, 4);
  });
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

// ---------------------------------------------------------------- outpost props

const STEEL = ['#12151c', '#222834', '#363e4e', '#505b70', '#7a879e'].map(rgb);
const PLATE = ['#4a586e', '#7a8aa6', '#b4c2da', '#e8eef8'].map(rgb);
const GLOW = ['#0a3a5a', '#1a8ac0', '#60d8ff', '#d8fcff'].map(rgb);
const OLIVE = ['#1e2414', '#343e22', '#4e5c32', '#6e7e48'].map(rgb);
const HAZ_Y = rgb('#e0a818'), HAZ_K = rgb('#1a1a1e');

function hazard(p: Pix, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.set(x + i, y + j, ((x + i + y + j) >> 2) % 2 === 0 ? HAZ_Y : HAZ_K);
}

/** A striped warning post with a red lamp on top, marking the outpost perimeter. */
function beaconFrame(): Frame {
  const p = new Pix(12, 48);
  for (let y = 8; y < 48; y++) for (let x = 4; x < 8; x++) p.set(x, y, ((y >> 2) % 2 === 0) ? HAZ_Y : HAZ_K);
  p.rect(3, 4, 6, 5, STEEL[2]);
  p.rect(4, 1, 4, 4, rgb('#ff3a2a'));
  p.set(4, 1, rgb('#ffb0a0'));
  p.rect(2, 0, 8, 1, SNOW[4]);
  p.outline(OUTLINE);
  return frame(p, 6, 47);
}

/** A lattice radio mast. */
function mastFrame(): Frame {
  const W = 26, H = 96;
  const p = new Pix(W, H);
  const c = STEEL[3];
  for (let y = 6; y < H; y++) {
    const half = 2 + (y - 6) * 0.1;
    p.set(13 - half, y, c); p.set(13 + half, y, c);
    if (y % 10 === 6) for (let x = Math.round(13 - half); x <= 13 + half; x++) p.set(x, y, STEEL[2]);
    const k = (y - 6) % 10;
    p.set(13 - half + k * half / 5, y, STEEL[2]);
  }
  p.rect(12, 0, 2, 7, STEEL[3]);
  p.rect(11, 0, 4, 2, rgb('#ff3a2a'));
  for (const y of [30, 60]) p.rect(6, y, 14, 1, SNOW[3]);
  p.outline(OUTLINE);
  return frame(p, 13, H - 1);
}

/** Supply crates, a fuel drum and sandbags. */
function cratesFrame(): Frame {
  const p = new Pix(64, 32);
  const crate = (x: number, y: number, w: number, h: number) => {
    const id = p.newPart();
    p.rect(x, y, w, h, OLIVE[2], id);
    p.shade(id, [OLIVE[0], OLIVE[2], OLIVE[3]]);
    p.rect(x + 1, y + 1, w - 2, 1, OLIVE[3]);
    p.line(x + 1, y + 1, x + w - 2, y + h - 2, OLIVE[1]);
    p.rect(x, y, w, 2, SNOW[3]);
    p.rect(x + w / 2 - 3, y + h / 2, 6, 2, rgb('#c8b878'));
  };
  crate(0, 12, 18, 20); crate(18, 16, 16, 16); crate(6, 0, 14, 12);
  // a fuel drum
  const d = p.newPart();
  p.rect(38, 8, 12, 24, rgb('#8a2a20'), d);
  p.volume(d, ['#4a1410', '#8a2a20', '#c04a30', '#e07a50'].map(rgb));
  for (const y of [14, 24]) p.rect(38, y, 12, 1, rgb('#4a1410'));
  p.rect(38, 8, 12, 2, SNOW[3]);
  // sandbags
  for (let i = 0; i < 3; i++) p.volume(p.shape(ramp('#5a5038', '#8a7a58', '#b0a07a'), (c, id) => p.ellipse(52 + (i % 2) * 6, 28 - Math.floor(i / 2) * 5, 6, 3, c, id)), ['#4a4230', '#6e6448', '#8a7a58', '#b0a07a'].map(rgb));
  p.outline(OUTLINE);
  return frame(p, 32, 31);
}

/** A fortified arctic outpost: concrete bunker, blast door, radar dish and floodlights. */
function outpostFrame(): Frame {
  const W = 200, H = 124;
  const p = new Pix(W, H);
  const CON = ['#2a2e36', '#3e444e', '#565d68', '#727a86', '#9aa2ae'].map(rgb);
  // main block with sloped armoured front
  const body = p.newPart();
  p.poly([[14, 124], [14, 54], [40, 42], [160, 42], [186, 54], [186, 124]], CON[2], body);
  for (let y = 42; y < H; y++) for (let x = 14; x < 186; x++) {
    if (p.part[y * W + x] !== body) continue;
    const n = vnoise(x / 6, y / 6, 3);
    let c = n > 0.65 ? CON[3] : n < 0.3 ? CON[1] : CON[2];
    if ((y - 42) % 16 === 0 || (x - 14) % 28 === 0) c = CON[1];
    if (x < 40 && y < 54 + (40 - x) * 0) c = CON[3];
    p.set(x, y, c);
  }
  // snow drifted on the roof
  for (let x = 12; x < 188; x++) {
    const top = x < 40 ? 54 - (x - 14) * (12 / 26) : x > 160 ? 42 + (x - 160) * (12 / 26) : 42;
    const th = 4 + vnoise(x / 5, 0, 7) * 4;
    for (let y = Math.floor(top - th + 2); y < top + 2; y++) p.set(x, y, y < top - th + 3 ? SNOW[4] : SNOW[3]);
  }
  // blast door
  p.rect(78, 70, 44, 54, CON[0]);
  p.rect(80, 72, 40, 52, STEEL[2]);
  for (let y = 76; y < 124; y += 8) p.rect(80, y, 40, 1, STEEL[1]);
  p.rect(99, 72, 2, 52, STEEL[0]);
  hazard(p, 78, 64, 44, 5);
  // slit windows with warm light
  for (const wx of [28, 140]) {
    p.rect(wx - 1, 66, 34, 10, CON[0]);
    for (let x = wx; x < wx + 32; x++) for (let y = 67; y < 75; y++) p.set(x, y, gradient([[0, '#ffe8a0'], [1, '#e08020']], (y - 67) / 8, x, y));
    for (let x = wx + 7; x < wx + 32; x += 8) p.rect(x, 67, 1, 8, CON[0]);
  }
  // radar dish on a mount
  p.rect(146, 22, 4, 20, STEEL[2]);
  const dish = p.newPart();
  p.ellipse(148, 16, 18, 7, PLATE[2], dish);
  p.volume(dish, PLATE);
  p.line(148, 16, 160, 8, STEEL[3], 1);
  p.rect(160, 6, 3, 3, rgb('#ff3a2a'));
  // antenna and floodlights
  p.rect(52, 6, 2, 36, STEEL[3]);
  p.rect(51, 4, 4, 3, rgb('#ff3a2a'));
  for (const fx of [24, 172]) {
    p.rect(fx - 1, 36, 2, 8, STEEL[2]);
    p.rect(fx - 5, 31, 10, 6, STEEL[1]);
    p.rect(fx - 4, 32, 8, 4, rgb('#fff6d0'));
  }
  p.outline(OUTLINE);
  return frame(p, W / 2, H - 1);
}

// ---------------------------------------------------------------- foes

function grenadeFrames(): Frame[] {
  return [0, 1].map((k) => {
    const p = new Pix(8, 8);
    p.volume(p.shape(ramp('#1e2414', '#4e5c32', '#6e7e48'), (c, id) => p.ellipse(3.5, 4, 3, 2.5, c, id)), OLIVE);
    p.set(k ? 2 : 5, 1, STEEL[4]); p.set(3, 1, STEEL[3]);
    p.outline(OUTLINE);
    return frame(p, 4, 4);
  });
}

/** A crystal-crusted ice boulder breaking loose and rolling downhill. */
function boulderFrame(): Frame {
  const p = new Pix(32, 32);
  const id = p.newPart();
  p.poly([[16, 2], [26, 6], [30, 15], [27, 25], [17, 30], [6, 27], [2, 17], [6, 6]], ROCK[2], id);
  p.volume(id, ROCK.slice(1));
  // icy facets catching the light
  const facets: [number, number][][] = [[[8, 8], [16, 4], [14, 13]], [[18, 6], [26, 9], [20, 15]], [[5, 18], [12, 15], [10, 24]]];
  for (const f of facets) { p.poly(f, ICE[2]); p.line(f[0][0], f[0][1], f[1][0], f[1][1], ICE[4]); }
  p.line(16, 16, 24, 22, ROCK[0]); p.line(16, 16, 12, 26, ROCK[0]);
  p.ellipse(16, 5, 7, 2, SNOW[4]);
  p.outline(OUTLINE);
  return frame(p, 16, 16);
}

const arcticLook: Look = {
  skin: ramp('#8a5a3a', '#c08860', '#e0b088'),
  hair: ramp('#1a1a1a', '#2a2a2a', '#3a3a3a'),
  head: 'helmet',
  headColor: ramp('#8a96b8', '#d4dcf0', '#ffffff'),
  accent: ramp('#06343a', '#1a8a9a', '#7ae8f0'),
  torso: ramp('#8a96b8', '#d4dcf0', '#ffffff'),
  vest: ramp('#2e3648', '#48546c', '#6a7896'),
  pants: ramp('#7a86a8', '#b8c4e0', '#e8eef8'),
  boots: ramp('#1a1a22', '#2e2e3a', '#4a4a58'),
  gun: ramp('#22232c', '#4a4c5a', '#8a8ea0'),
  bulk: 1,
};

/** Arctic grenadier: 0 aiming, 1 arm back with a grenade, 2 follow-through. */
function grenadierFrame(pose: number): Frame {
  const pp: Pose = pose === 0 ? { hipX: -1, hipY: -15, lean: 2, legs: [-14, -6, 16, 8], aim: 0 }
    : pose === 1 ? { hipX: -1, hipY: -15, lean: -8, legs: [-20, -6, 18, 10], aim: null, arms: 'up' }
      : { hipX: 0, hipY: -15, lean: 14, legs: [-24, -4, 22, 6], aim: -25 };
  return frame(drawHumanoid(arcticLook, pp), AX, AY);
}

// ---------------------------------------------------------------- the Glacier Walker

interface WalkerPose { bob?: number; legs?: [number, number, number, number]; crouch?: number; vent?: boolean; down?: boolean }

/** A two-legged assault walker in arctic armour. Its reactor core glows in the chest. */
function drawWalker(o: WalkerPose): Frame {
  const W = 80, H = 110;
  const p = new Pix(W, H);
  const fy = H - 1;
  if (o.down) {
    // collapsed in a heap, reactor dark
    for (const [x, d] of [[20, 0], [50, 1]] as [number, number][]) {
      const id = p.newPart();
      p.line(x, fy - 6 - d, x + 18, fy - 3, STEEL[2 + d], 7, id);
      p.volume(id, STEEL.slice(d));
      p.poly([[x + 14, fy], [x + 28, fy], [x + 24, fy - 6], [x + 14, fy - 6]], STEEL[1]);
    }
    const hull = p.newPart();
    p.poly([[14, fy - 6], [66, fy - 10], [70, fy - 30], [58, fy - 40], [22, fy - 38], [10, fy - 22]], STEEL[2], hull);
    p.volume(hull, STEEL);
    p.poly([[30, fy - 38], [58, fy - 40], [66, fy - 30], [42, fy - 28]], PLATE[1]);
    p.circle(40, fy - 20, 7, STEEL[0]); p.circle(40, fy - 20, 4, rgb('#2a1a14'));
    p.line(30, fy - 30, 38, fy - 18, OUTLINE); p.line(52, fy - 34, 58, fy - 22, OUTLINE);
    hazard(p, 18, fy - 12, 44, 3);
    p.outline(OUTLINE);
    return frame(p, 40, fy);
  }
  const cr = o.crouch ?? 0;
  const hy = fy - 36 + cr + (o.bob ?? 0);
  const [bdx, blift, fdx, flift] = o.legs ?? [0, 0, 0, 0];
  // reverse-jointed legs with claw feet
  const leg = (x: number, dx: number, lift: number, back: boolean) => {
    const cols = back ? STEEL.slice(0, 4) : STEEL.slice(1);
    const kx = x + 10 + dx * 0.4, ky = hy + 13 - lift * 0.4 + cr * 0.3;
    const ax = x - 2 + dx, ay = fy - 8 - lift;
    const t = p.newPart(); p.line(x, hy, kx, ky, cols[2], 9, t); p.volume(t, cols);
    const s = p.newPart(); p.line(kx, ky, ax, ay, cols[1], 7, s); p.volume(s, cols);
    p.line(x + 2, hy + 4, ax + 2, ay - 2, back ? STEEL[0] : STEEL[3], 1);
    const f = p.newPart();
    p.poly([[ax - 9, fy - lift], [ax + 13, fy - lift], [ax + 9, fy - 6 - lift], [ax - 6, fy - 8 - lift]], cols[2], f);
    p.volume(f, cols);
    p.circle(kx, ky, 3.5, back ? STEEL[1] : PLATE[1]);
  };
  leg(30, bdx, blift, true);
  leg(46, fdx, flift, false);
  // missile pod on the back
  const pod = p.newPart();
  p.rect(6, hy - 62, 20, 16, STEEL[2], pod);
  p.volume(pod, STEEL.slice(1));
  for (let i = 0; i < 3; i++) { p.rect(9 + i * 5, hy - 62, 3, 3, STEEL[0]); p.set(10 + i * 5, hy - 61, rgb('#ff5a3a')); }
  hazard(p, 6, hy - 50, 20, 2);
  p.line(28, hy - 50, 24, hy - 70, STEEL[3]);
  p.rect(23, hy - 72, 3, 3, rgb('#ff3a2a'));
  // armoured hull
  const hull = p.newPart();
  p.poly([[16, hy - 4], [62, hy - 8], [68, hy - 32], [58, hy - 50], [24, hy - 48], [12, hy - 30]], STEEL[2], hull);
  p.volume(hull, STEEL);
  const plate = p.newPart();
  p.poly([[30, hy - 48], [58, hy - 50], [67, hy - 36], [42, hy - 34]], PLATE[1], plate);
  p.volume(plate, PLATE);
  for (let x = 32; x < 60; x++) if (hash(x, 0, 3) < 0.5) p.set(x, hy - 49 + Math.round((x - 32) * -0.05), SNOW[4]);
  // cockpit visor
  p.line(48, hy - 43, 63, hy - 39, OUTLINE, 3);
  p.line(49, hy - 43, 62, hy - 39, o.vent ? GLOW[3] : GLOW[2], 1);
  // reactor core: the weak point
  p.circle(40, hy - 22, 9, STEEL[0]);
  const core = p.newPart();
  p.circle(40, hy - 22, 6.5, GLOW[2], core);
  p.volume(core, o.vent ? [GLOW[2], GLOW[3], GLOW[3], rgb('#ffffff')] : GLOW);
  p.rect(39, hy - 25, 2, 2, rgb('#ffffff'));
  for (let a = 0; a < 6; a++) p.set(40 + Math.cos(a) * 8, hy - 22 + Math.sin(a) * 8, STEEL[3]);
  hazard(p, 18, hy - 11, 42, 3);
  // shoulder vents
  if (o.vent) for (const vx of [20, 28]) p.rect(vx, hy - 47, 4, 3, rgb('#ffb040'));
  p.outline(OUTLINE);
  return frame(p, 40, fy);
}

function mechArmFrame(): Frame {
  const p = new Pix(32, 16);
  const id = p.newPart();
  p.line(4, 8, 21, 8, STEEL[2], 9, id);
  p.volume(id, STEEL.slice(1));
  p.line(5, 5, 20, 5, PLATE[1], 1);
  hazard(p, 12, 10, 6, 2);
  p.circle(4, 8, 4, PLATE[1]);
  // clamp hand
  p.rect(22, 3, 8, 3, STEEL[3]); p.rect(22, 10, 8, 3, STEEL[3]);
  p.rect(21, 4, 3, 8, STEEL[1]);
  p.outline(OUTLINE);
  return frame(p, 4, 8);
}

/** The walker's piston hammer. k = 1 glows white-hot after a strike. */
function hammerFrame(k: number): Frame {
  const W = 40, H = 62;
  const p = new Pix(W, H);
  const h = p.newPart();
  p.rect(17, 0, 6, 32, STEEL[2], h);
  p.volume(h, STEEL.slice(1));
  for (let y = 4; y < 28; y += 6) p.rect(17, y, 6, 2, STEEL[0]);
  const head = p.newPart();
  p.rect(3, 30, 34, 28, STEEL[2], head);
  p.volume(head, STEEL);
  p.rect(1, 32, 4, 24, STEEL[1]); p.rect(35, 32, 4, 24, STEEL[1]);
  p.rect(3, 30, 34, 3, PLATE[2]);
  for (let x = 3; x < 37; x++) if (hash(x, 1, 5) < 0.6) p.set(x, 29, SNOW[4]);
  const hot = k === 1;
  for (const y of [38, 46]) for (let x = 6; x < 34; x++) p.set(x, y, hot ? (x % 3 ? GLOW[3] : rgb('#ffffff')) : (x % 4 ? GLOW[1] : GLOW[2]));
  p.rect(3, 55, 34, 3, hot ? GLOW[3] : STEEL[3]);
  p.outline(OUTLINE);
  return frame(p, 20, 2);
}

/** A cluster mine fired from the walker's missile pod. */
function mineFrame(): Frame {
  const p = new Pix(14, 14);
  p.volume(p.shape(ramp('#12151c', '#363e4e', '#7a879e'), (c, id) => p.circle(7, 8, 5, c, id)), STEEL);
  p.rect(1, 7, 2, 2, STEEL[3]); p.rect(11, 7, 2, 2, STEEL[3]); p.rect(6, 1, 2, 3, STEEL[3]);
  p.rect(6, 7, 2, 2, rgb('#ff3a2a'));
  p.outline(OUTLINE);
  return frame(p, 7, 13);
}

function scrapFrames(): Frame[] {
  return [0, 1].map((k) => {
    const p = new Pix(8, 6);
    p.poly(k ? [[0, 1], [7, 0], [6, 5], [1, 4]] : [[1, 0], [6, 2], [5, 5], [0, 3]], k ? PLATE[1] : STEEL[3]);
    p.outline(OUTLINE);
    return frame(p, 4, 3);
  });
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
    rock: rockFrame(), beacon: beaconFrame(), mast: mastFrame(), outpost: outpostFrame(), crates: cratesFrame(), lamp: lampFrame(),
    grenadier: [grenadierFrame(0), grenadierFrame(1), grenadierFrame(2)], grenade: grenadeFrames(),
    snowball: snowballFrames(), boulder: boulderFrame(), puff: puffFrames(), wave: waveFrames(), shard: shardFrame(),
    skier: [skierFrame(sk([40, -25, 60, -20], 0)), skierFrame(sk([35, -30, 55, -25], 0, 22, -11))],
    skierAir: skierFrame({ hipX: -2, hipY: -14, lean: 10, legs: [55, -10, 70, 0], aim: 0 }, -3),
    thinIce: thinIceFrames(),
    walker: {
      stand: [drawWalker({}), drawWalker({ bob: 1 })],
      walk: [drawWalker({ legs: [-6, 0, 6, 4] }), drawWalker({ legs: [-2, 3, 2, 0], bob: 1 }), drawWalker({ legs: [6, 4, -6, 0] }), drawWalker({ legs: [2, 0, -2, 3], bob: 1 })],
      crouch: drawWalker({ crouch: 7, legs: [-4, 0, 4, 0] }),
      air: drawWalker({ legs: [-5, 10, 5, 10], bob: -2, vent: true }),
      vent: drawWalker({ vent: true }),
      down: drawWalker({ down: true }),
    },
    arm: mechArmFrame(), hammer: [hammerFrame(0), hammerFrame(1)], mine: mineFrame(), scrap: scrapFrames(),
    shadow: shadowFrame(),
  };
}
