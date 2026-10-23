import { Pix, rgb, ramp, mix, frame, type Frame, type Ramp } from '../engine/pixel';
import { OUTLINE } from './humanoid';
import { vnoise, hash } from './tiles';

// The stage boss: a three-headed hydra that rises out of the lake above the falls.
// Its body sits in the background; heads, necks and claws are in the playfield.

export interface HydraArt {
  body: Frame;
  core: Frame[];
  coreShell: Frame;
  neck: Frame; neckBelly: Frame;
  head: Frame[];     // 0 closed, 1 half, 2 open
  stump: Frame;
  claw: Frame[];     // 0 raised (open talons), 1 slam (closed)
  forearm: Frame;
}

const skin: Ramp = ramp('#0c2626', '#1c5048', '#358a70');
const skinHi = rgb('#7ad0a0');
const SKIN5 = [rgb('#081c1e'), rgb('#0f3434'), rgb('#1c5048'), rgb('#2c7462'), rgb('#4aa07a'), rgb('#86d4a0')];
const BELLY5 = [rgb('#3a2a10'), rgb('#6a5020'), rgb('#a8883a'), rgb('#d4b862'), rgb('#f4e49a')];
/** Overlapping fish-scale pattern used as a shading offset. */
function scalePat(step: number) {
  return (x: number, y: number) => {
    const row = Math.floor(y / (step * 0.7));
    const lx = (x + (row % 2) * step / 2) % step - step / 2, ly = y - row * step * 0.7;
    const r = Math.hypot(lx, ly + step * 0.15) / (step * 0.62);
    return r > 0.85 && r < 1.1 && ly > step * 0.15 ? -1 : r < 0.35 ? 1 : 0;
  };
}
function vshape(p: Pix, cols: number[], draw: (c: number, id: number) => void, step = 0, flat = 1) {
  const id = p.newPart();
  draw(cols[2], id);
  p.volume(id, cols, { pattern: step ? scalePat(step) : undefined, flat });
}
const belly: Ramp = ramp('#5a4418', '#a8883a', '#e0c86a');
const mouth = [rgb('#3a0612'), rgb('#8a1028'), rgb('#d03048')];
const tooth = ramp('#9a9078', '#e8e0c8', '#ffffff');
const eye = [rgb('#ff8a10'), rgb('#ffe040'), rgb('#fffff0')];

function scales(p: Pix, x0: number, y0: number, x1: number, y1: number, darkC: number, lightC: number, step = 5) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const c = p.get(x, y);
    if (c === 0 || c === OUTLINE) continue;
    const row = Math.floor(y / step);
    const sx = (x + (row % 2) * (step / 2)) % step;
    const sy = y % step;
    // little arcs: dark at the bottom of each scale, light at the top
    if (sy === step - 1 && sx > 0 && sx < step - 1) p.set(x, y, darkC);
    else if (sy === 0 && sx === Math.floor(step / 2)) p.set(x, y, lightC);
  }
}

