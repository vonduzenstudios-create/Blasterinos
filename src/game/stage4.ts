import * as THREE from 'three';
import { Gfx, Parallax, tex, VW, VH, type Sprite } from '../engine/gfx';
import type { Frame } from '../engine/pixel';
import { TS, vnoise } from '../art/tiles';
import { paintSnowChunk, ST } from '../art/snow';
import type { Game } from './game';
import type { Stage, Deck } from './stage';
import type { Hittable } from './weapons';
import { World, CHUNK, type Body } from './world';
import type { Spawn, SpawnKind, Scenery } from './level';
import { splash } from './effects';
import { Grenadier, HillSpawner, ThinIce } from './snowfoes';
import { Walker } from './walker';
import { SNOW_SONG, WALKER_SONG } from './snowmusic';

// Stage 4: "Snowland". Rolling snowy hills with ice boulders and ski troopers
// coming down them, an icy downhill, a frozen lake of floes and thin ice, and an
// arctic outpost at the end, guarded by the Glacier Walker.

export const MAP_W = 420, MAP_H = 40;
const ARENA_X = 396 * TS;
const ARENA_ROW = 27;
const ARENA_FLOOR = ARENA_ROW * TS;
const ARENA_CAM_Y = ARENA_FLOOR - 176;
const MAX_CAM_Y = MAP_H * TS - VH;
const LAKE_Y = 31 * TS;
const CP1_CAM = 214 * TS;
/** How well boots hold on ice (1 = full grip). */
const ICE_GRIP = 0.05;

// The ground is a smooth height field (tile x, surface row) with gaps for the pits
// and the lake, plus ordinary tiles for rocks, ice blocks, floes and log bridges.
const KNOTS: [number, number][] = [
  [0, 30], [12, 30], [20, 27], [28, 28], [36, 25], [44, 26], [54, 23], [62, 25], [70, 25],
  [75, 27], [84, 27], [102, 16], [113, 15], [124, 21], [138, 28], [146, 30], [155, 30],
  [216, 29], [226, 29], [236, 24], [246, 24], [256, 28], [266, 28], [278, 21], [290, 21], [300, 26],
  [305, 27], [318, 27], [332, 19], [341, 19], [352, 25], [364, 25], [374, 22], [384, 27], [MAP_W, ARENA_ROW],
];
const GAPS: [number, number][] = [[71, 74], [156, 215], [301, 304]];
const ICY: [number, number][] = [[40, 46], [114, 145], [240, 246], [356, 362]];

