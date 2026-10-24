import { Pix, ramp, rgb, type Ramp, type Frame, frame, mix } from '../engine/pixel';

// A small 2D skeleton rasterized into pixel art. Heroes and enemy soldiers are
// all drawn through this, with different looks and poses.

export interface Look {
  skin: Ramp;
  hair: Ramp;
  head: 'bandana' | 'helmet' | 'beret' | 'mask';
  headColor: Ramp;
  accent: Ramp;   // bandana tail, visor, insignia
  torso: Ramp;    // shirt / arms
  vest: Ramp;
  pants: Ramp;
  boots: Ramp;
  gun: Ramp;
  bulk: number;   // 0 = lean, 1 = heavy
  armor?: Ramp;   // shoulder pads
  plate?: boolean; // full heavy armor: chest plate, big pauldrons, thigh guards, visored helm
  bareArms?: boolean;
}

export const OUTLINE = rgb('#120d16');

export const LOOKS: Record<string, Look> = {
  ryder: {
    skin: ramp('#a8583a', '#e0905c', '#f8c08a'),
    hair: ramp('#2a1a12', '#4a3020', '#6a4630'),
    head: 'bandana',
    headColor: ramp('#8a1420', '#d8283a', '#ff6a6a'),
    accent: ramp('#8a1420', '#d8283a', '#ff6a6a'),
    torso: ramp('#a8583a', '#e0905c', '#f8c08a'),
    vest: ramp('#2a3418', '#4a5a26', '#6e8236'),
    pants: ramp('#1a2a5a', '#2e4a9a', '#4a72d0'),
    boots: ramp('#2a1a10', '#5a3a20', '#7a5a34'),
    gun: ramp('#22232c', '#4a4c5a', '#8a8ea0'),
    bulk: 0,
    bareArms: true,
  },
  voss: {
    skin: ramp('#7a4a32', '#b07050', '#d89a72'),
    hair: ramp('#1a1a1a', '#2a2a2a', '#3a3a3a'),
    head: 'helmet',
    headColor: ramp('#2a3a2a', '#4a6248', '#74906a'),
    accent: ramp('#0a6a7a', '#20c8e0', '#a0f8ff'),
    torso: ramp('#2a3a2a', '#4a6248', '#74906a'),
    vest: ramp('#3a3a48', '#62627a', '#9a9ab4'),
    pants: ramp('#22261e', '#3c4434', '#5a644c'),
    boots: ramp('#141418', '#2a2a32', '#44444e'),
    gun: ramp('#22232c', '#4a4c5a', '#8a8ea0'),
    armor: ramp('#3a3a48', '#62627a', '#9a9ab4'),
    plate: true,
    bulk: 1,
  },
  // Voss once his armor has been knocked off: fatigues, webbing and a soft cap
  vossBare: {
    skin: ramp('#7a4a32', '#b07050', '#d89a72'),
    hair: ramp('#1a1a1a', '#2a2a2a', '#3a3a3a'),
    head: 'beret',
    headColor: ramp('#1e2a1e', '#344634', '#4e664a'),
    accent: ramp('#0a6a7a', '#20c8e0', '#a0f8ff'),
    torso: ramp('#2a3a2a', '#4a6248', '#74906a'),
    vest: ramp('#26301e', '#3a4630', '#56624a'),
    pants: ramp('#22261e', '#3c4434', '#5a644c'),
    boots: ramp('#141418', '#2a2a32', '#44444e'),
    gun: ramp('#22232c', '#4a4c5a', '#8a8ea0'),
    bulk: 1,
  },
  soldier: {
    skin: ramp('#8a5a3a', '#c08860', '#e0b088'),
    hair: ramp('#1a1a1a', '#2a2a2a', '#3a3a3a'),
    head: 'helmet',
    headColor: ramp('#4a2a1a', '#7a4a28', '#a8703c'),
    accent: ramp('#6a0a0a', '#b81818', '#ff4040'),
    torso: ramp('#4a3a20', '#7a6232', '#a88a48'),
    vest: ramp('#3a2a18', '#5a4224', '#7a5c34'),
    pants: ramp('#3a3020', '#5e4e30', '#847048'),
    boots: ramp('#1a1410', '#33281c', '#4c3c2a'),
    gun: ramp('#22232c', '#4a4c5a', '#8a8ea0'),
    bulk: 0,
  },
  sniper: {
    skin: ramp('#8a5a3a', '#c08860', '#e0b088'),
    hair: ramp('#1a1a1a', '#2a2a2a', '#3a3a3a'),
    head: 'mask',
    headColor: ramp('#1a2a14', '#2e4420', '#46602e'),
    accent: ramp('#8a6a00', '#f0c020', '#fff080'),
    torso: ramp('#1e3014', '#344c22', '#4e6c32'),
    vest: ramp('#14200e', '#26381a', '#3a5228'),
    pants: ramp('#1e3014', '#344c22', '#4e6c32'),
    boots: ramp('#141410', '#26261c', '#3a3a2a'),
    gun: ramp('#22232c', '#4a4c5a', '#8a8ea0'),
    bulk: 0,
  },
};

