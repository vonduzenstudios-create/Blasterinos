import { Pix, rgb, ramp, mix, RNG, frame, type Frame, type Ramp } from '../engine/pixel';
import { OUTLINE, LOOKS, drawHumanoid, standPose, runPose, AX, AY, buildHero, type HeroFrames } from './humanoid';
import { vnoise } from './tiles';

export interface EnemyArt {
  soldier: HeroFrames; sniper: HeroFrames;
  soldierRun: Frame[];
  turret: Frame[]; turretBase: Frame; turretClosed: Frame;
  leaper: { crouch: Frame; jump: Frame; idle: Frame[] };
  drone: Frame[];
  crawler: Frame[];
  log: Frame;
  gate: { intact: Frame; core: Frame[]; coreDead: Frame; cannon: Frame[] };
  sandbag: Frame;
}

const metal: Ramp = ramp('#2a2e3a', '#5a6074', '#9aa2b8');
const darkMetal: Ramp = ramp('#16181e', '#2e323e', '#4a5064');

function turretFrames(): { rot: Frame[]; base: Frame; closed: Frame } {
  const rot: Frame[] = [];
  const S = 32;
  const drawBase = (p: Pix) => {
    p.shape(darkMetal, (c, id) => p.rect(4, 18, 24, 14, c, id));
    p.shape(metal, (c, id) => p.ellipse(16, 18, 11, 9, c, id), 2);
    p.rect(6, 28, 20, 2, rgb('#e8c020'));
    for (let x = 6; x < 26; x += 4) p.rect(x, 28, 2, 2, rgb('#22222a'));
  };
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const p = new Pix(S, S);
    drawBase(p);
    p.shape(darkMetal, (c, id) => p.line(16, 17, 16 + Math.cos(a) * 13, 17 + Math.sin(a) * 13, c, 4, id));
    p.shape(metal, (c, id) => p.line(16 + Math.cos(a) * 3, 17 + Math.sin(a) * 3, 16 + Math.cos(a) * 12, 17 + Math.sin(a) * 12, c, 2, id));
    p.shape(ramp('#6a0a0a', '#d02020', '#ff8080'), (c, id) => p.circle(16, 17, 3, c, id), 2);
    p.set(15, 16, rgb('#ffffff'));
    p.outline(OUTLINE);
    rot.push(frame(p, 16, 32));
  }
  const b = new Pix(S, S); drawBase(b); b.outline(OUTLINE);
  const cl = new Pix(S, S); drawBase(cl);
  cl.shape(darkMetal, (c, id) => cl.rect(8, 14, 16, 4, c, id)); cl.outline(OUTLINE);
  return { rot, base: frame(b, 16, 32), closed: frame(cl, 16, 32) };
}

function leaperFrames() {
  const skin: Ramp = ramp('#1a4a2a', '#3aa04a', '#9ae060');
  const belly: Ramp = ramp('#6a5a1a', '#c8b040', '#f8f080');
  const draw = (squash: number, legsOut: number) => {
    const p = new Pix(30, 26);
    const by = 15 + squash;
    // back legs
    p.shape(ramp('#0e2a16', '#1e6030', '#3a9040'), (c, id) => {
      p.line(10, by, 4 - legsOut, by + 4 - squash, c, 3, id); p.line(4 - legsOut, by + 4 - squash, 6 - legsOut * 2, 25, c, 2, id);
    });
    p.shape(belly, (c, id) => p.ellipse(15, by + 1, 9, 6 - squash * 0.5, c, id));
    p.shape(skin, (c, id) => p.ellipse(14, by - 2, 10, 6 - squash * 0.5, c, id), 2);
    // carapace ridges
    for (let i = 0; i < 4; i++) p.line(8 + i * 4, by - 7 + squash * 0.5, 9 + i * 4, by - 4, skin[0]);
    // head
    p.shape(skin, (c, id) => p.ellipse(23, by - 3, 5, 4, c, id), 2);
    p.set(25, by - 5, rgb('#ff3030')); p.set(26, by - 5, rgb('#ffd0d0')); p.set(23, by - 5, rgb('#ff3030'));
    p.line(27, by - 1, 29, by + 1, rgb('#f0e0b0')); p.line(25, by, 27, by + 2, rgb('#f0e0b0'));
    // front legs
    p.shape(skin, (c, id) => { p.line(19, by + 2, 22 + legsOut, by + 6, c, 2, id); p.line(22 + legsOut, by + 6, 21 + legsOut, 25, c, 2, id); p.line(14, by + 3, 15, 25, c, 2, id); });
    p.outline(OUTLINE);
    return frame(p, 15, 25);
  };
  return { crouch: draw(3, 0), jump: draw(-1, 3), idle: [draw(0, 0), draw(1, 0)] };
}