/** The Snowland map: tiles plus a sloped snow surface that bodies walk along. */
export class SnowWorld extends World {
  heights: Float32Array;
  icy: Uint8Array;
  /** Thin lake ice: one-way ledges that come and go. */
  plats: { x0: number; x1: number; y: number; on: boolean }[] = [];
  waterY = LAKE_Y;
  private chunkMeshes: THREE.Mesh[] = [];
  constructor() {
    super(MAP_W, MAP_H);
    const n = MAP_W * TS;
    this.heights = new Float32Array(n).fill(Infinity);
    this.icy = new Uint8Array(n);
    for (let k = 0; k + 1 < KNOTS.length; k++) {
      const [ta, ra] = KNOTS[k], [tb, rb] = KNOTS[k + 1];
      for (let x = ta * TS; x < tb * TS; x++) {
        const f = (x - ta * TS) / ((tb - ta) * TS);
        const e = f * f * (3 - 2 * f);
        // a little lumpiness, but the arena floor stays flat
        const lump = x < ARENA_X - 4 * TS ? (vnoise(x / 40, 0, 17) - 0.5) * 5 : 0;
        this.heights[x] = (ra + (rb - ra) * e) * TS + lump;
      }
    }
    for (const [a, b] of GAPS) for (let x = a * TS; x < (b + 1) * TS; x++) this.heights[x] = Infinity;
    for (const [a, b] of ICY) for (let x = a * TS; x < (b + 1) * TS; x++) this.icy[x] = 1;
    // everything entirely under the surface is solid fill
    for (let tx = 0; tx < MAP_W; tx++) {
      let top = -Infinity;
      for (let x = tx * TS; x < tx * TS + TS; x++) top = Math.max(top, this.heights[x]);
      if (!isFinite(top)) continue;
      this.fill(tx, Math.ceil(top / TS), tx, MAP_H - 1, ST.FILL);
    }
  }
  surf(x: number) {
    const i = Math.floor(x);
    return i < 0 || i >= this.heights.length ? Infinity : this.heights[i];
  }
  /** Rise over run of the surface here (positive: going downhill to the right). */
  slope(x: number) {
    const a = this.surf(x - 4), b = this.surf(x + 4);
    return isFinite(a) && isFinite(b) ? (b - a) / 8 : 0;
  }
  isIcy(x: number) { const i = Math.floor(x); return i >= 0 && i < this.icy.length && this.icy[i] === 1; }
  solidT(t: number) { return t === ST.FILL || t === ST.ROCK || t === ST.ICE; }
  onewayT(t: number) { return t === ST.FLOE || t === ST.LOG; }
  solidAtPx(px: number, py: number) { return super.solidAtPx(px, py) || py > this.surf(px) + 1; }
  blocksAtPx(px: number, py: number, includeOneway = false) { return super.blocksAtPx(px, py, includeOneway) || py > this.surf(px) + 1; }
  groundBelow(px: number, py: number, range = 4) {
    if (super.groundBelow(px, py, range)) return true;
    if (this.surf(px) <= py + range + 4) return true;
    return this.plats.some((p) => p.on && px >= p.x0 && px <= p.x1 && p.y >= py - 1 && p.y <= py + range);
  }
  move(b: Body) {
    const wasGround = b.onGround, x0 = b.x, y0 = b.y;
    super.move(b);
    if (b.vy >= 0 && b.dropTimer <= 0) for (const p of this.plats) {
      if (p.on && b.x >= p.x0 && b.x <= p.x1 && y0 <= p.y + 0.5 && b.y >= p.y) { b.y = p.y; b.vy = 0; b.onGround = true; }
    }
    let s = this.surf(b.x);
    if (!isFinite(s)) return;
    // ran sideways into a bank from down in a pit: that's a wall
    if (b.y - s > 14 && b.x !== x0 && !(y0 - this.surf(x0) > 14)) {
      b.x = x0; b.hitWall = true;
      s = this.surf(b.x);
      if (!isFinite(s)) return;
    }
    const d = b.y - s;
    // stick to the snow going downhill, and get pushed out of it going uphill or landing
    if (d > 0 || (wasGround && b.vy >= 0 && d > -6)) {
      b.y = s;
      if (b.vy > 0) b.vy = 0;
      b.onGround = true;
    }
  }
  build(gfx: Gfx) {
    for (const m of this.chunkMeshes) gfx.scene.remove(m);
    this.chunkMeshes = [];
    for (let cy = 0; cy < Math.ceil(this.h / CHUNK); cy++) for (let cx = 0; cx < Math.ceil(this.w / CHUNK); cx++) {
      const pix = paintSnowChunk(CHUNK, cx, cy, (x) => this.surf(x), (x) => this.isIcy(x), (tx, ty) => this.get(tx, ty));
      if (!pix) continue;
      const mat = new THREE.MeshBasicMaterial({ map: tex(pix.toCanvas()), transparent: true, depthTest: false, depthWrite: false });
      const size = CHUNK * TS;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.position.set(cx * size + size / 2, -(cy * size + size / 2), 0);
      m.renderOrder = 12;
      gfx.scene.add(m);
      this.chunkMeshes.push(m);
    }
  }
}

type CamMode = 'scroll' | 'boss';

export class Stage4 implements Stage {
  readonly num = 4;
  readonly name = 'SNOWLAND';
  readonly villain = 'THE GLACIER WALKER';
  readonly song = SNOW_SONG;
  readonly bossSong = WALKER_SONG;
  readonly clearLines = ['THE OUTPOST HAS FALLEN. THE PASS IS OPEN.'];
  camMode: CamMode = 'scroll';
  lockT = 0;
  boss: Walker | null = null;

  constructor(public g: Game) {}

  get inBoss() { return !!this.boss; }
  get bossActive() { return this.camMode === 'boss'; }
  get sw() { return this.g.world as SnowWorld; }