export interface Pose {
  hipX: number; hipY: number;      // relative to the frame's foot anchor
  lean: number;                    // torso lean in degrees, + = forward
  legs: [number, number, number, number]; // back thigh, back shin, front thigh, front shin (deg from down, + = forward)
  aim: number | null;              // gun angle in degrees, 0 = forward, -90 = up, null = no gun
  arms?: 'gun' | 'up' | 'flail' | 'grip' | 'swing';
  reach?: number;                  // 'swing': which hand is ahead, -1..1
  bob?: number;
  tail?: number;                   // bandana tail flutter phase
}

const R = (deg: number) => (deg * Math.PI) / 180;
const darker = (r: Ramp): Ramp => [mix(r[0], OUTLINE, 0.35), mix(r[1], OUTLINE, 0.3), mix(r[2], OUTLINE, 0.25)];

export const CELL = 44, AX = 22, AY = 40;

/** Where the gun muzzle ends up for a pose, relative to the foot anchor. Used for bullet spawns. */
export function muzzle(pose: Pose, look: Look): [number, number] {
  const sh = shoulder(pose, look);
  const a = R(pose.aim ?? 0);
  const len = 13 + look.bulk;
  return [sh[0] + Math.cos(a) * len, sh[1] + Math.sin(a) * len];
}
function shoulder(pose: Pose, look: Look): [number, number] {
  const torsoLen = 10 + look.bulk;
  const hx = pose.hipX, hy = pose.hipY - (pose.bob ?? 0);
  return [hx + Math.sin(R(pose.lean)) * torsoLen + 1, hy - Math.cos(R(pose.lean)) * torsoLen + 2];
}

