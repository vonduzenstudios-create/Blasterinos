import { Pix, rgb, mix } from '../engine/pixel';
import { hash, vnoise, T, TS } from './tiles';

// Stage 3 tiles: pale beach sand, coral reef rock and the wooden pier.

const SAND = [rgb('#7a5a36'), rgb('#a8844e'), rgb('#cfae6e'), rgb('#e8cc8c'), rgb('#f8e4b0'), rgb('#fff8e0')];
const WET = [rgb('#5a4a34'), rgb('#7a6648'), rgb('#9a845e')];
const REEF = [rgb('#3a1a2a'), rgb('#6a2e40'), rgb('#9a4a56'), rgb('#c46e6a'), rgb('#e6a08a'), rgb('#ffd0b0')];
const WOOD = [rgb('#2a1a10'), rgb('#4a3020'), rgb('#6e4a2e'), rgb('#94683e'), rgb('#b88a54'), rgb('#dcb27a')];

export function paintBeachTile(p: Pix, t: number, tx: number, ty: number, ox: number, oy: number,
  top: boolean, left: boolean, right: boolean, endL: boolean, endR: boolean) {
  if (t === T.BEACH) paintBeach(p, tx, ty, ox, oy, top, left, right);
  else if (t === T.REEF) paintReef(p, tx, ty, ox, oy, top, left, right);
  else paintDock(p, tx, ty, ox, oy, endL, endR);
}

function paintBeach(p: Pix, tx: number, ty: number, ox: number, oy: number, top: boolean, left: boolean, right: boolean) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x, wy = ty * TS + y;
    // fine pale sand, getting damp and darker toward the water table
    const n = vnoise(wx / 3, wy / 3, 301) * 0.55 + hash(wx, wy, 302) * 0.45;
    let k = n > 0.8 ? 4 : n > 0.45 ? 3 : n > 0.2 ? 2 : 1;
    const depth = (ty - 27) * TS + y;
    if (depth > 30 && hash(wx, wy, 303) < Math.min(0.7, (depth - 30) / 50)) k--;
    let c = SAND[Math.max(0, k)];
    if (depth > 46 && vnoise(wx / 6, wy / 4, 304) > 0.6) c = WET[k > 2 ? 2 : 1];
    p.set(ox + x, oy + y, c);
  }
  // bits of shell
  if (hash(tx, ty, 305) < 0.25) {
    const bx = ox + 2 + Math.floor(hash(tx, ty, 306) * 11), by = oy + 5 + Math.floor(hash(tx, ty, 307) * 8);
    const pink = hash(tx, ty, 308) < 0.5;
    p.rect(bx, by, 3, 2, pink ? rgb('#f0b0a8') : rgb('#fff4e8'));
    p.set(bx + 1, by + 1, pink ? rgb('#c07070') : rgb('#c8b8a0'));
  }
  if (left) for (let y = 0; y < TS; y++) { p.set(ox, oy + y, SAND[0]); p.set(ox + 1, oy + y, SAND[1]); }
  if (right) for (let y = 0; y < TS; y++) p.set(ox + TS - 1, oy + y, SAND[1]);
  if (top) {
    for (let x = 0; x < TS; x++) {
      const wx = tx * TS + x;
      const d = 2 + Math.round(vnoise(wx / 6, ty, 309) * 2);
      for (let y = 0; y < d; y++) p.set(ox + x, oy + y, y === 0 ? SAND[5] : SAND[4]);
      if (hash(wx, ty, 310) < 0.1) p.set(ox + x, oy - 1, SAND[4]);
    }
    // footprints and the odd starfish-shaped dimple
    if (hash(tx, ty, 311) < 0.3) { const fx = ox + 3 + Math.floor(hash(tx, ty, 312) * 9); p.rect(fx, oy + 3, 3, 2, SAND[2]); p.rect(fx + 4, oy + 5, 3, 2, SAND[2]); }
    // beach grass
    if (hash(tx, ty, 313) < 0.12) {
      const sx = ox + 3 + Math.floor(hash(tx, ty, 314) * 10);
      for (let i = 0; i < 5; i++) { p.set(sx - i * 0.6, oy - 1 - i, rgb('#6a8a3a')); p.set(sx + i * 0.8, oy - 1 - Math.floor(i * 0.8), rgb('#8aaa4a')); }
      p.set(sx, oy - 5, rgb('#b8c86a'));
    }
  }
}