  build(cp: number) {
    const g = this.g;
    const w = new SnowWorld();
    buildTiles(w);
    g.world = w;
    w.build(g.gfx);
    g.scenery = buildScenery(g);
    buildDecor(g, w);
    g.spawns = buildSpawns(w);
    for (const [x, row] of THIN_ICE) g.misc.push(new ThinIce(g, x * TS, row * TS));
    this.camMode = 'scroll'; this.lockT = 0; this.boss = null;
    g.gfx.camX = cp === 0 ? 0 : cp === 1 ? CP1_CAM : ARENA_X - 60;
    const sx = cp === 0 ? 3 * TS : g.gfx.camX + 70;
    g.gfx.camY = Math.max(0, Math.min(MAX_CAM_Y, w.surf(sx) - 148));
    if (cp > 0) for (const s of g.spawns) if (s.x < g.gfx.camX + VW) s.done = true;
  }

  start(cp: number) {
    const x = cp === 0 ? 3 * TS : this.g.gfx.camX + 70;
    return { x, y: this.sw.surf(x) - 40 };
  }

  updateCamera() {
    const g = this.g, gx = g.gfx, p = g.player;
    if (this.camMode === 'scroll') {
      const target = Math.min(p.body.x - 150, ARENA_X);
      if (target > gx.camX) gx.camX = Math.min(target, gx.camX + 4);
      // the view rides up and down the hills with you
      const ty = Math.max(0, Math.min(MAX_CAM_Y, p.body.y - 148));
      gx.camY += Math.max(-4, Math.min(4, (ty - gx.camY) * 0.12));
      if (gx.camX >= CP1_CAM) g.checkpoint = Math.max(g.checkpoint, 1);
      if (gx.camX >= ARENA_X) {
        gx.camX = ARENA_X; this.camMode = 'boss'; this.lockT = 0; g.checkpoint = 2;
        g.audio.sfx('alarm');
        g.banner = { text: 'WARNING', sub: 'HEAVY ARMOUR APPROACHING', t: 60 };
        for (const e of g.enemies) e.dead = true;
      }
    } else {
      gx.camX = ARENA_X;
      gx.camY += Math.max(-3, Math.min(3, ARENA_CAM_Y - gx.camY));
      if (++this.lockT === 80 && !this.boss) {
        this.boss = new Walker(g, ARENA_X, ARENA_X + VW, ARENA_FLOOR);
        g.audio.play(WALKER_SONG);
      }
    }
  }

  update() {
    const g = this.g, w = this.sw;
    // on ice, gravity tugs you downhill
    for (const p of g.livePlayers()) {
      const b = p.body;
      if (p.alive && b.onGround && p.grip < 1 && Math.abs(b.y - w.surf(b.x)) < 1) b.vx += w.slope(b.x) * 0.09;
      if (b.y > w.waterY && b.y - b.vy <= w.waterY && b.x > 156 * TS && b.x < 216 * TS) splash(g, b.x, w.waterY);
    }
    this.boss?.update();
  }

  grip(b: Body) {
    const w = this.sw;
    const t = w.get(Math.floor(b.x / TS), Math.floor((b.y + 1) / TS));
    if (t === ST.ICE || t === ST.FLOE) return ICE_GRIP;
    if (w.plats.some((p) => p.on && Math.abs(b.y - p.y) < 0.6 && b.x >= p.x0 && b.x <= p.x1)) return ICE_GRIP;
    if (Math.abs(b.y - w.surf(b.x)) < 1 && w.isIcy(b.x)) return ICE_GRIP;
    return 1;
  }