export function drawHumanoid(look: Look, pose: Pose): Pix {
  const p = new Pix(CELL, CELL);
  const ox = AX, oy = AY;
  const hx = ox + pose.hipX, hy = oy + pose.hipY - (pose.bob ?? 0);
  const thigh = 7, shin = 7 + (look.bulk ? 0 : 1);
  const legW = 3 + (look.bulk ? 1 : 0);
  const torsoLen = 10 + look.bulk;
  const lean = R(pose.lean);
  const neckX = hx + Math.sin(lean) * torsoLen, neckY = hy - Math.cos(lean) * torsoLen;

  const leg = (thighDeg: number, shinDeg: number, back: boolean, dx: number) => {
    const pants = back ? darker(look.pants) : look.pants;
    const boots = back ? darker(look.boots) : look.boots;
    const kx = hx + dx + Math.sin(R(thighDeg)) * thigh, ky = hy + Math.cos(R(thighDeg)) * thigh;
    const fx = kx + Math.sin(R(shinDeg)) * shin, fy = ky + Math.cos(R(shinDeg)) * shin;
    p.shape(pants, (c, id) => { p.line(hx + dx, hy, kx, ky, c, legW, id); p.line(kx, ky, kx + (fx - kx) * 0.55, ky + (fy - ky) * 0.55, c, legW - 0.5, id); });
    p.shape(boots, (c, id) => {
      p.line(kx + (fx - kx) * 0.5, ky + (fy - ky) * 0.5, fx, fy, c, legW, id);
      // toe points forward along the ground-ish direction
      const ta = R(shinDeg - 90);
      p.line(fx, fy, fx - Math.sin(ta) * 3, fy + Math.cos(ta) * 0.8, c, 2.4, id);
    });
    if (look.plate && look.armor) {
      const ar = back ? darker(look.armor) : look.armor;
      p.shape(ar, (c, id) => {
        p.line(hx + dx + Math.sin(R(thighDeg)) * 1.5, hy + 1, hx + dx + Math.sin(R(thighDeg)) * 5, hy + Math.cos(R(thighDeg)) * 5, c, legW + 1, id);
        p.circle(kx + Math.sin(R(thighDeg)) * 0.5 + 0.5, ky, 1.8, c, id);
      }, 2);
    }
  };

  // back arm (behind body) when holding gun two-handed
  const shr = shoulder(pose, look);
  const sh: [number, number] = [ox + shr[0], oy + shr[1]];
  const aim = pose.aim ?? 0;
  const ad = R(aim);
  const armRamp = look.bareArms ? look.skin : look.torso;
  const gripX = sh[0] + Math.cos(ad) * 4, gripY = sh[1] + Math.sin(ad) * 4 + 1;
  const foreX = sh[0] + Math.cos(ad) * 8, foreY = sh[1] + Math.sin(ad) * 8;

  const rc = pose.reach ?? 0;
  if (pose.arms === 'up') {
    p.shape(darker(armRamp), (c, id) => p.line(neckX - 1, neckY + 1, neckX + 1, neckY - 9, c, 3, id));
  } else if (pose.arms === 'swing') {
    // hand over hand: the back hand reaches ahead while the front one trails, then they swap
    p.shape(darker(armRamp), (c, id) => p.line(neckX - 1, neckY + 1, neckX + 1 + rc * 4, neckY - 9, c, 3, id));
    p.shape(darker(look.skin), (c, id) => p.circle(neckX + 1 + rc * 4, neckY - 10, 1.5, c, id));
  } else if (pose.arms === 'grip') {
    // one hand on the rail, the other on the gun
    p.shape(darker(armRamp), (c, id) => p.line(neckX - 1, neckY + 1, neckX, neckY - 9, c, 3, id));
    p.shape(darker(look.skin), (c, id) => p.circle(neckX, neckY - 10, 1.5, c, id));
  } else if (pose.arms === 'flail') {
    p.shape(darker(armRamp), (c, id) => p.line(neckX - 1, neckY + 1, neckX - 6, neckY - 6, c, 3, id));
  } else if (pose.aim !== null) {
    const bsx = neckX - 2, bsy = neckY + 2;
    p.shape(darker(armRamp), (c, id) => { p.line(bsx, bsy, (bsx + foreX) / 2, (bsy + foreY) / 2 + 2, c, 3, id); p.line((bsx + foreX) / 2, (bsy + foreY) / 2 + 2, foreX, foreY, c, 3, id); });
  }

  leg(pose.legs[0], pose.legs[1], true, -1);

  // torso
  const tw = 6 + look.bulk;
  p.shape(look.torso, (c, id) => p.line(hx, hy - 1, neckX, neckY + 2, c, tw, id), 1);
  p.shape(look.vest, (c, id) => {
    p.line(hx + Math.sin(lean) * 3, hy - 3, neckX - Math.sin(lean), neckY + 3, c, tw - 1, id);
  });
  // belt
  p.shape(ramp('#1a1410', '#3a2c1c', '#6a5434'), (c, id) => p.line(hx - tw / 2 + 1, hy - 1, hx + tw / 2 - 1, hy - 1, c, 2, id));
  p.set(hx + 1, hy - 1, rgb('#d0b060'));
  // vest straps / pouches
  p.over(hx + 1, hy - 4, look.vest[2]);
  p.over(hx - 1, hy - 5, look.vest[0]);
  if (look.plate && look.armor) {
    // chest plate over the vest, with a glowing core light
    p.shape(look.armor, (c, id) => p.line(hx + Math.sin(lean) * 3, hy - 4, neckX - Math.sin(lean), neckY + 3, c, tw + 1, id), 2);
    const mx = (hx + neckX) / 2 + 1, my = (hy + neckY) / 2 - 1;
    p.set(mx, my, look.accent[2]); p.set(mx, my + 1, look.accent[1]);
    p.over(hx - 2, hy - 3, look.armor[0]); p.over(hx + 2, hy - 3, look.armor[0]);
    p.shape(look.armor, (c, id) => p.ellipse(neckX - 0.5, neckY + 1.5, 5, 3.5, c, id), 2);
  } else if (look.armor) {
    p.shape(look.armor, (c, id) => p.ellipse(neckX, neckY + 2, 3.5, 2.5, c, id), 2);
  }

  leg(pose.legs[2], pose.legs[3], false, 1);

  // head
  const hdx = neckX + Math.sin(lean) * 4 + 1, hdy = neckY - 3;
  p.shape(look.skin, (c, id) => { p.circle(hdx, hdy, 3.5, c, id); p.rect(neckX - 1, neckY - 1, 3, 2, c, id); });
  if (look.head === 'bandana') {
    p.shape(look.hair, (c, id) => { p.ellipse(hdx - 1, hdy - 2, 3.5, 2.2, c, id); p.rect(hdx - 4, hdy - 2, 2, 4, c, id); });
    p.shape(look.headColor, (c, id) => p.line(hdx - 4, hdy - 1, hdx + 3, hdy - 2, c, 2, id));
    const ft = pose.tail ?? 0;
    p.shape(look.accent, (c, id) => {
      p.line(hdx - 4, hdy - 1, hdx - 8, hdy - 1 + Math.round(Math.sin(ft) * 1.5), c, 2, id);
      p.line(hdx - 7, hdy, hdx - 10, hdy + 1 + Math.round(Math.cos(ft) * 1.5), c, 1, id);
    });
  } else if (look.head === 'helmet' && look.plate && look.armor) {
    // heavy visored helm: wider shell, ridge on top, cheek guard, full-width visor slit
    p.shape(look.armor, (c, id) => { p.ellipse(hdx - 0.5, hdy - 1.5, 5, 3.8, c, id); p.rect(hdx - 5, hdy - 1, 3, 4, c, id); p.rect(hdx + 1, hdy + 1, 4, 2, c, id); }, 2);
    p.shape(look.headColor, (c, id) => p.line(hdx - 4, hdy - 5, hdx + 2, hdy - 5, c, 2, id));
    p.shape(look.accent, (c, id) => p.rect(hdx, hdy, 5, 1, c, id));
    p.set(hdx + 4, hdy, look.accent[2]);
  } else if (look.head === 'helmet') {
    p.shape(look.headColor, (c, id) => { p.ellipse(hdx - 0.5, hdy - 1.5, 4.5, 3.2, c, id); p.rect(hdx - 5, hdy - 1, 2, 3, c, id); }, 2);
    p.shape(look.accent, (c, id) => p.rect(hdx + 1, hdy, 3, 1, c, id));
    p.set(hdx + 3, hdy, look.accent[2]);
  } else if (look.head === 'beret') {
    p.shape(look.headColor, (c, id) => p.ellipse(hdx - 1, hdy - 2.5, 4, 2, c, id));
  } else if (look.head === 'mask') {
    p.shape(look.headColor, (c, id) => { p.circle(hdx, hdy - 0.5, 3.6, c, id); });
    p.shape(look.accent, (c, id) => p.rect(hdx + 1, hdy - 1, 3, 1, c, id));
  }
  if (look.head !== 'mask' && look.head !== 'helmet') p.set(hdx + 2, hdy, OUTLINE); // eye
  if (look.head === 'helmet' && !look.plate) p.set(hdx + 2, hdy + 1, look.skin[0]);

  // gun + front arm
  if (pose.arms === 'up') {
    p.shape(armRamp, (c, id) => p.line(neckX + 1, neckY + 1, neckX + 3, neckY - 9, c, 3, id));
    p.shape(look.skin, (c, id) => p.circle(neckX + 2, neckY - 10, 1.5, c, id));
  } else if (pose.arms === 'flail') {
    p.shape(armRamp, (c, id) => p.line(neckX + 1, neckY + 1, neckX + 6, neckY - 5, c, 3, id));
  } else if (pose.arms === 'swing') {
    p.shape(armRamp, (c, id) => p.line(neckX + 1, neckY + 1, neckX + 1 - rc * 4, neckY - 9, c, 3, id));
    p.shape(look.skin, (c, id) => p.circle(neckX + 1 - rc * 4, neckY - 10, 1.5, c, id));
  } else if (pose.aim !== null) {
    const len = 12 + look.bulk;
    const gx = sh[0] - Math.cos(ad) * 2, gy = sh[1] - Math.sin(ad) * 2;
    const ex = sh[0] + Math.cos(ad) * len, ey = sh[1] + Math.sin(ad) * len;
    p.shape(look.gun, (c, id) => {
      p.line(gx, gy, ex, ey, c, 2 + look.bulk, id);
      // magazine
      const mx = sh[0] + Math.cos(ad) * 5, my = sh[1] + Math.sin(ad) * 5;
      p.line(mx, my, mx - Math.sin(ad) * 3, my + Math.cos(ad) * 3, c, 2, id);
    });
    p.set(ex, ey, look.gun[2]);
    // front arm: shoulder -> grip
    p.shape(armRamp, (c, id) => { p.line(neckX + 1, neckY + 1, gripX - 1, gripY + 2, c, 3, id); p.line(gripX - 1, gripY + 2, gripX, gripY, c, 3, id); });
    p.shape(look.skin, (c, id) => p.circle(gripX, gripY, 1.2, c, id));
    if (look.armor) p.shape(look.armor, (c, id) => look.plate ? p.ellipse(neckX + 1, neckY + 1, 4, 3, c, id) : p.ellipse(neckX + 1, neckY + 1, 2.5, 2, c, id), 2);
  }
  p.outline(OUTLINE);
  return p;
}

