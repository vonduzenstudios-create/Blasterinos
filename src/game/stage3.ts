import * as THREE from 'three';
import { Parallax, VW, VH, type Sprite } from '../engine/gfx';
import type { Frame } from '../engine/pixel';
import { T, TS } from '../art/tiles';
import { TOWER_DECK } from '../art/beach';
import type { Game } from './game';
import type { Stage, Deck } from './stage';
import type { Hittable } from './weapons';
import { World } from './world';
import type { Spawn, Scenery } from './level';
import { GiantClam, Crab, FishSchool } from './clam';
import { BEACH_SONG, CLAM_SONG } from './beachMusic';

// Stage 3: "Pearl Beach". A landing on a tropical beach held by the enemy: the sand,
// a rickety pier over water full of barracuda, the lifeguard post, the reef, and at
// the far end of the bay, something huge dragged up from the trench, sitting in the surf.

export const MAP_W = 264, MAP_H = 32;
export const GROUND = 28;
const FLOOR = GROUND * TS;
const CAM_Y = 270;                       // same framing as the desert: lots of sky and sea
const HORIZON = 98;                      // screen row where the sea meets the sky
const CP1_X = 104 * TS;                  // past the pier
const ARENA_X = 240 * TS;
const CLAM_X = ARENA_X + 290;
/** Open water: [first tile, last tile] where the sand stops and the sea comes in. */
const WATER: [number, number][] = [[59, 104], [162, 164], [178, 180]];
/** Gaps in the pier that fish leap out of. */
const GAPS: [number, number][] = [[66, 68], [77, 79], [90, 92]];

type State = 'foot' | 'boss';

export class Stage3 implements Stage {
  readonly num = 3;
  readonly name = 'PEARL BEACH';
  readonly song = BEACH_SONG;
  readonly bossSong = CLAM_SONG;
  readonly villain = 'THE ABYSSAL CLAM';
  readonly clearLines = ['THE ABYSSAL CLAM SINKS BACK INTO THE DEEP.'];
  state: State = 'foot';
  clam: GiantClam | null = null;
  lockT = 0;

  constructor(public g: Game) {}

  get inBoss() { return !!this.clam; }
  get bossActive() { return this.state === 'boss'; }

  build(cp: number) {
    const g = this.g;
    this.clam = null; this.lockT = 0; this.state = 'foot';
    g.world = buildWorld();
    g.world.build(g.gfx);
    g.scenery = buildScenery(g);
    buildDecor(g);
    g.spawns = buildSpawns();
    g.gfx.camY = CAM_Y;
    g.gfx.camX = cp === 0 ? 0 : cp === 1 ? CP1_X : ARENA_X - 60;
    if (cp > 0) for (const s of g.spawns) if (s.x < g.gfx.camX + VW) s.done = true;
  }

  start(cp: number) {
    const g = this.g;
    if (cp === 0) return { x: 5 * TS, y: FLOOR - 50 };
    return { x: g.gfx.camX + 70, y: FLOOR - 50 };
  }

  updateCamera() {
    const g = this.g, gx = g.gfx;
    gx.camY = CAM_Y;
    switch (this.state) {
      case 'foot': {
        const target = Math.min(g.player.body.x - 150, ARENA_X);
        if (target > gx.camX) gx.camX = Math.min(target, gx.camX + 4);
        if (gx.camX >= CP1_X && g.checkpoint < 1) g.checkpoint = 1;
        if (gx.camX >= ARENA_X) {
          gx.camX = ARENA_X; this.state = 'boss'; this.lockT = 0; g.checkpoint = 2;
          g.audio.sfx('alarm');
          g.banner = { text: 'WARNING', sub: 'THE ABYSSAL CLAM', t: 60 };
          for (const e of g.enemies) e.dead = true;
        }
        break;
      }
      case 'boss':
        gx.camX = ARENA_X;
        if (++this.lockT === 70 && !this.clam) {
          this.clam = new GiantClam(g, CLAM_X, FLOOR, ARENA_X, ARENA_X + VW);
          g.audio.play(CLAM_SONG);
        }
        break;
    }
  }

  update() { this.clam?.update(); }

  parts(): Hittable[] { return this.clam ? [this.clam] : []; }
  bossBar(): [number, number, string] | null {
    if (!this.clam || this.clam.mode === 'rise') return null;
    return [this.clam.hp, this.clam.maxHp, 'ABYSSAL CLAM'];
  }
  spawn(s: Spawn) {
    const g = this.g;
    switch (s.kind) {
      case 'crab': g.enemies.push(new Crab(g, s.x, s.y)); return true;
      case 'fish': g.misc.push(new FishSchool(g, s.arg[0], s.arg[1], FLOOR + 6)); return true;
    }
    return false;
  }
  deck(): Deck | null { return null; }
  respawn() { return false; }
  onMidBossDefeated() {}
  onBossDefeated() { this.clam?.destroy(); this.clam = null; }
  destroy() { this.clam?.destroy(); this.clam = null; }
}