function paintReef(p: Pix, tx: number, ty: number, ox: number, oy: number, top: boolean, left: boolean, right: boolean) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x, wy = ty * TS + y;
    // porous coral rock: bubbly cells with dark pits
    const n = vnoise(wx / 5, wy / 5, 321);
    const cell = vnoise(wx / 2.5, wy / 2.5, 322);
    let k = n < 0.35 ? 1 : n < 0.65 ? 2 : 3;
    if (cell > 0.78) k = 0;
    else if (cell > 0.7) k = Math.min(4, k + 1);
    p.set(ox + x, oy + y, REEF[k]);
  }
  if (left) for (let y = 0; y < TS; y++) p.set(ox, oy + y, REEF[4]);
  if (right) for (let y = 0; y < TS; y++) { p.set(ox + TS - 1, oy + y, REEF[0]); p.set(ox + TS - 2, oy + y, REEF[1]); }
  if (top) {
    for (let x = 0; x < TS; x++) {
      const wx = tx * TS + x;
      const d = 2 + Math.round(vnoise(wx / 3, ty, 323) * 2);
      for (let y = 0; y < d; y++) p.set(ox + x, oy + y, y === 0 ? REEF[5] : REEF[4]);
      // green weed hanging off the lip
      if (hash(wx, ty, 324) < 0.18) for (let y = d; y < d + 2 + hash(wx, ty, 325) * 4; y++) p.set(ox + x, oy + y, rgb('#3a7a4a'));
    }
    // a little coral fan or tube on top
    if (hash(tx, ty, 326) < 0.3) {
      const sx = ox + 3 + Math.floor(hash(tx, ty, 327) * 10);
      const col = hash(tx, ty, 328) < 0.5 ? rgb('#ff7a9a') : rgb('#ffb040');
      for (let i = 0; i < 4; i++) { p.set(sx, oy - 1 - i, col); if (i > 1) { p.set(sx - (i - 1), oy - i, col); p.set(sx + (i - 1), oy - i, col); } }
      p.set(sx, oy - 5, mix(col, rgb('#ffffff'), 0.5));
    }
  }
}

function paintDock(p: Pix, tx: number, ty: number, ox: number, oy: number, endL: boolean, endR: boolean) {
  // weathered boardwalk: planks running across, two stringers underneath
  for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x;
    const seam = wx % 8 === 0;
    for (let y = 0; y < 5; y++) {
      let c = y === 0 ? WOOD[5] : y === 1 ? WOOD[4] : y < 4 ? WOOD[3] : WOOD[1];
      if (seam) c = WOOD[1];
      else if (y > 0 && y < 4 && vnoise(wx / 3, y * 2, 331 + (wx >> 3)) > 0.72) c = WOOD[2];
      p.set(ox + x, oy + y, c);
    }
    if ((wx >> 3) % 2 === 0 && x % 8 === 4) { p.set(ox + x, oy + 2, rgb('#3a3a40')); } // nail heads
    // stringer beam
    p.set(ox + x, oy + 5, WOOD[1]); p.set(ox + x, oy + 6, WOOD[2]); p.set(ox + x, oy + 7, WOOD[0]);
  }
  // cross brace under every other tile
  if (tx % 2 === 0) for (let i = 0; i < 7; i++) { p.set(ox + 4 + i, oy + 8 + i, WOOD[2]); p.set(ox + 5 + i, oy + 8 + i, WOOD[1]); }
  if (endL) for (let y = 0; y < 8; y++) p.set(ox, oy + y, WOOD[0]);
  if (endR) for (let y = 0; y < 8; y++) { p.set(ox + TS - 1, oy + y, WOOD[0]); p.set(ox + TS - 2, oy + y, WOOD[2]); }
}