export function rot90(src: Pix, times: number): Pix {
  let cur = src;
  for (let k = 0; k < ((times % 4) + 4) % 4; k++) {
    const n = new Pix(cur.h, cur.w);
    for (let y = 0; y < cur.h; y++) for (let x = 0; x < cur.w; x++) n.data[x * n.w + (cur.h - 1 - y)] = cur.data[y * cur.w + x];
    cur = n;
  }
  return cur;
}

/** Curled-up somersault ball. */
function drawCurl(look: Look): Pix {
  const p = new Pix(24, 24);
  const c = 12;
  p.shape(look.pants, (col, id) => { p.circle(c + 2, c + 3, 5, col, id); });
  p.shape(look.boots, (col, id) => { p.circle(c + 6, c + 6, 2.5, col, id); p.circle(c - 1, c + 7, 2.2, col, id); });
  p.shape(look.vest, (col, id) => p.circle(c - 2, c - 1, 5, col, id), 1);
  if (look.plate && look.armor) p.shape(look.armor, (col, id) => { p.circle(c - 3, c - 1, 5.5, col, id); p.ellipse(c - 1, c - 5, 3.5, 2.5, col, id); }, 2);
  p.shape(look.bareArms ? look.skin : look.torso, (col, id) => p.line(c - 4, c + 2, c + 3, c + 1, col, 3, id));
  p.shape(look.gun, (col, id) => p.line(c - 6, c + 4, c + 5, c - 2, col, 2, id));
  p.shape(look.skin, (col, id) => p.circle(c + 1, c - 6, 3.4, col, id));
  if (look.head === 'bandana') {
    p.shape(look.hair, (col, id) => p.ellipse(c - 1, c - 7, 3, 2, col, id));
    p.shape(look.headColor, (col, id) => p.line(c - 2, c - 7, c + 4, c - 7, col, 2, id));
    p.shape(look.accent, (col, id) => p.line(c - 3, c - 7, c - 7, c - 9, col, 2, id));
  } else if (look.head === 'beret') {
    p.shape(look.headColor, (col, id) => p.ellipse(c, c - 8, 3.6, 2, col, id));
  } else {
    p.shape(look.plate && look.armor ? look.armor : look.headColor, (col, id) => p.ellipse(c + 0.5, c - 7, 4, 3, col, id), 2);
    p.shape(look.accent, (col, id) => p.rect(c + 2, c - 6, 3, 1, col, id));
  }
  p.outline(OUTLINE);
  return p;
}