  parts(): Hittable[] { return this.boss ? this.boss.parts() : []; }
  bossBar(): [number, number, string] | null {
    const s = this.boss;
    if (!s || s.intro) return null;
    return [s.hp, s.maxHp, 'GLACIER WALKER'];
  }
  spawn(s: Spawn) {
    const g = this.g;
    switch (s.kind as string) {
      case 'grenadier': g.enemies.push(new Grenadier(g, s.x, s.y)); return true;
      case 'balls': g.misc.push(new HillSpawner(g, 'ball', s.arg[0], s.arg[1], s.arg[2], s.arg[3])); return true;
      case 'skiers': g.misc.push(new HillSpawner(g, 'skier', s.arg[0], s.arg[1], s.arg[2], s.arg[3])); return true;
    }
    return false;
  }
  deck(): Deck | null { return null; }
  respawn() { return false; }
  onMidBossDefeated() {}
  onBossDefeated() { this.boss?.destroy(); this.boss = null; }
  destroy() { this.boss?.destroy(); this.boss = null; }
}

// ---------------------------------------------------------------- map

/** Thin ice sheets on the lake: [tile x, row]. */
const THIN_ICE: [number, number][] = [[174, 29], [192, 29], [211, 29]];

function buildTiles(w: SnowWorld) {
  const rock = (x0: number, x1: number, top: number) => w.fill(x0, top, x1, MAP_H - 1, ST.ROCK);
  const ice = (x0: number, x1: number, top: number, bot = MAP_H - 1) => w.fill(x0, top, x1, bot, ST.ICE);
  const floe = (x0: number, x1: number, row: number) => w.fill(x0, row, x1, row, ST.FLOE);
  const log = (x0: number, x1: number, row: number) => w.fill(x0, row, x1, row, ST.LOG);
  // meadow: a rock perch for a sniper, a log over the first pit
  rock(64, 66, 21);
  log(28, 31, 24);
  // the big hill: a ledge halfway up and a lookout at the summit
  log(92, 95, 18);
  rock(108, 110, 12);
  // the frozen lake: rocky islands, floating floes, thin ice in between
  rock(160, 165, 30);
  floe(168, 171, 29);
  rock(179, 183, 29);
  floe(186, 189, 27);
  rock(197, 202, 30);
  floe(205, 208, 29);
  // far shore: an ice tower, ice blocks for cover, log walkways
  ice(240, 242, 20, 24);
  ice(258, 259, 26, 28);
  log(270, 274, 24);
  log(283, 287, 17);
  // the last climb
  log(334, 338, 15);
  ice(358, 359, 23, 25);
  // the outpost yard: two log perches
  log(399, 402, 22);
  log(413, 416, 22);
}

function buildSpawns(w: SnowWorld): Spawn[] {
  const px = (t: number) => t * TS + 8;
  const gy = (t: number) => w.surf(px(t));
  const py = (r: number) => r * TS;
  const k = (s: string) => s as SpawnKind;
  const s: Spawn[] = [
    { kind: 'runners', x: px(8), y: gy(8), arg: [px(8), px(70), 110, 30] },
    { kind: k('grenadier'), x: px(24), y: gy(24) },
    { kind: 'capsule', x: px(30), y: gy(30) - 90, arg: 'S' },
    { kind: 'rifle', x: px(38), y: gy(38) },
    { kind: k('grenadier'), x: px(48), y: gy(48) },
    { kind: 'drone', x: px(56), y: gy(56) - 70, arg: -1 },
    { kind: 'sniper', x: px(65), y: py(21) },
    // the big hill
    { kind: k('balls'), x: px(78), y: gy(80), arg: [px(104), px(70), px(104), 150] },
    { kind: k('skiers'), x: px(82), y: gy(84), arg: [px(110), px(76), px(100), 170] },
    { kind: 'capsule', x: px(90), y: gy(90) - 90, arg: 'M' },
    { kind: 'rifle', x: px(94), y: py(18) },
    { kind: 'sniper', x: px(109), y: py(12) },
    { kind: k('grenadier'), x: px(113), y: gy(113) },
    // the icy run down
    { kind: 'drone', x: px(126), y: gy(126) - 60, arg: -1 },
    { kind: 'capsule', x: px(132), y: gy(132) - 80, arg: 'L' },
    { kind: 'rifleBag', x: px(150), y: gy(150) },
    // the lake
    { kind: k('grenadier'), x: px(163), y: py(30) },
    { kind: 'drone', x: px(172), y: py(23), arg: -1 },
    { kind: 'rifle', x: px(181), y: py(29) },
    { kind: 'capsule', x: px(186), y: py(22), arg: 'B' },
    { kind: 'drone', x: px(195), y: py(23), arg: -1 },
    { kind: k('grenadier'), x: px(200), y: py(30) },
    // the far shore
    { kind: 'runners', x: px(216), y: gy(216), arg: [px(214), px(300), 100, 30] },
    { kind: k('grenadier'), x: px(230), y: gy(230) },
    { kind: 'sniper', x: px(241), y: py(20) },
    { kind: 'capsule', x: px(248), y: gy(248) - 90, arg: 'H' },
    { kind: 'turret', x: px(262), y: gy(262) },
    { kind: 'rifleBag', x: px(272), y: py(24) },
    { kind: k('balls'), x: px(266), y: gy(266), arg: [px(286), px(256), px(282), 160] },
    { kind: 'rifle', x: px(285), y: py(17) },
    { kind: 'drone', x: px(292), y: gy(292) - 70, arg: -1 },
    { kind: k('grenadier'), x: px(297), y: gy(297) },
    // the last climb to the outpost
    { kind: k('skiers'), x: px(306), y: gy(308), arg: [px(334), px(300), px(326), 150] },
    { kind: k('balls'), x: px(318), y: gy(320), arg: [px(338), px(310), px(334), 170] },
    { kind: 'rifle', x: px(336), y: py(15) },
    { kind: 'capsule', x: px(346), y: gy(346) - 90, arg: 'F' },
    { kind: 'sniper', x: px(358), y: py(23) },
    { kind: k('grenadier'), x: px(368), y: gy(368) },
    { kind: 'turret', x: px(376), y: gy(376) },
    { kind: k('grenadier'), x: px(382), y: gy(382) },
    { kind: 'drone', x: px(386), y: gy(386) - 70, arg: -1 },
  ];
  return s;
}

