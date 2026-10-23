import { Pix, rgb, mix } from '../engine/pixel';
import { OUTLINE as OUTLINE_COLOR } from './humanoid';

// Tile ids
export const T = { E: 0, GROUND: 1, ROCK: 2, PLANK: 3, LEDGE: 4, METAL: 5, BRIDGE: 6, ROCKBG: 7 } as const;
export const SOLID = new Set<number>([T.GROUND, T.ROCK, T.METAL]);
export const ONEWAY = new Set<number>([T.PLANK, T.LEDGE, T.BRIDGE]);
export const TS = 16;

export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// smooth value noise
export function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const C = {
  dirt: [rgb('#2a1a10'), rgb('#432a18'), rgb('#5c3c22'), rgb('#774f2e')],
  grass: [rgb('#14361a'), rgb('#1f5a22'), rgb('#2f8a2c'), rgb('#5cc23a'), rgb('#a8f05a')],
  rock: [rgb('#1c2430'), rgb('#2c3846'), rgb('#3e4e60'), rgb('#56697e'), rgb('#7e93a8')],
  moss: [rgb('#1a4a26'), rgb('#2a7034'), rgb('#4a9a3c'), rgb('#86cc56')],
  wood: [rgb('#2e1a0e'), rgb('#4e2e18'), rgb('#704424'), rgb('#9a6634'), rgb('#c48a4a')],
  metal: [rgb('#1a1c24'), rgb('#2e3240'), rgb('#4a5064'), rgb('#6e768e'), rgb('#a4aec4')],
  rope: [rgb('#5a4426'), rgb('#9a7a44'), rgb('#c8a868')],
  stone: [rgb('#3a3a32'), rgb('#56564a'), rgb('#76766a'), rgb('#9a9a8a')],
};

export type TileGetter = (tx: number, ty: number) => number;

/** Paint one chunk of the tile map into a Pix (chunk = n x n tiles). */
export function paintChunk(get: TileGetter, cx: number, cy: number, n: number): Pix | null {
  const p = new Pix(n * TS, n * TS);
  let any = false;
  const solidish = (t: number) => SOLID.has(t);
  for (let ty = cy * n; ty < cy * n + n; ty++) for (let tx = cx * n; tx < cx * n + n; tx++) {
    const t = get(tx, ty);
    if (t === T.E) continue;
    any = true;
    const ox = (tx - cx * n) * TS, oy = (ty - cy * n) * TS;
    const up = get(tx, ty - 1), dn = get(tx, ty + 1), lf = get(tx - 1, ty), rt = get(tx + 1, ty);
    if (t === T.GROUND) paintGround(p, tx, ty, ox, oy, !solidish(up), !solidish(lf), !solidish(rt), !solidish(dn));
    else if (t === T.ROCK) paintRock(p, tx, ty, ox, oy, !solidish(up), !solidish(lf), !solidish(rt), !solidish(dn));
    else if (t === T.METAL) paintMetal(p, tx, ty, ox, oy, !solidish(up));
    else if (t === T.PLANK) paintPlank(p, tx, ty, ox, oy, lf !== T.PLANK, rt !== T.PLANK);
    else if (t === T.LEDGE) paintLedge(p, tx, ty, ox, oy, lf !== T.LEDGE, rt !== T.LEDGE);
    else if (t === T.BRIDGE) paintBridge(p, tx, ty, ox, oy);
    else if (t === T.ROCKBG) paintRockBg(p, tx, ty, ox, oy);
  }
  if (!any) return null;
  p.outline(OUTLINE_COLOR);
  return p;
}