export interface HeroFrames {
  stand: Record<string, Frame>;   // keyed by aim: f, uf, u, df, d
  run: Record<string, Frame[]>;   // f, uf, df
  air: Record<string, Frame>;     // f, uf, u, df, d
  prone: Frame;
  curl: Frame[];
  hang: Frame;
  /** Hanging from a rail by one hand, gun in the other, keyed by aim: f, uf, u, df, d. */
  hangAim: Record<string, Frame>;
  /** Climbing along a rail hand over hand. */
  hangMove: Frame[];
  hurt: Frame;
  dead: Frame;
  /** Pieces of plate that fly off when the armor is knocked away (empty without plate armor). */
  bits: Frame[];
}

export const AIMS: Record<string, number> = { f: 0, uf: -45, u: -90, df: 45, d: 90 };

export function standPose(aim: string): Pose {
  const a = AIMS[aim];
  return { hipX: -1, hipY: -15, lean: aim === 'u' ? -4 : aim === 'd' ? 8 : 2, legs: aim === 'd' ? [-22, -8, 22, 10] : [-14, -6, 16, 8], aim: a };
}
export function runPose(aim: string, i: number, n: number, tail = 0): Pose {
  const ph = (i / n) * Math.PI * 2;
  const s = Math.sin(ph), c = Math.cos(ph);
  const front = 34 * s, back = -34 * s;
  const fShin = front - 10 - 52 * Math.max(0, -c);
  const bShin = back - 10 - 52 * Math.max(0, c);
  return { hipX: 0, hipY: -15, lean: 9, legs: [back, bShin, front, fShin], aim: AIMS[aim], bob: Math.abs(c) > 0.7 ? 0 : 1, tail: tail + i };
}
export function airPose(aim: string): Pose {
  return { hipX: 0, hipY: -16, lean: 3, legs: [-28, -8, 38, 8], aim: AIMS[aim], tail: 2 };
}
/** Feet hang this far below the rail's center line. */
export const HANG_DROP = 36;
export function hangPose(aim: string): Pose {
  return { hipX: 0, hipY: -16, lean: 0, legs: [-4, 6, 8, 14], aim: AIMS[aim], arms: 'grip' };
}
export function pronePose(): Pose {
  return { hipX: -9, hipY: -3, lean: 90, legs: [-90, -90, -88, -92], aim: 0 };
}