// ---------------------------------------------------------------- map

function buildWorld(): World {
  const w = new World(MAP_W, MAP_H);
  const beach = (x0: number, x1: number, top = GROUND) => w.fill(x0, top, x1, MAP_H - 1, T.BEACH);
  const reef = (x0: number, x1: number, top: number) => w.fill(x0, top, x1, GROUND - 1, T.REEF);
  const dock = (x0: number, x1: number, row = GROUND) => w.fill(x0, row, x1, row, T.DOCK);
  beach(0, MAP_W - 1);
  for (const [a, b] of WATER) w.fill(a, GROUND, b, MAP_H - 1, T.E);
  // the landing: a low dune to hop
  beach(20, 26, GROUND - 1); beach(22, 24, GROUND - 2);
  // the pier, with gaps
  dock(59, 65); dock(69, 76); dock(80, 89); dock(93, 104);
  dock(83, 87, GROUND - 3);
  dock(97, 100, GROUND - 3);
  // the bunker and the lifeguard post
  dock(114, 116, GROUND - 2);
  w.fill(118, GROUND - 3, 122, GROUND - 1, T.METAL);
  dock(128, 130, GROUND - 3);
  dock(132, 135, GROUND - TOWER_DECK / TS);
  // the reef
  reef(156, 159, GROUND - 2);
  reef(166, 172, GROUND - 3);
  reef(173, 175, GROUND - 1);
  reef(181, 183, GROUND - 2);
  reef(184, 190, GROUND - 4);
  dock(191, 194, GROUND - 2);
  // last stretch: a gun emplacement
  w.fill(222, GROUND - 2, 225, GROUND - 1, T.METAL);
  dock(218, 220, GROUND - 2);
  // rails over the pier gaps and the reef channels
  w.rail(64, 70, 23);
  w.rail(75, 81, 23);
  w.rail(88, 94, 23);
  w.rail(160, 166, 22);
  w.rail(176, 182, 23);
  // the bay: a rusted gantry rail right across the lagoon, high enough to hang over the clam
  w.rail(241, 262, 20);
  return w;
}

function buildSpawns(): Spawn[] {
  const px = (t: number) => t * TS + 8;
  const py = (r: number) => r * TS;
  return [
    // the landing
    { kind: 'runners', x: px(8), y: FLOOR, arg: [px(8), px(58), 100] },
    { kind: 'crab', x: px(16), y: FLOOR },
    { kind: 'capsule', x: px(14), y: py(GROUND - 7), arg: 'S' },
    { kind: 'rifle', x: px(23), y: py(GROUND - 2) },
    { kind: 'crab', x: px(29), y: FLOOR },
    { kind: 'rifleBag', x: px(36), y: FLOOR },
    { kind: 'crab', x: px(44), y: FLOOR },
    { kind: 'drone', x: px(50), y: py(GROUND - 6), arg: -1 },
    { kind: 'rifleBag', x: px(55), y: FLOOR },
    // the pier
    ...GAPS.map(([a, b]): Spawn => ({ kind: 'fish', x: px(a - 6), y: FLOOR, arg: [a * TS, (b + 1) * TS] })),
    { kind: 'drone', x: px(72), y: py(GROUND - 6), arg: -1 },
    { kind: 'capsule', x: px(76), y: py(GROUND - 8), arg: 'M' },
    { kind: 'rifle', x: px(85), y: py(GROUND - 3) },
    { kind: 'runners', x: px(80), y: FLOOR, arg: [px(80), px(104), 90] },
    { kind: 'sniper', x: px(98), y: py(GROUND - 3) },
    // bunker and lifeguard post
    { kind: 'crab', x: px(110), y: FLOOR },
    { kind: 'turret', x: px(120), y: py(GROUND - 3) },
    { kind: 'rifleBag', x: px(125), y: FLOOR },
    { kind: 'sniper', x: px(134), y: py(GROUND - TOWER_DECK / TS) },
    { kind: 'crab', x: px(138), y: FLOOR },
    { kind: 'capsule', x: px(140), y: py(GROUND - 8), arg: 'L' },
    { kind: 'drone', x: px(146), y: py(GROUND - 6), arg: -1 },
    { kind: 'runners', x: px(110), y: FLOOR, arg: [px(110), px(150), 110] },
    // the reef
    { kind: 'crab', x: px(152), y: FLOOR },
    { kind: 'rifle', x: px(158), y: py(GROUND - 2) },
    { kind: 'fish', x: px(156), y: FLOOR, arg: [162 * TS, 165 * TS] },
    { kind: 'crab', x: px(169), y: py(GROUND - 3) },
    { kind: 'fish', x: px(172), y: FLOOR, arg: [178 * TS, 181 * TS] },
    { kind: 'sniper', x: px(187), y: py(GROUND - 4) },
    { kind: 'drone', x: px(186), y: py(GROUND - 8), arg: -1 },
    { kind: 'capsule', x: px(192), y: py(GROUND - 8), arg: 'F' },
    { kind: 'crab', x: px(197), y: FLOOR },
    // last stretch
    { kind: 'runners', x: px(196), y: FLOOR, arg: [px(196), px(236), 80] },
    { kind: 'crab', x: px(205), y: FLOOR },
    { kind: 'rifleBag', x: px(210), y: FLOOR },
    { kind: 'capsule', x: px(212), y: py(GROUND - 8), arg: 'H' },
    { kind: 'crab', x: px(216), y: FLOOR },
    { kind: 'turret', x: px(223), y: py(GROUND - 2) },
    { kind: 'drone', x: px(228), y: py(GROUND - 6), arg: -1 },
    { kind: 'crab', x: px(231), y: FLOOR },
    { kind: 'rifleBag', x: px(234), y: FLOOR },
  ];
}