function droneFrames(): Frame[] {
  return [0, 1, 2, 3].map((k) => {
    const p = new Pix(28, 22);
    p.shape(metal, (c, id) => p.ellipse(14, 10, 9, 7, c, id), 2);
    p.shape(darkMetal, (c, id) => p.rect(6, 12, 16, 4, c, id));
    p.shape(ramp('#5a0a0a', '#e02020', '#ffb0b0'), (c, id) => p.circle(14, 10, 3.5, c, id), 2);
    p.set(13, 9, rgb('#ffffff'));
    // rotor arms
    p.line(2, 4, 26, 4, darkMetal[1], 1);
    const bl = [6, 9, 12, 9][k];
    p.line(2 - bl / 3, 2, 2 + bl / 2, 2, metal[2]); p.line(26 - bl / 2, 2, 26 + bl / 3, 2, metal[2]);
    p.line(14, 3, 14, 5, darkMetal[1]);
    // thruster glow
    p.rect(11, 16, 6, 2 + (k % 2), k % 2 ? rgb('#ffd040') : rgb('#ff8a20'));
    p.outline(OUTLINE);
    return frame(p, 14, 11);
  });
}

function crawlerFrames(): Frame[] {
  const skin: Ramp = ramp('#3a1a4a', '#8a3aa0', '#d080e0');
  return [0, 1].map((k) => {
    const p = new Pix(16, 26);
    for (let i = 0; i < 4; i++) {
      const y = 20 - i * 5, x = 8 + Math.sin(i * 1.3 + k * 1.5) * 1.5;
      p.shape(skin, (c, id) => p.ellipse(x, y, 5 - i * 0.4, 3.2, c, id), 2);
      p.line(x - 6, y + (i + k) % 2, x - 4, y, skin[0]); p.line(x + 4, y, x + 6, y + (i + k + 1) % 2, skin[0]);
    }
    p.shape(ramp('#5a3a0a', '#d0a020', '#fff080'), (c, id) => p.ellipse(8, 3, 3.5, 3, c, id), 2);
    p.set(6, 2, rgb('#ff2020')); p.set(10, 2, rgb('#ff2020'));
    p.outline(OUTLINE);
    return frame(p, 8, 13);
  });
}

function logFrame(): Frame {
  const p = new Pix(44, 16);
  const wood: Ramp = ramp('#3a2212', '#6a4224', '#9a6a3a');
  p.shape(wood, (c, id) => p.rect(3, 2, 38, 12, c, id), 2);
  for (let x = 5; x < 40; x += 3) if (vnoise(x, 1, 3) > 0.5) p.line(x, 4, x + 4, 4, wood[0]);
  p.shape(ramp('#6a4224', '#c89a5a', '#e8c088'), (c, id) => p.ellipse(41, 8, 3, 6, c, id));
  p.circle(41, 8, 1.5, rgb('#8a5a2a'));
  p.ellipse(3, 8, 2.5, 6, wood[0]);
  p.rect(14, 1, 3, 2, rgb('#2a7034'));
  p.outline(OUTLINE);
  return frame(p, 22, 8);
}