export function buildHero(look: Look): HeroFrames {
  const f = (pose: Pose) => frame(drawHumanoid(look, pose), AX, AY);
  const stand: Record<string, Frame> = {};
  for (const a of ['f', 'uf', 'u', 'df', 'd']) stand[a] = f(standPose(a));
  const run: Record<string, Frame[]> = {};
  for (const a of ['f', 'uf', 'df']) run[a] = Array.from({ length: 6 }, (_, i) => f(runPose(a, i, 6)));
  const air: Record<string, Frame> = {};
  for (const a of ['f', 'uf', 'u', 'df', 'd']) air[a] = f(airPose(a));
  const curlBase = drawCurl(look);
  const curl = [0, 1, 2, 3].map((k) => frame(rot90(curlBase, k), 12, 12));
  return {
    stand, run, air, curl,
    prone: frame(drawProne(look), 22, 40),
    hang: f({ hipX: 0, hipY: -16, lean: 0, legs: [-6, 4, 10, 18], aim: null, arms: 'up' }),
    hangAim: Object.fromEntries(['f', 'uf', 'u', 'df', 'd'].map((a) => [a, f(hangPose(a))])),
    hangMove: [1, 0.3, -1, -0.3].map((r, i) => f({ hipX: 0, hipY: -16, lean: 0, legs: i % 2 ? [-8, 2, 10, 20] : [4, 16, -4, 6], aim: null, arms: 'swing', reach: r })),
    hurt: f({ hipX: 0, hipY: -16, lean: -25, legs: [-30, -10, 20, 40], aim: null, arms: 'flail' }),
    dead: frame(drawDead(look), 22, 40),
    bits: look.plate && look.armor ? armorBits(look.armor, look.accent) : [],
  };
}

/** Loose armor pieces: a pauldron, the chest plate, the helm shell and a thigh guard. */
function armorBits(ar: Ramp, accent: Ramp): Frame[] {
  const bit = (w: number, h: number, draw: (p: Pix, c: number, id: number) => void, extra?: (p: Pix) => void) => {
    const p = new Pix(w, h);
    p.shape(ar, (c, id) => draw(p, c, id), 2);
    extra?.(p);
    p.outline(OUTLINE);
    return frame(p, w / 2, h / 2);
  };
  return [
    bit(12, 9, (p, c, id) => p.ellipse(6, 4.5, 4.5, 3, c, id)),
    bit(11, 12, (p, c, id) => { p.rect(2, 2, 7, 7, c, id); p.ellipse(5.5, 8, 3.5, 2, c, id); }, (p) => { p.set(5, 5, accent[2]); p.set(5, 6, accent[1]); }),
    bit(13, 10, (p, c, id) => { p.ellipse(6.5, 5, 5, 3.5, c, id); }, (p) => { for (let x = 6; x < 11; x++) p.over(x, 6, accent[1]); }),
    bit(8, 10, (p, c, id) => p.rect(2, 2, 4, 6, c, id)),
  ];
}