// ---------------------------------------------------------------- backdrops

const worldVert = /* glsl */`
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = vec2(w.x, -w.y);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/**
 * The open sea between the horizon and the beach. Wave bands get bigger and scroll
 * faster toward the shore (a cheap perspective), and the surf washes up and back.
 */
const seaFrag = /* glsl */`
  uniform float time;
  uniform vec2 cam;
  uniform float horizon;
  uniform float shore;
  varying vec2 vWorld;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 sp = floor(vWorld - cam);           // screen pixel
    float t = clamp((sp.y - horizon) / (shore - horizon), 0.0, 1.0);
    if (sp.y < horizon) discard;
    float u = sp.x + cam.x * (0.06 + 0.5 * t);
    vec3 deep = vec3(0.1, 0.3, 0.62), mid = vec3(0.1, 0.52, 0.74), shallow = vec3(0.22, 0.78, 0.8);
    vec3 c = t < 0.45 ? mix(deep, mid, floor(t / 0.45 * 4.0) / 4.0) : mix(mid, shallow, floor((t - 0.45) / 0.55 * 4.0) / 4.0);
    // rolling wave bands
    float band = sin(u / (10.0 + t * 30.0) + sin(u / 37.0) * 1.5 - time * (0.6 + t * 1.4) + sp.y * (0.9 - t * 0.5));
    if (band > 0.9) c = mix(c, vec3(0.75, 0.95, 1.0), 0.35 + t * 0.3);
    else if (band < -0.85) c *= 0.85;
    // sun glints
    if (h(vec2(floor(u / 3.0), sp.y + floor(time * 6.0))) > 0.995 - t * 0.004) c = vec3(1.0);
    // a line of haze at the horizon
    if (sp.y < horizon + 2.0) c = mix(c, vec3(0.8, 0.93, 1.0), 0.6);
    // the surf: foam that rushes up the beach and slides back
    float wash = shore - 12.0 + sin(time * 0.9 + u / 53.0) * 5.0 + sin(u / 17.0 - time * 2.0) * 1.5;
    if (sp.y > wash) c = mix(vec3(0.62, 0.52, 0.36), vec3(0.8, 0.7, 0.5), step(0.5, fract(u / 7.0 + sp.y / 3.0)) * 0.3);
    else if (sp.y > wash - 2.0) c = vec3(1.0);
    else if (sp.y > wash - 5.0 && h(vec2(floor(u / 2.0), floor(time * 4.0))) > 0.5) c = vec3(0.85, 0.97, 1.0);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Water in the pits and under the pier: in front of the player, so you go under. */
const waterFrag = /* glsl */`
  uniform float time;
  uniform float top;
  varying vec2 vWorld;
  void main() {
    vec2 p = floor(vWorld);
    float depth = p.y - top;
    float wave = floor(sin(p.x / 8.0 + time * 2.2) * 1.5 + sin(p.x / 21.0 - time * 1.1) * 1.2);
    if (depth < wave) discard;
    vec3 c = vec3(0.1, 0.5, 0.7);
    if (depth < wave + 2.0) c = vec3(0.85, 0.98, 1.0);
    else if (depth < wave + 5.0) c = vec3(0.25, 0.75, 0.85);
    else {
      float caustic = sin(p.x / 5.0 + sin(p.y / 4.0 + time) * 2.0) + sin(p.y / 3.0 - time * 1.3);
      if (caustic > 1.3) c = vec3(0.3, 0.72, 0.85);
      c = mix(c, vec3(0.03, 0.15, 0.3), clamp(depth / 50.0, 0.0, 0.75));
    }
    gl_FragColor = vec4(c, 0.92);
    #include <colorspace_fragment>
  }
`;