function gateArt() {
  const W = 72, H = 190;
  const p = new Pix(W, H);
  const rng = new RNG(5);
  // main bulkhead
  p.shape(metal, (c, id) => p.rect(16, 0, 56, H, c, id), 2);
  for (let y = 0; y < H; y += 24) { p.rect(16, y, 56, 2, darkMetal[0]); for (let x = 20; x < 70; x += 8) { p.set(x, y + 4, metal[2]); p.set(x, y + 20, metal[0]); } }
  // rust and grime
  for (let i = 0; i < 400; i++) { const x = rng.int(17, 70), y = rng.int(0, H - 1); if (vnoise(x / 6, y / 6, 7) > 0.6) p.set(x, y, mix(p.get(x, y), rgb('#7a3a1a'), 0.5)); }
  // hazard band at bottom
  for (let y = H - 14; y < H - 4; y++) for (let x = 16; x < W; x++) p.set(x, y, ((x + y) >> 2) % 2 ? rgb('#e8c020') : rgb('#22222a'));
  // skull emblem
  p.shape(ramp('#6a0a0a', '#c02020', '#ff6060'), (c, id) => p.circle(44, 40, 10, c, id), 2);
  p.rect(39, 37, 3, 3, OUTLINE); p.rect(46, 37, 3, 3, OUTLINE); p.rect(42, 44, 4, 2, OUTLINE);
  // core housing
  p.shape(darkMetal, (c, id) => p.rect(26, 100, 36, 36, c, id), 1);
  // left pipe column
  p.shape(ramp('#3a2a1a', '#6a5030', '#9a7a48'), (c, id) => p.rect(4, 0, 12, H, c, id), 2);
  for (let y = 10; y < H; y += 30) p.shape(metal, (c, id) => p.rect(2, y, 16, 5, c, id), 1);
  p.outline(OUTLINE);
  const core = [0, 1, 2].map((k) => {
    const c = new Pix(28, 28);
    const cols = [ramp('#6a0a3a', '#e02070', '#ffb0e0'), ramp('#8a0a2a', '#ff3060', '#ffd0e0'), ramp('#4a0a2a', '#b01858', '#ff80c0')][k];
    c.shape(cols, (col, id) => c.circle(14, 14, 11, col, id), 2);
    c.circle(14, 14, 5, cols[2]); c.circle(14, 14, 2.5, rgb('#ffffff'));
    for (let a = 0; a < 8; a++) c.set(14 + Math.cos(a + k) * 8, 14 + Math.sin(a + k) * 8, cols[0]);
    c.outline(OUTLINE);
    return frame(c, 14, 14);
  });
  const dead = new Pix(28, 28);
  dead.circle(14, 14, 11, rgb('#2a1a1a')); dead.circle(14, 14, 6, rgb('#120a0a'));
  dead.outline(OUTLINE);
  const cannon = [0, 1].map((k) => {
    const c = new Pix(30, 16);
    c.shape(darkMetal, (col, id) => c.rect(14, 2, 16, 12, col, id), 1);
    c.shape(metal, (col, id) => c.rect(2 + k * 2, 5, 16, 6, col, id), 2);
    c.rect(1 + k * 2, 6, 2, 4, OUTLINE);
    c.outline(OUTLINE);
    return frame(c, 22, 8);
  });
  return { intact: frame(p, 0, 0), core, coreDead: frame(dead, 14, 14), cannon };
}

function sandbagFrame(): Frame {
  const p = new Pix(28, 14);
  const bag: Ramp = ramp('#5a4a2a', '#9a8450', '#c8b47a');
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4 - r; i++) p.shape(bag, (c, id) => p.ellipse(5 + i * 6 + r * 3, 10 - r * 5, 4, 3, c, id), 1);
  p.outline(OUTLINE);
  return frame(p, 14, 14);
}

export function buildEnemyArt(): EnemyArt {
  const t = turretFrames();
  const soldier = buildHero(LOOKS.soldier);
  return {
    soldier,
    sniper: buildHero(LOOKS.sniper),
    soldierRun: Array.from({ length: 6 }, (_, i) => frame(drawHumanoid(LOOKS.soldier, { ...runPose('f', i, 6), aim: 20 }), AX, AY)),
    turret: t.rot, turretBase: t.base, turretClosed: t.closed,
    leaper: leaperFrames(),
    drone: droneFrames(),
    crawler: crawlerFrames(),
    log: logFrame(),
    gate: gateArt(),
    sandbag: sandbagFrame(),
  };
}
export { standPose };