/** Lying flat, rifle forward. Drawn directly rather than posed so it reads clearly. */
function drawProne(look: Look): Pix {
  const p = new Pix(CELL, CELL);
  const y = AY - 3;
  p.shape(darker(look.pants), (c, id) => p.line(AX - 16, y + 1, AX - 7, y + 1, c, 3, id));
  p.shape(darker(look.boots), (c, id) => p.line(AX - 19, y + 1, AX - 16, y, c, 3, id));
  p.shape(look.pants, (c, id) => p.line(AX - 15, y, AX - 6, y, c, 3, id));
  p.shape(look.boots, (c, id) => { p.line(AX - 18, y, AX - 15, y - 1, c, 3, id); p.set(AX - 19, y - 3, c, id); p.set(AX - 18, y - 3, c, id); });
  p.shape(look.torso, (c, id) => p.line(AX - 6, y - 1, AX + 3, y - 2, c, 5 + look.bulk, id));
  p.shape(look.vest, (c, id) => p.line(AX - 5, y - 1, AX + 2, y - 2, c, 4 + look.bulk, id));
  if (look.plate && look.armor) p.shape(look.armor, (c, id) => { p.line(AX - 5, y - 2, AX + 2, y - 3, c, 5 + look.bulk, id); p.ellipse(AX + 2, y - 3, 3.5, 2.5, c, id); }, 2);
  p.shape(look.skin, (c, id) => p.circle(AX + 7, y - 4, 3.4, c, id));
  if (look.head === 'bandana') {
    p.shape(look.hair, (c, id) => p.ellipse(AX + 6, y - 6, 3.3, 2, c, id));
    p.shape(look.headColor, (c, id) => p.line(AX + 3, y - 5, AX + 10, y - 6, c, 2, id));
    p.shape(look.accent, (c, id) => { p.line(AX + 3, y - 5, AX - 1, y - 6, c, 2, id); p.line(AX - 1, y - 6, AX - 4, y - 5, c, 1, id); });
    p.set(AX + 9, y - 4, OUTLINE);
  } else if (look.head === 'beret') {
    p.shape(look.headColor, (c, id) => p.ellipse(AX + 6, y - 6.5, 3.8, 2, c, id));
    p.set(AX + 9, y - 4, OUTLINE);
  } else {
    p.shape(look.plate && look.armor ? look.armor : look.headColor, (c, id) => p.ellipse(AX + 6.5, y - 5.5, 4.3, 3, c, id), 2);
    p.shape(look.accent, (c, id) => p.rect(AX + 8, y - 4, 3, 1, c, id));
  }
  p.shape(look.gun, (c, id) => { p.line(AX + 3, y - 1, AX + 17, y - 1, c, 2 + look.bulk, id); p.line(AX + 8, y, AX + 8, y + 2, c, 2, id); });
  p.shape(look.bareArms ? look.skin : look.torso, (c, id) => p.line(AX + 1, y + 1, AX + 7, y, c, 3, id));
  p.outline(OUTLINE);
  return p;
}

function drawDead(look: Look): Pix {
  const p = new Pix(CELL, CELL);
  const y = AY - 2;
  p.shape(look.pants, (c, id) => { p.line(AX - 2, y, AX + 8, y - 1, c, 3, id); p.line(AX + 8, y - 1, AX + 12, y - 3, c, 3, id); });
  p.shape(look.boots, (c, id) => p.line(AX + 12, y - 3, AX + 15, y - 4, c, 3, id));
  p.shape(look.torso, (c, id) => p.line(AX - 10, y, AX - 2, y, c, 5 + look.bulk, id));
  p.shape(look.vest, (c, id) => p.line(AX - 9, y, AX - 3, y, c, 4, id));
  p.shape(look.skin, (c, id) => p.circle(AX - 14, y - 1, 3.4, c, id));
  if (look.head === 'bandana') p.shape(look.headColor, (c, id) => p.line(AX - 15, y - 4, AX - 12, y + 2, c, 2, id));
  else p.shape(look.headColor, (c, id) => p.ellipse(AX - 15, y - 1, 3, 4, c, id), 2);
  p.shape(look.bareArms ? look.skin : look.torso, (c, id) => p.line(AX - 8, y + 1, AX - 12, y + 1, c, 3, id));
  p.outline(OUTLINE);
  return p;
}
