import * as THREE from 'three';
import { Parallax, VW, type Sprite } from '../engine/gfx';
import type { Frame } from '../engine/pixel';
import { TS } from '../art/tiles';
import { HT, buildHive } from '../art/hive';
import type { Game } from './game';
import type { Stage, Deck } from './stage';
import type { Hittable } from './weapons';
import { World } from './world';
import type { Spawn, Scenery } from './level';
import { BroodPod, Pustule, HiveQueen, type PodDir } from './hive';
import { HIVE_SONG, QUEEN_SONG } from './hivemusic';

// Stage 5: "The Alien Hive", the last one. A run through the guts of the nest,
// past acid pits and the brood pods the hatchlings burst from, down to the Hive Queen.

export const MAP_W = 250, MAP_H = 16;
export const GROUND = 13;
const FLOOR = GROUND * TS;
const CEIL = 3 * TS;                 // underside of the roof
const CAM_Y = 40;
const CP1_X = 116 * TS;
const ARENA_X = 226 * TS;
const QUEEN_X = ARENA_X + 290;
const PITS: [number, number][] = [[32, 34], [70, 73], [112, 115], [154, 157], [206, 209]];

type State = 'run' | 'boss';

export class Stage5 implements Stage {
  readonly num = 5;
  readonly name = 'THE ALIEN HIVE';
  readonly song = HIVE_SONG;
  readonly bossSong = QUEEN_SONG;
  readonly villain = 'THE HIVE QUEEN';
  readonly clearLines = ['THE HIVE QUEEN HAS FALLEN.', 'THE WHOLE NEST IS COMING DOWN!'];
  state: State = 'run';
  queen: HiveQueen | null = null;
  lockT = 0;

  constructor(public g: Game) {}

  get inBoss() { return !!this.queen; }
  get bossActive() { return this.state === 'boss'; }

  build(cp: number) {
    const g = this.g;
    buildHive();
    this.queen = null; this.lockT = 0; this.state = 'run';
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
    return { x: cp === 0 ? 3 * TS : g.gfx.camX + 70, y: FLOOR - 40 };
  }

  updateCamera() {
    const g = this.g, gx = g.gfx;
    gx.camY = CAM_Y;
    if (this.state === 'run') {
      const target = Math.min(g.player.body.x - 150, ARENA_X);
      if (target > gx.camX) gx.camX = Math.min(target, gx.camX + 4);
      if (gx.camX >= CP1_X - 40) g.checkpoint = Math.max(g.checkpoint, 1);
      if (gx.camX >= ARENA_X) {
        gx.camX = ARENA_X; this.state = 'boss'; this.lockT = 0; g.checkpoint = 2;
        g.audio.sfx('alarm');
        g.banner = { text: 'WARNING', sub: 'THE HIVE QUEEN', t: 60 };
        for (const e of g.enemies) e.dead = true;
      }
    } else {
      gx.camX = ARENA_X;
      if (++this.lockT === 60 && !this.queen) {
        this.queen = new HiveQueen(g, QUEEN_X, FLOOR, ARENA_X, CEIL);
        g.audio.play(QUEEN_SONG);
      }
    }
  }

  update() { this.queen?.update(); }
  parts(): Hittable[] { return this.queen ? this.queen.parts() : []; }
  bossBar(): [number, number, string] | null {
    const m = this.queen;
    return m && m.mode !== 'intro' ? [m.hp, m.maxHp, 'HIVE QUEEN'] : null;
  }
  spawn(s: Spawn) {
    const g = this.g;
    switch (s.kind) {
      case 'brood': g.enemies.push(new BroodPod(g, s.x, s.y, s.arg as PodDir)); return true;
      case 'pustule': g.enemies.push(new Pustule(g, s.x, s.y)); return true;
    }
    return false;
  }
  deck(): Deck | null { return null; }
  respawn() { return false; }
  onMidBossDefeated() {}
  onBossDefeated() { this.queen?.destroy(); this.queen = null; }
  destroy() { this.queen?.destroy(); this.queen = null; }
}

// ---------------------------------------------------------------- map