function paintGround(p: Pix, tx: number, ty: number, ox: number, oy: number, top: boolean, left: boolean, right: boolean, bottom: boolean) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x, wy = ty * TS + y;
    const n = vnoise(wx / 5, wy / 5, 3) * 0.7 + hash(wx, wy, 9) * 0.3;
    let c = n < 0.3 ? C.dirt[0] : n < 0.62 ? C.dirt[1] : n < 0.85 ? C.dirt[2] : C.dirt[3];
    // pebbles
    const pb = vnoise(wx / 4, wy / 4, 17);
    if (pb > 0.86) c = pb > 0.9 ? C.stone[2] : C.stone[0];
    // darker the deeper we go
    p.set(ox + x, oy + y, c);
  }
  // roots
  if (hash(tx, ty, 41) < 0.35) {
    let x = ox + Math.floor(hash(tx, ty, 42) * 14) + 1, y = oy;
    for (let i = 0; i < 12; i++) { p.set(x, y + i, C.dirt[0]); if (hash(tx, ty + i, 43) < 0.3) x += hash(tx, i, 44) < 0.5 ? -1 : 1; }
  }
  if (left) for (let y = 0; y < TS; y++) { p.set(ox, oy + y, C.dirt[0]); p.set(ox + 1, oy + y, mix(C.dirt[0], C.dirt[1], 0.5)); }
  if (right) for (let y = 0; y < TS; y++) { p.set(ox + TS - 1, oy + y, C.dirt[0]); }
  if (top) {
    for (let x = 0; x < TS; x++) {
      const wx = tx * TS + x;
      const depth = 4 + Math.round(vnoise(wx / 3, ty, 5) * 3) + (hash(wx, ty, 6) < 0.15 ? 2 : 0);
      for (let y = 0; y < depth; y++) {
        const c = y === 0 ? C.grass[3] : y === 1 ? C.grass[2] : y < depth - 1 ? C.grass[1] : C.grass[0];
        p.set(ox + x, oy + y, c);
      }
      if (hash(wx, ty, 7) < 0.12) p.set(ox + x, oy + 1, C.grass[4]);
      // blades poking above the tile
      const bh = Math.floor(hash(wx, ty, 8) * 5) - 1;
      for (let y = 1; y <= bh; y++) p.set(ox + x, oy - y, y === bh ? C.grass[3] : C.grass[2]);
    }
    if (hash(tx, ty, 11) < 0.18) { // flower
      const fx = ox + 3 + Math.floor(hash(tx, ty, 12) * 10);
      p.set(fx, oy - 3, rgb('#ff5a8a')); p.set(fx - 1, oy - 3, rgb('#ffd04a')); p.set(fx + 1, oy - 3, rgb('#ffd04a')); p.set(fx, oy - 2, C.grass[2]);
    }
  }
  if (bottom) for (let x = 0; x < TS; x++) { p.set(ox + x, oy + TS - 1, C.dirt[0]); if (hash(tx * TS + x, ty, 13) < 0.3) p.set(ox + x, oy + TS, C.dirt[0]); }
}

function paintRock(p: Pix, tx: number, ty: number, ox: number, oy: number, top: boolean, left: boolean, right: boolean, bottom: boolean) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x, wy = ty * TS + y;
    // blocky cracked stone: cells from coarse noise, edges darker
    const n = vnoise(wx / 7, wy / 7, 21);
    const e = Math.abs(vnoise(wx / 4, wy / 4, 22) - 0.5);
    let c = n < 0.35 ? C.rock[1] : n < 0.65 ? C.rock[2] : C.rock[3];
    if (e < 0.04) c = C.rock[0];
    else if (e < 0.07) c = mix(c, C.rock[4], 0.35);
    // wet vertical streaks
    if (hash(wx, 0, 23) < 0.06 && vnoise(wx, wy / 9, 24) > 0.5) c = mix(c, rgb('#9adcf0'), 0.35);
    p.set(ox + x, oy + y, c);
  }
  if (left) for (let y = 0; y < TS; y++) p.set(ox, oy + y, C.rock[4]);
  if (right) for (let y = 0; y < TS; y++) { p.set(ox + TS - 1, oy + y, C.rock[0]); p.set(ox + TS - 2, oy + y, C.rock[1]); }
  if (bottom) for (let x = 0; x < TS; x++) p.set(ox + x, oy + TS - 1, C.rock[0]);
  if (top) {
    for (let x = 0; x < TS; x++) {
      const wx = tx * TS + x;
      const d = 2 + Math.round(vnoise(wx / 3, ty, 25) * 3);
      for (let y = 0; y < d; y++) p.set(ox + x, oy + y, y === 0 ? C.moss[3] : y === 1 ? C.moss[2] : C.moss[1]);
      // moss drips
      if (hash(wx, ty, 26) < 0.15) for (let y = d; y < d + 2 + hash(wx, ty, 27) * 4; y++) p.set(ox + x, oy + y, C.moss[0]);
      if (hash(wx, ty, 28) < 0.3) p.set(ox + x, oy - 1, C.moss[2]);
    }
  }
}