// ---------------------------------------------------------------- backdrops

const screenVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
/** Falling snow in three layers, drifting with the wind. */
const snowFrag = /* glsl */`
  uniform float time;
  uniform vec2 cam;
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 sp = floor(vec2(vUv.x * ${VW}.0, (1.0 - vUv.y) * ${VH}.0));
    float a = 0.0;
    for (int L = 0; L < 3; L++) {
      float fl = float(L);
      float cell = 26.0 - fl * 6.0;
      vec2 q = sp + floor(cam * (0.3 + fl * 0.35)) + vec2(-time * (8.0 + fl * 6.0), -time * (16.0 + fl * 14.0));
      vec2 c = floor(q / cell);
      vec2 f = q - c * cell;
      float r = h(c + fl * 17.0);
      if (r > 0.5) continue;
      vec2 fp = floor(vec2(h(c + 3.1), h(c + 7.7)) * (cell - 4.0) + 2.0 + vec2(sin(time * 1.3 + r * 40.0) * 2.0, 0.0));
      vec2 d = floor(f) - fp;
      float size = L == 2 ? 1.0 : 0.0;
      if (d.x >= 0.0 && d.x <= size && d.y >= 0.0 && d.y <= size) a = max(a, 0.5 + fl * 0.2);
    }
    if (a <= 0.0) discard;
    gl_FragColor = vec4(0.94, 0.96, 1.0, a);
  }
`;
const waterVert = /* glsl */`
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = vec2(w.x, -w.y);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
/** Black, freezing lake water with slush floating on top. */
const lakeFrag = /* glsl */`
  uniform float time;
  uniform float top;
  varying vec2 vWorld;
  void main() {
    vec2 p = floor(vWorld);
    float depth = p.y - top;
    float wave = floor(sin(p.x / 9.0 + time * 1.1) * 1.0);
    if (depth < wave) discard;
    vec3 c = vec3(0.05, 0.12, 0.22);
    if (depth < wave + 1.0) c = vec3(0.8, 0.9, 1.0);
    else if (depth < wave + 3.0) c = vec3(0.25, 0.42, 0.6);
    else {
      float s = sin(p.x / 11.0 + time * 0.5) + sin(p.x / 4.0 - time * 0.3 + p.y / 7.0);
      if (depth < 9.0 && s > 1.3) c = vec3(0.6, 0.72, 0.88);
      else if (s > 1.5) c = vec3(0.1, 0.2, 0.33);
      c = mix(c, vec3(0.02, 0.04, 0.09), clamp(depth / 60.0, 0.0, 0.8));
    }
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

function buildScenery(g: Game): Scenery {
  const a = g.assets.snow, gfx = g.gfx;
  const layers = [
    new Parallax(gfx, a.sky, 0, 0.02, 0, 0),
    new Parallax(gfx, a.peaks, 1, 0.05, 0.03, 34),
    new Parallax(gfx, a.firs, 2, 0.15, 0.07, 92),
    new Parallax(gfx, a.near, 3, 0.35, 0.12, 128),
  ];
  // the lake
  const x0 = 156 * TS, x1 = 216 * TS, y0 = LAKE_Y, y1 = MAP_H * TS + 80;
  const lake = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, top: { value: y0 } }, vertexShader: waterVert, fragmentShader: lakeFrag, depthTest: false, depthWrite: false, transparent: true });
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), lake);
  lm.position.set((x0 + x1) / 2, -(y0 + y1) / 2, 0);
  lm.renderOrder = 33;
  gfx.scene.add(lm);
  // snowfall in front of everything
  const snow = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector2() } }, vertexShader: screenVert, fragmentShader: snowFrag, depthTest: false, depthWrite: false, transparent: true });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(VW, VH), snow);
  sm.renderOrder = 50;
  gfx.scene.add(sm);
  return {
    update(camX, camY, t) {
      for (const l of layers) l.update(camX, camY);
      lake.uniforms.time.value = t;
      snow.uniforms.time.value = t;
      snow.uniforms.cam.value.set(Math.round(camX), Math.round(camY));
      sm.position.set(Math.round(camX) + VW / 2, -(Math.round(camY) + VH / 2), 0);
    },
  };
}