function buildWorld(): World {
  const w = new World(MAP_W, MAP_H);
  const resin = (x0: number, y0: number, x1: number, y1: number) => w.fill(x0, y0, x1, y1, HT.RESIN);
  const rib = (x0: number, x1: number, row: number) => w.fill(x0, row, x1, row, HT.RIB);
  // roof and floor of the tunnel
  resin(0, 0, MAP_W - 1, 2);
  resin(0, GROUND, MAP_W - 1, MAP_H - 1);
  for (const [a, b] of PITS) w.fill(a, GROUND, b, MAP_H - 1, 0);
  // A: the way in
  resin(22, 11, 27, 12);
  resin(10, 3, 14, 3);
  // B: a sagging bulge in the roof, ribs to climb
  resin(44, 3, 50, 5); resin(45, 6, 49, 6);
  rib(52, 56, 9);
  // C: a wall of resin with a hole in its face
  resin(60, 9, 66, 12);
  rib(71, 72, 10);
  // D
  resin(88, 11, 92, 12);
  resin(96, 3, 102, 5); resin(97, 6, 101, 6);
  rib(104, 108, 9);
  // E: the egg chamber
  resin(122, 12, 126, 12);
  resin(132, 12, 136, 12);
  resin(127, 3, 131, 5);
  resin(146, 10, 150, 12);
  rib(141, 144, 9);
  // F: the gauntlet
  resin(162, 3, 168, 5); resin(163, 6, 167, 6);
  resin(170, 11, 174, 12);
  resin(176, 3, 180, 4);
  rib(186, 189, 10);
  rib(192, 195, 8);
  resin(196, 9, 200, 12);
  // the Queen's chamber: two ribs to get up at her head
  rib(229, 232, 8);
  rib(235, 238, 8);
  return w;
}

function buildSpawns(): Spawn[] {
  const px = (t: number) => t * TS + 8;
  const py = (r: number) => r * TS;
  const hole = (x: number, y: number, dir: PodDir): Spawn => ({ kind: 'brood', x, y, arg: dir });
  return [
    { kind: 'capsule', x: px(12), y: py(7), arg: 'M' },
    hole(25 * TS, py(11), 'up'),
    { kind: 'leaper', x: px(29), y: FLOOR },
    { kind: 'pustule', x: px(40), y: FLOOR },
    hole(47 * TS + 8, py(7), 'down'),
    { kind: 'leaper', x: px(55), y: py(9) },
    hole(60 * TS, py(11) + 6, 'left'),
    { kind: 'pustule', x: px(64), y: py(9) },
    { kind: 'capsule', x: px(76), y: py(7), arg: 'S' },
    { kind: 'pustule', x: px(80), y: FLOOR },
    { kind: 'leaper', x: px(84), y: FLOOR },
    hole(90 * TS + 8, py(11), 'up'),
    hole(99 * TS + 8, py(7), 'down'),
    { kind: 'leaper', x: px(106), y: py(9) },
    { kind: 'pustule', x: px(110), y: FLOOR },
    // egg chamber
    hole(124 * TS + 8, py(12), 'up'),
    hole(129 * TS + 8, py(6), 'down'),
    hole(134 * TS + 8, py(12), 'up'),
    { kind: 'capsule', x: px(138), y: py(7), arg: 'L' },
    { kind: 'pustule', x: px(140), y: FLOOR },
    { kind: 'leaper', x: px(143), y: py(9) },
    hole(146 * TS, py(11) + 6, 'left'),
    // gauntlet
    hole(165 * TS + 8, py(7), 'down'),
    hole(172 * TS + 8, py(11), 'up'),
    { kind: 'pustule', x: px(176), y: FLOOR },
    hole(178 * TS + 8, py(5), 'down'),
    { kind: 'capsule', x: px(182), y: py(7), arg: 'B' },
    { kind: 'leaper', x: px(184), y: FLOOR },
    { kind: 'pustule', x: px(190), y: FLOOR },
    hole(196 * TS, py(11) + 6, 'left'),
    { kind: 'leaper', x: px(199), y: py(9) },
    { kind: 'capsule', x: px(204), y: py(7), arg: 'H' },
    { kind: 'pustule', x: px(212), y: FLOOR },
    { kind: 'capsule', x: px(216), y: py(7), arg: 'F' },
  ];
}

// ---------------------------------------------------------------- backdrops

