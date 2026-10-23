import type { Sprite } from '../engine/gfx';
import { VW, VH } from '../engine/gfx';
import type { Game } from './game';
import { Anim, spark } from './effects';
import { T, TS } from '../art/tiles';

export type WeaponKind = 'R' | 'M' | 'S' | 'L' | 'H' | 'F';
export interface Weapon { kind: WeaponKind; level: number; }

export const WEAPON_NAMES: Record<WeaponKind, string> = {
  R: 'RIFLE', M: 'MACHINE GUN', S: 'SPREAD', L: 'LASER', H: 'HOMING', F: 'FLAME',
};

export interface Hittable {
  dead: boolean;
  invulnerable?: boolean;
  box(): [number, number, number, number]; // x0, y0, x1, y1
  hit(dmg: number, g: Game): void;
  /** Bullets pass through without being consumed (e.g. a shielded boss part that sparks). */
  deflect?: boolean;
}

export class PlayerBullet {
  dead = false;
  sprite: Sprite;
  t = 0;
  hitSet = new Set<Hittable>();
  life: number;
  constructor(public g: Game, public kind: WeaponKind | 'L2', public x: number, public y: number, public vx: number, public vy: number,
    public dmg: number, public pierce = false, life = 90, public w = 4) {
    const fx = g.assets.fx.bullet;
    const frames = fx[kind];
    this.sprite = g.gfx.sprite(frames[0], 35, kind === 'L' || kind === 'L2' || kind === 'F');
    this.life = life;
    this.sync();
  }
  sync() {
    const frames = this.g.assets.fx.bullet[this.kind];
    this.sprite.setFrame(frames[Math.floor(this.t / 3) % frames.length]);
    this.sprite.x = this.x; this.sprite.y = this.y;
    if (this.kind === 'L' || this.kind === 'L2' || this.kind === 'H') {
      this.sprite.rot = Math.atan2(this.vy, this.vx);
    }
    this.sprite.sync();
  }
  update() {
    const g = this.g;
    this.t++;
    if (this.kind === 'H') {
      // home on the nearest target in front
      let best: Hittable | null = null, bd = 1e9;
      for (const e of g.targets()) {
        if (e.dead || e.invulnerable) continue;
        const b = e.box();
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        const d = Math.hypot(cx - this.x, cy - this.y);
        if (d < bd && d < 260) { bd = d; best = e; }
      }
      const sp = Math.min(6.5, Math.hypot(this.vx, this.vy) + 0.12);
      let a = Math.atan2(this.vy, this.vx);
      if (best && this.t > 6) {
        const b = best.box();
        const ta = Math.atan2((b[1] + b[3]) / 2 - this.y, (b[0] + b[2]) / 2 - this.x);
        let da = ta - a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        a += Math.max(-0.13, Math.min(0.13, da));
      }
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
      if (this.t % 3 === 0) g.addFx(new Anim(g, g.assets.fx.puff, this.x - this.vx * 2, this.y - this.vy * 2, 4, 34));
    }
    if (this.kind === 'F') {
      this.vx *= 0.985; this.vy = this.vy * 0.985 - 0.02;
    }
    this.x += this.vx + g.scrollVx; this.y += this.vy;
    this.life--;
    if (this.life <= 0) this.dead = true;
    const cx = g.gfx.camX, cy = g.gfx.camY;
    if (this.x < cx - 30 || this.x > cx + VW + 30 || this.y < cy - 30 || this.y > cy + VH + 30) this.dead = true;
    // the fortress gate's metal is part of the boss, so shots pass into it and hit its parts
    if (this.kind !== 'L' && this.kind !== 'L2' && g.world.solidAtPx(this.x, this.y) && g.world.get(Math.floor(this.x / TS), Math.floor(this.y / TS)) !== T.METAL) {
      this.dead = true;
      spark(g, this.x - this.vx, this.y - this.vy);
    }
    if (!this.dead) this.sync();
  }
  box(): [number, number, number, number] {
    const r = this.kind === 'L' || this.kind === 'L2' ? 8 : this.w;
    return [this.x - r, this.y - r, this.x + r, this.y + r];
  }
  destroy() { this.sprite.remove(); }
}

/** Fire the given weapon. Returns the cooldown in frames. */
export function fireWeapon(g: Game, w: Weapon, x: number, y: number, ang: number): number {
  const shots = g.pBullets;
  const count = (k: string) => shots.filter((b) => !b.dead && (b.kind === k || (k === 'L' && b.kind === 'L2'))).length;
  const c = Math.cos(ang), s = Math.sin(ang);
  const add = (b: PlayerBullet) => g.pBullets.push(b);
  switch (w.kind) {
    case 'R':
      if (count('R') >= 7) return 2;
      add(new PlayerBullet(g, 'R', x, y, c * 6.5, s * 6.5, 1));
      g.audio.sfx('rifle');
      return 5;
    case 'M': {
      const sp = 7, j = (Math.random() - 0.5) * 0.06;
      const vx = Math.cos(ang + j) * sp, vy = Math.sin(ang + j) * sp;
      if (w.level > 1) {
        // level 2: two parallel streams, side by side across the aim line
        const ox = -s * 3, oy = c * 3;
        add(new PlayerBullet(g, 'M', x + ox, y + oy, vx, vy, 1));
        add(new PlayerBullet(g, 'M', x - ox, y - oy, vx, vy, 1));
      } else add(new PlayerBullet(g, 'M', x, y, vx, vy, 1));
      g.audio.sfx('machine');
      return w.level > 1 ? 4 : 5;
    }
    case 'S': {
      if (count('S') >= (w.level > 1 ? 25 : 15)) return 2;
      const spread = w.level > 1 ? [-0.32, -0.16, 0, 0.16, 0.32] : [-0.2, 0, 0.2];
      for (const d of spread) add(new PlayerBullet(g, 'S', x, y, Math.cos(ang + d) * 5.6, Math.sin(ang + d) * 5.6, 1, false, 90, 5));
      g.audio.sfx('spread');
      return 8;
    }
    case 'L': {
      // A new beam replaces any beam still on screen, just like the arcade games.
      for (const b of shots) if (b.kind === 'L' || b.kind === 'L2') b.dead = true;
      const k = w.level > 1 ? 'L2' : 'L';
      for (let i = 0; i < 3; i++) add(new PlayerBullet(g, k, x + c * i * 18, y + s * i * 18, c * 9, s * 9, w.level > 1 ? 4 : 2.5, true));
      g.audio.sfx('laser');
      return 12;
    }
    case 'H': {
      if (count('H') >= (w.level > 1 ? 6 : 3)) return 2;
      add(new PlayerBullet(g, 'H', x, y, c * 3, s * 3, w.level > 1 ? 3 : 2.2, false, 150, 5));
      if (w.level > 1) add(new PlayerBullet(g, 'H', x, y, Math.cos(ang - 0.5) * 3, Math.sin(ang - 0.5) * 3, 3, false, 150, 5));
      g.audio.sfx('homing');
      return 8;
    }
    case 'F': {
      const j = (Math.random() - 0.5) * 0.18;
      add(new PlayerBullet(g, 'F', x, y, Math.cos(ang + j) * 4.6, Math.sin(ang + j) * 4.6, w.level > 1 ? 1 : 0.7, true, w.level > 1 ? 34 : 24, 6));
      g.audio.sfx('flame');
      return 4;
    }
  }
}