function head(open: number): Frame {
  const W = 72, H = 56;
  const p = new Pix(W, H);
  const hx = 22, hy = 22;
  // lower jaw rotates around the hinge
  const a = open * 0.55;
  const rot = (x: number, y: number): [number, number] => {
    const dx = x - hx, dy = y - (hy + 6);
    return [hx + dx * Math.cos(a) - dy * Math.sin(a), hy + 6 + dx * Math.sin(a) + dy * Math.cos(a)];
  };
  // mouth interior
  if (open > 0) {
    p.poly([[hx, hy + 4], [62, 22], ...[rot(60, 30), rot(hx, hy + 10)]] as [number, number][], mouth[1]);
    p.poly([[hx + 4, hy + 6], [50, 24], rot(48, 28)] as [number, number][], mouth[0]);
    // tongue
    p.line(hx + 8, hy + 8, ...rot(52, 30), mouth[2], 2);
  }
  // lower jaw
  const jaw: [number, number][] = [rot(hx - 4, hy + 4), rot(40, hy + 6), rot(62, 30), rot(60, 34), rot(hx + 4, hy + 16), rot(hx - 6, hy + 12)];
  p.shape(skin, (c, id) => p.poly(jaw, c, id), 1);
  const jawBelly: [number, number][] = [rot(hx + 2, hy + 12), rot(58, 33), rot(hx + 4, hy + 16)];
  p.shape(belly, (c, id) => p.poly(jawBelly, c, id));
  for (let i = 0; i < 7; i++) { // lower teeth
    const [tx, ty] = rot(30 + i * 4.5, hy + 7 + i * 0.3);
    p.line(tx, ty, tx + 1, ty - 3, tooth[1]);
  }
  // skull + upper jaw
  vshape(p, SKIN5, (c, id) => {
    p.ellipse(hx, hy, 17, 13, c, id);
    p.poly([[hx, hy - 10], [44, hy - 6], [64, hy - 1], [66, hy + 3], [62, hy + 6], [hx, hy + 8]], c, id);
  }, 5);
  // brow ridge, horns and frill
  p.shape(ramp('#081a1a', '#123a34', '#1e5a4c'), (c, id) => p.poly([[hx - 2, hy - 12], [hx + 18, hy - 8], [hx + 24, hy - 4], [hx + 6, hy - 6]], c, id));
  p.shape(tooth, (c, id) => {
    p.line(hx - 6, hy - 9, hx - 18, hy - 18, c, 3, id); p.line(hx - 18, hy - 18, hx - 22, hy - 16, c, 2, id);
    p.line(hx - 10, hy - 4, hx - 22, hy - 6, c, 3, id);
  }, 1);
  for (let i = 0; i < 5; i++) {
    const fx = hx - 14 + i * 2, fy = hy + 4 + i * 4;
    p.shape(ramp('#5a0a2a', '#a02050', '#e0508a'), (c, id) => p.poly([[fx, fy], [fx - 9, fy + 1], [fx, fy + 4]], c, id));
  }
  // nostril
  p.set(60, hy - 1, OUTLINE); p.set(59, hy - 1, OUTLINE);
  // upper teeth
  for (let i = 0; i < 8; i++) { const tx = 30 + i * 4.2, ty = hy + 6 + i * 0.2; p.line(tx, ty, tx + 1, ty + (open > 0 ? 4 : 2), tooth[1]); }
  // eye
  p.ellipse(hx + 12, hy - 4, 4, 3, eye[0]);
  p.ellipse(hx + 12, hy - 4.5, 3, 2, eye[1]);
  p.set(hx + 13, hy - 5, eye[2]);
  p.line(hx + 12, hy - 7, hx + 12, hy - 2, OUTLINE);
  p.outline(OUTLINE);
  return frame(p, 18, 26);
}

function neckSeg(withBelly: boolean): Frame {
  const p = new Pix(30, 30);
  vshape(p, SKIN5, (c, id) => p.circle(15, 15, 13, c, id), 5);
  if (withBelly) vshape(p, BELLY5, (c, id) => p.ellipse(15, 21, 9, 5, c, id), 0);
  // dorsal spike
  p.shape(ramp('#5a0a2a', '#a02050', '#e0508a'), (c, id) => p.poly([[10, 4], [15, -2], [19, 4]], c, id));
  p.outline(OUTLINE);
  return frame(p, 15, 15);
}

function body(): Frame {
  const W = 340, H = 200;
  const p = new Pix(W, H);
  const cx = W / 2;
  // shoulders + torso rising from the water line (bottom)
  vshape(p, SKIN5, (c, id) => {
    p.ellipse(cx, 150, 150, 110, c, id);
    p.ellipse(cx - 90, 100, 60, 50, c, id);
    p.ellipse(cx + 90, 100, 60, 50, c, id);
    p.ellipse(cx, 70, 70, 60, c, id);
  }, 9, 0.6);
  vshape(p, BELLY5, (c, id) => p.ellipse(cx, 150, 70, 90, c, id), 0, 0.7);
  // belly plates
  for (let y = 70; y < H; y += 10) for (let x = cx - 70; x < cx + 70; x++) if (p.get(x, y) !== 0 && Math.abs(x - cx) < 70 * Math.sqrt(Math.max(0, 1 - ((y - 150) / 90) ** 2))) p.set(x, y, belly[0]);
  // spines along shoulders
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const bx = cx + Math.cos(a) * 140, by = 120 + Math.sin(a) * 90;
    p.shape(ramp('#5a0a2a', '#a02050', '#e0508a'), (c, id) => p.poly([[bx - 6, by + 4], [bx + Math.cos(a) * 18, by + Math.sin(a) * 18], [bx + 6, by + 4]], c, id));
  }
  // core socket in the chest
  p.shape(ramp('#2a0a1a', '#4a1028', '#6a1a3a'), (c, id) => p.ellipse(cx, 112, 26, 22, c, id), 2);
  // wet sheen streaks
  for (let x = 0; x < W; x += 1) if (hash(x, 1, 3) < 0.04) for (let y = 40; y < H; y++) if (vnoise(x, y / 12, 4) > 0.65) p.over(x, y, mix(p.get(x, y), rgb('#a0e0e0'), 0.25));
  p.outline(OUTLINE);
  return frame(p, W / 2, H);
}