function paintRockBg(p: Pix, tx: number, ty: number, ox: number, oy: number) {
  // Non-solid dark rock used to frame the waterfall shaft.
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x, wy = ty * TS + y;
    const n = vnoise(wx / 8, wy / 8, 31);
    const e = Math.abs(vnoise(wx / 5, wy / 5, 32) - 0.5);
    let c = n < 0.5 ? rgb('#141a24') : rgb('#1c2430');
    if (e < 0.05) c = rgb('#0c1018');
    p.set(ox + x, oy + y, c);
  }
}

function paintMetal(p: Pix, tx: number, ty: number, ox: number, oy: number, top: boolean) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let c = C.metal[2];
    if (y === 0 || x === 0) c = C.metal[3];
    if (y === TS - 1 || x === TS - 1) c = C.metal[1];
    if ((x === 2 || x === 13) && (y === 2 || y === 13)) c = C.metal[4];
    if (vnoise((tx * TS + x) / 4, (ty * TS + y) / 4, 51) > 0.78) c = mix(c, rgb('#8a4a2a'), 0.45); // rust
    p.set(ox + x, oy + y, c);
  }
  if (top) for (let x = 0; x < TS; x++) for (let y = 0; y < 3; y++) p.set(ox + x, oy + y, ((x + y + tx * TS) >> 2) % 2 ? rgb('#e8c020') : rgb('#22222a'));
}

function paintPlank(p: Pix, tx: number, ty: number, ox: number, oy: number, endL: boolean, endR: boolean) {
  // A thick branch / log platform.
  for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x;
    const off = Math.round(vnoise(wx / 9, ty, 61) * 1.5);
    for (let y = 0; y < 7; y++) {
      let c = y === 0 ? C.wood[4] : y === 1 ? C.wood[3] : y < 5 ? C.wood[2] : C.wood[1];
      if (hash(wx, y, 62) < 0.08) c = C.wood[1];
      if (y > 1 && y < 5 && vnoise(wx / 2, y * 3, 63) > 0.75) c = C.wood[3];
      p.set(ox + x, oy + y + off, c);
    }
    if (hash(wx, ty, 64) < 0.06) for (let y = 7; y < 10 + hash(wx, ty, 65) * 10; y++) p.set(ox + x, oy + y + off, C.grass[1]);
  }
  if (endL) for (let y = 1; y < 6; y++) p.set(ox, oy + y, C.wood[0]);
  if (endR) for (let y = 1; y < 6; y++) { p.set(ox + TS - 1, oy + y, C.wood[3]); p.set(ox + TS - 2, oy + y, C.wood[2]); }
}

function paintLedge(p: Pix, tx: number, ty: number, ox: number, oy: number, endL: boolean, endR: boolean) {
  for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x;
    let d = 7 + Math.round(vnoise(wx / 4, ty, 71) * 4);
    if (endL && x < 4) d -= 4 - x;
    if (endR && x > 11) d -= x - 11;
    for (let y = 0; y < d; y++) {
      const e = Math.abs(vnoise(wx / 3, (ty * TS + y) / 3, 72) - 0.5);
      let c = y < 2 ? C.moss[2 + (y === 0 ? 1 : 0)] : y < 3 ? C.moss[1] : y > d - 3 ? C.rock[1] : C.rock[2];
      if (y >= 3 && e < 0.06) c = C.rock[0];
      p.set(ox + x, oy + y, c);
    }
    if (hash(wx, ty, 73) < 0.2) p.set(ox + x, oy - 1, C.moss[2]);
  }
}

function paintBridge(p: Pix, tx: number, ty: number, ox: number, oy: number) {
  for (let x = 0; x < TS; x++) {
    const gap = x % 8 === 7;
    for (let y = 0; y < 5; y++) if (!gap) p.set(ox + x, oy + y, y === 0 ? C.wood[4] : y < 3 ? C.wood[3] : C.wood[1]);
    p.set(ox + x, oy + 6, C.rope[1]);
    p.set(ox + x, oy - 9, C.rope[1]); p.set(ox + x, oy - 8, C.rope[0]);
  }
  for (const px of [0, 8]) for (let y = -10; y < 7; y++) p.set(ox + px + 2, oy + y, y < 0 ? C.wood[2] : C.wood[1]);
}