const acidVert = /* glsl */`
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = vec2(w.x, -w.y);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
/** Bubbling green bile. */
const acidFrag = /* glsl */`
  uniform float time;
  uniform float top;
  varying vec2 vWorld;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 p = floor(vWorld);
    float depth = p.y - top;
    float wave = floor(sin(p.x / 5.0 + time * 2.4) * 1.3 + sin(p.x / 13.0 - time * 1.7));
    if (depth < wave) discard;
    vec3 c = vec3(0.3, 0.62, 0.12);
    if (depth < wave + 1.0) c = vec3(0.86, 1.0, 0.5);
    else if (depth < wave + 3.0) c = vec3(0.5, 0.82, 0.2);
    else {
      // bubbles rising
      vec2 cell = floor(vec2(p.x / 5.0, (p.y + time * 18.0) / 5.0));
      vec2 f = mod(vec2(p.x, p.y + floor(time * 18.0)), 5.0);
      if (h(cell) > 0.86 && length(f - 2.0) < 1.6) c = vec3(0.7, 0.95, 0.35);
      c = mix(c, vec3(0.06, 0.16, 0.03), clamp(depth / 40.0, 0.0, 0.75));
    }
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

function buildScenery(g: Game): Scenery {
  const a = buildHive(), gfx = g.gfx;
  const layers = [
    new Parallax(gfx, a.sky, 0, 0.03, 0, 0),
    new Parallax(gfx, a.far, 1, 0.12, 0, 10),
    new Parallax(gfx, a.near, 2, 0.35, 0, 20),
  ];
  const mats: THREE.ShaderMaterial[] = [];
  for (const [p0, p1] of PITS) {
    const x0 = p0 * TS, x1 = (p1 + 1) * TS, y0 = FLOOR + 10, y1 = MAP_H * TS + 40;
    const m = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, top: { value: y0 } }, vertexShader: acidVert, fragmentShader: acidFrag, depthTest: false, depthWrite: false, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), m);
    mesh.position.set((x0 + x1) / 2, -(y0 + y1) / 2, 0);
    mesh.renderOrder = 33; // in front of the player, so you sink into it
    gfx.scene.add(mesh);
    mats.push(m);
  }
  return {
    update(camX, camY, t) {
      for (const l of layers) l.update(camX, camY);
      for (const m of mats) m.uniforms.time.value = t;
    },
  };
}

function buildDecor(g: Game): Sprite[] {
  const a = buildHive(), gfx = g.gfx;
  const out: Sprite[] = [];
  const put = (f: Frame, x: number, y: number, z: number, flip = false, tint = 1) => {
    const s = gfx.sprite(f, z);
    s.x = x; s.y = y; s.flip = flip;
    if (tint !== 1) s.setTint(tint, tint * 0.95, tint);
    s.sync(); out.push(s);
    return s;
  };
  const inPit = (tx: number) => PITS.some(([p0, p1]) => tx >= p0 - 1 && tx <= p1 + 1);
  // tendrils and glowing pods hanging from the roof
  for (let x = 40, i = 0; x < ARENA_X; x += 70 + ((x * 13) % 90), i++) {
    put(a.tendril, x, CEIL - 2, 10, i % 2 === 0, 0.8);
    if (i % 3 === 1) { const pd = put(a.pod[i % 2], x + 14, CEIL, 10, false, 0.9); pd.rot = Math.PI; pd.sync(); }
  }
  // egg clusters and the remains of those who came before
  for (let x = 120, i = 0; x < ARENA_X - 40; x += 160 + ((x * 7) % 130), i++) {
    const tx = Math.floor(x / TS);
    if (inPit(tx) || g.world.solid(tx, GROUND - 1)) continue;
    put(i % 3 === 2 ? a.bones : a.eggCluster, x, FLOOR + 2, 13, i % 2 === 0);
  }
  for (const tx of [123, 125, 128, 131, 133, 135]) if (!g.world.solid(tx, GROUND - 1)) put(a.eggCluster, tx * TS, FLOOR + 2, 13, tx % 2 === 0);
  // foreground tendrils hanging into the top of the view
  for (let x = 100; x < MAP_W * TS; x += 230 + ((x * 11) % 170)) put(a.tendril, x, CEIL - 20, 55, (x >> 5) % 2 === 0, 0.35);
  // the chamber: eggs and bones heaped by the walls
  put(a.bones, ARENA_X + 24, FLOOR + 2, 13);
  put(a.eggCluster, ARENA_X + 110, FLOOR + 2, 13, true);
  put(a.eggCluster, ARENA_X + 150, FLOOR + 2, 13);
  return out;
}