function buildDecor(g: Game, w: SnowWorld): Sprite[] {
  const a = g.assets.snow, gfx = g.gfx;
  const out: Sprite[] = [];
  const put = (f: Frame, x: number, y: number, z: number, flip = false, tint = 1) => {
    const s = gfx.sprite(f, z);
    s.x = x; s.y = y; s.flip = flip;
    if (tint !== 1) s.setTint(tint * 0.92, tint * 0.95, tint);
    s.sync(); out.push(s);
    return s;
  };
  // fir trees all along the hills, some set back and darker
  for (let x = 40, i = 0; x < ARENA_X - 40; x += 70 + ((x * 13) % 90), i++) {
    const y = w.surf(x);
    if (!isFinite(y) || !isFinite(w.surf(x - 20)) || !isFinite(w.surf(x + 20))) continue;
    const back = i % 3 === 1;
    put(a.pine[(i * 7) % 3], x, y + 5, back ? 9 : 10, i % 2 === 0, back ? 0.62 : 0.85);
  }
  for (let x = 90, i = 0; x < ARENA_X - 60; x += 260 + ((x * 7) % 200), i++) {
    const y = w.surf(x);
    if (isFinite(y)) put(a.rock, x, y + 6, 13, i % 2 === 0);
  }
  // lamps and warning beacons lighting the path up to the outpost
  for (const t of [322, 346, 370]) put(a.lamp, t * TS, w.surf(t * TS) + 2, 10);
  for (const t of [334, 358, 384]) put(a.beacon, t * TS, w.surf(t * TS) + 2, 10);
  put(a.mast, 391 * TS, w.surf(391 * TS) + 2, 9);
  // the outpost yard
  put(a.outpost, ARENA_X + VW / 2, ARENA_FLOOR + 3, 8, false, 0.72);
  put(a.crates, ARENA_X + VW / 2 - 124, ARENA_FLOOR + 2, 13);
  put(a.crates, ARENA_X + VW / 2 + 128, ARENA_FLOOR + 2, 13, true);
  put(a.beacon, ARENA_X + 10, ARENA_FLOOR + 2, 13);
  put(a.beacon, ARENA_X + VW - 10, ARENA_FLOOR + 2, 13, true);
  put(a.pine[2], ARENA_X - 30, ARENA_FLOOR + 5, 9, false, 0.7);
  return out;
}