function core(k: number): Frame {
  const p = new Pix(40, 36);
  const cols = [ramp('#6a0a3a', '#e02070', '#ffb0e0'), ramp('#8a0a2a', '#ff3060', '#ffd0e0'), ramp('#4a0a2a', '#b01858', '#ff80c0')][k];
  p.shape(cols, (c, id) => p.ellipse(20, 18, 16, 14, c, id), 2);
  p.ellipse(20, 18, 8, 7, cols[2]);
  p.ellipse(20, 18, 3, 6, rgb('#1a0008'));
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + k; p.line(20 + Math.cos(a) * 9, 18 + Math.sin(a) * 8, 20 + Math.cos(a) * 14, 18 + Math.sin(a) * 12, cols[0]); }
  p.outline(OUTLINE);
  return frame(p, 20, 18);
}
function coreShell(): Frame {
  const p = new Pix(56, 48);
  vshape(p, BELLY5, (c, id) => { p.ellipse(28, 24, 26, 22, c, id); });
  for (let y = 4; y < 46; y += 7) p.line(4, y, 52, y, belly[0]);
  p.line(28, 2, 28, 46, belly[0]);
  p.outline(OUTLINE);
  return frame(p, 28, 24);
}

function stump(): Frame {
  const p = new Pix(30, 30);
  vshape(p, SKIN5, (c, id) => p.circle(15, 15, 13, c, id), 5);
  p.shape(ramp('#4a0a10', '#8a1a20', '#d04040'), (c, id) => p.ellipse(22, 15, 6, 10, c, id));
  p.ellipse(23, 15, 3, 6, rgb('#f0e0c0'));
  p.outline(OUTLINE);
  return frame(p, 15, 15);
}

function claw(open: boolean): Frame {
  const W = 96, H = 88;
  const p = new Pix(W, H);
  // palm
  vshape(p, SKIN5, (c, id) => p.ellipse(48, 30, 30, 22, c, id), 6);
  // three talons + thumb
  const talons = open ? [[-0.9, 44], [-0.3, 50], [0.3, 50], [0.9, 44]] : [[-0.35, 46], [-0.12, 52], [0.12, 52], [0.35, 46]];
  for (const [ang, len] of talons) {
    const a = Math.PI / 2 + ang;
    const bx = 48 + Math.cos(a) * 18, by = 30 + Math.sin(a) * 14;
    const ex = 48 + Math.cos(a) * len, ey = 30 + Math.sin(a) * len;
    vshape(p, SKIN5, (c, id) => p.line(bx, by, ex, ey, c, 9, id), 0);
    const tx = ex + Math.cos(a) * 14, ty = ey + Math.sin(a) * 16;
    p.shape(tooth, (c, id) => p.poly([[ex - 5, ey - 1], [tx, ty], [ex + 5, ey - 1]], c, id), 1);
  }
  p.outline(OUTLINE);
  return frame(p, 48, 20);
}

function forearm(): Frame {
  const p = new Pix(44, 120);
  vshape(p, SKIN5, (c, id) => p.rect(6, 0, 32, 120, c, id), 6, 0.9);
  for (let y = 10; y < 120; y += 22) p.shape(ramp('#5a0a2a', '#a02050', '#e0508a'), (c, id) => p.poly([[6, y], [-0, y + 8], [6, y + 12]], c, id));
  p.outline(OUTLINE);
  return frame(p, 22, 0);
}

export function buildHydra(): HydraArt {
  return {
    body: body(), core: [core(0), core(1), core(2)], coreShell: coreShell(),
    neck: neckSeg(false), neckBelly: neckSeg(true),
    head: [head(0), head(0.5), head(1)], stump: stump(),
    claw: [claw(true), claw(false)], forearm: forearm(),
  };
}
