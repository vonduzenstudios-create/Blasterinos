import { VW } from '../engine/gfx';
import { TS } from '../art/tiles';
import type { Game } from './game';
import type { Stage, Deck } from './stage';
import type { Hittable } from './weapons';
import { Gate, Hydra } from './boss';
import { buildWorld, buildSpawns, buildScenery, buildDecor, SHAFT_X, GATE_CAM_X, JUNGLE_CAM_Y, ARENA_FLOOR, LAKE_Y, GROUND, type Spawn } from './level';
import { STAGE_SONG, BOSS_SONG } from './music';

type CamMode = 'scroll' | 'gate' | 'climb' | 'boss';

/** Stage 1, "Venom Falls": jungle run, fortress gate, waterfall climb, hydra. */
export class Stage1 implements Stage {
  readonly num = 1;
  readonly name = 'VENOM FALLS';
  readonly song = STAGE_SONG;
  readonly bossSong = BOSS_SONG;
  readonly clearLines = ['THE HYDRA OF VENOM FALLS IS NO MORE.'];
  gate: Gate | null = null;
  hydra: Hydra | null = null;
  camMode: CamMode = 'scroll';

  constructor(public g: Game) {}

  get inBoss() { return !!this.hydra; }
  get bossActive() { return this.camMode === 'gate' || this.camMode === 'boss'; }

  build(cp: number) {
    const g = this.g;
    g.world = buildWorld();
    if (cp > 0) g.world.fill(197, 80, 199, GROUND - 1, 0); // gate already destroyed
    g.world.build(g.gfx);
    g.scenery = buildScenery(g.gfx, g.assets);
    buildDecor(g.gfx, g.assets);
    g.spawns = buildSpawns();
    if (cp === 0) {
      g.gfx.camX = 0; g.gfx.camY = JUNGLE_CAM_Y; this.camMode = 'scroll';
      this.gate = new Gate(g, 196 * TS - 8, GROUND * TS);
    } else if (cp === 1) {
      g.gfx.camX = SHAFT_X; g.gfx.camY = JUNGLE_CAM_Y; this.camMode = 'climb';
      for (const s of g.spawns) if (s.x < SHAFT_X) s.done = true;
    } else {
      g.gfx.camX = SHAFT_X; g.gfx.camY = 0; this.camMode = 'climb';
      for (const s of g.spawns) s.done = true;
    }
  }

  start(cp: number) {
    const g = this.g;
    const starts = [[3 * TS, GROUND * TS - 40], [SHAFT_X + 60, GROUND * TS - 40], [SHAFT_X + 60, ARENA_FLOOR + 3 * TS]];
    const [x, y] = starts[cp];
    return {
      x, y,
      after: cp === 2 ? () => { g.player.body.y = 15 * TS; g.player.body.vy = -5.5; g.gfx.camY = 0; } : undefined,
    };
  }

  update() {
    this.gate?.update();
    if (this.gate?.dead) { this.gate.destroy(); this.gate = null; }
    this.hydra?.update();
  }

  updateCamera() {
    const g = this.g, gx = g.gfx, p = g.player;
    const px = p.body.x, py = p.body.y;
    switch (this.camMode) {
      case 'scroll': {
        const target = Math.min(px - 150, SHAFT_X);
        if (target > gx.camX) gx.camX = Math.min(target, gx.camX + 4);
        if (this.gate && gx.camX >= GATE_CAM_X) { gx.camX = GATE_CAM_X; this.camMode = 'gate'; this.gate.active = true; g.audio.sfx('alarm'); g.banner = { text: 'WARNING', sub: 'FORTRESS GATE', t: 120 }; }
        if (gx.camX >= SHAFT_X) {
          gx.camX = SHAFT_X; this.camMode = 'climb'; g.checkpoint = Math.max(g.checkpoint, 1);
          g.banner = { text: 'CLIMB THE FALLS', sub: g.input.lastDevice === 'gamepad' ? 'PRESS Y TO GRAPPLE' : 'PRESS C OR L TO GRAPPLE', t: 0 };
        }
        break;
      }
      case 'gate': break;
      case 'climb': {
        // near the top, pull the view all the way up to frame the arena
        const target = py < 17 * TS ? 0 : Math.max(0, py - 130);
        if (target < gx.camY) gx.camY = Math.max(target, gx.camY - 4);
        if (gx.camY <= 0 && py < 16 * TS && !this.hydra) {
          gx.camY = 0; this.camMode = 'boss'; g.checkpoint = 2;
          this.hydra = new Hydra(g, SHAFT_X + VW / 2, LAKE_Y, ARENA_FLOOR);
          g.audio.play(BOSS_SONG);
          g.banner = { text: 'WARNING', sub: 'HYDRA OF THE FALLS', t: 60 };
          for (const e of g.enemies) e.dead = true;
        }
        break;
      }
      case 'boss': gx.camY = 0; break;
    }
  }

  parts(): Hittable[] {
    const out: Hittable[] = [];
    if (this.gate) out.push(...this.gate.parts());
    if (this.hydra) out.push(...this.hydra.parts());
    return out;
  }

  bossBar(): [number, number, string] | null {
    if (this.hydra) return this.hydra.phase === 'rise' ? null : [this.hydra.totalHp(), this.hydra.maxHp(), 'HYDRA'];
    if (this.gate && this.gate.active) return [this.gate.core.hp + this.gate.cannons.reduce((a, k) => a + Math.max(0, k.hp), 0), 77, 'GATE'];
    return null;
  }

  spawn(_s: Spawn) { return false; }
  deck(): Deck | null { return null; }
  respawn() { return false; }
  onMidBossDefeated() {
    this.camMode = 'scroll';
    this.g.banner = { text: 'GATE DESTROYED', t: 120 };
  }
  onBossDefeated() { this.hydra?.destroy(); this.hydra = null; }
  destroy() {
    this.gate?.destroy(); this.gate = null;
    this.hydra?.destroy(); this.hydra = null;
  }
}