function buildScenery(g: Game): Scenery {
  const a = g.assets.beach, gfx = g.gfx;
  const sky = new Parallax(gfx, a.sky, 0, 0.02, 0, 0);
  const islands = new Parallax(gfx, a.islands, 1, 0.05, 0, HORIZON - 42);
  // the sea is a screen-sized quad that follows the camera
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector2() }, horizon: { value: HORIZON }, shore: { value: FLOOR - CAM_Y } },
    vertexShader: worldVert, fragmentShader: seaFrag, depthTest: false, depthWrite: false, transparent: true,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(VW + 2, VH), seaMat);
  sea.renderOrder = 2;
  gfx.scene.add(sea);
  const mats: THREE.ShaderMaterial[] = [];
  for (const [p0, p1] of WATER) {
    const x0 = p0 * TS, x1 = (p1 + 1) * TS, y0 = FLOOR + 6, y1 = MAP_H * TS + 40;
    const m = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, top: { value: y0 } }, vertexShader: worldVert, fragmentShader: waterFrag, depthTest: false, depthWrite: false, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), m);
    mesh.position.set((x0 + x1) / 2, -(y0 + y1) / 2, 0);
    mesh.renderOrder = 33;
    gfx.scene.add(mesh);
    mats.push(m);
  }
  return {
    update(camX, camY, t) {
      sky.update(camX, camY); islands.update(camX, camY);
      const cx = Math.round(camX), cy = Math.round(camY);
      sea.position.set(cx + VW / 2, -(cy + VH / 2), 0);
      seaMat.uniforms.cam.value.set(cx, cy);
      seaMat.uniforms.time.value = t;
      for (const m of mats) m.uniforms.time.value = t;
    },
  };
}

function buildDecor(g: Game): Sprite[] {
  const a = g.assets.beach, gfx = g.gfx;
  const out: Sprite[] = [];
  const put = (f: Frame, x: number, y: number, z: number, flip = false, tint = 1) => {
    const s = gfx.sprite(f, z);
    s.x = x; s.y = y; s.flip = flip;
    if (tint !== 1) s.setTint(tint, tint, tint * 1.03);
    s.sync(); out.push(s);
    return s;
  };
  const gy = FLOOR + 2;
  const onSand = (x: number) => !WATER.some(([p0, p1]) => x >= p0 * TS - 20 && x <= (p1 + 1) * TS + 20) && x < ARENA_X - 30;
  // the landing craft that brought you here
  put(a.boat, 40, gy + 4, 10, false, 0.95);
  // palms along the back of the beach
  for (let x = 170, i = 0; x < ARENA_X; x += 150 + ((x * 13) % 120), i++) if (onSand(x)) put(a.palm[i % 2], x, gy, 10, i % 3 === 0, 0.85);
  // beach clutter
  for (let x = 120, i = 0; x < ARENA_X; x += 70 + ((x * 7) % 90), i++) {
    if (!onSand(x)) continue;
    const k = i % 5;
    if (k === 0 || k === 3) put(a.hedgehog, x, gy, 13, i % 2 === 0);
    else if (k === 1) put(a.starfish, x, gy, 13);
    else if (k === 2) put(a.shells, x, gy, 13, i % 2 === 0);
    else put(a.crate, x, gy, 13);
  }
  // pier pilings, half sunk in the water
  for (let t = 59; t <= 104; t += 3) {
    const isGap = GAPS.some(([p, q]) => t >= p && t <= q);
    if (!isGap) put(a.piling, t * TS + 8, FLOOR - 8, 11);
  }
  // posts holding up the raised decks
  for (const x of [83, 87, 97, 100]) put(a.piling, x * TS + 8, FLOOR - 3 * TS - 6, 11);
  // the lifeguard post
  put(a.tower, 134 * TS, gy, 10);
  // the bay: the clam's lagoon, littered with shells
  for (const [x, f] of [[ARENA_X + 30, a.shells], [ARENA_X + 110, a.starfish], [ARENA_X + 180, a.shells]] as [number, Frame][]) put(f, x, gy, 13);
  put(a.palm[1], ARENA_X + 20, gy, 10, false, 0.8);
  // big tufts of dune grass at the bottom edge
  for (let x = 200; x < ARENA_X + VW; x += 260 + ((x * 7) % 200)) if (onSand(x) || x > ARENA_X) put(a.grass, x, FLOOR + 74, 55, (x >> 5) % 2 === 0, 0.35);
  return out;
}

export { VH };
