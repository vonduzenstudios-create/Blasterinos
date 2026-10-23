import * as THREE from 'three';
import type { Sprite } from '../engine/gfx';
import { VW, VH } from '../engine/gfx';
import { makeBody, type Body } from './world';
import type { Game } from './game';
import { fireWeapon, type Weapon, type WeaponKind } from './weapons';
import { muzzle, standPose, airPose, runPose, AIMS, type Look, type HeroFrames } from '../art/humanoid';
import { Anim } from './effects';
import { TS } from '../art/tiles';

export interface HeroDef {
  id: 'ryder' | 'voss';
  name: string;
  blurb: string[];
  speed: number;
  jump: number;
  armor: boolean;
}

export const HEROES: HeroDef[] = [
  { id: 'ryder', name: 'RYDER', blurb: ['FAST AND AGILE', 'HIGHER JUMP', 'QUICK GRAPPLE'], speed: 1.75, jump: 5.35, armor: false },
  { id: 'voss', name: 'VOSS', blurb: ['HEAVY ARMOR', 'SHIELD TAKES ONE HIT', 'RECHARGES OVER TIME'], speed: 1.4, jump: 5.0, armor: true },
];

const GRAV = 0.22, MAXFALL = 5.5;

type State = 'play' | 'reel' | 'dying' | 'dead';

export class Player {
  def: HeroDef;
  frames: HeroFrames;
  look: Look;
  body: Body;
  sprite: Sprite;
  shieldSprite: Sprite;
  facing = 1;
  aim = 'f';
  prone = false;
  curl = false;
  state: State = 'play';
  weapons: Weapon[] = [{ kind: 'R', level: 1 }, { kind: 'R', level: 1 }];
  slot = 0;
  cooldown = 0;
  invuln = 0;
  barrier = 0;
  armor = false;
  armorRegen = 0;
  t = 0;
  stateT = 0;
  lastSafe = { x: 0, y: 0 };
  safeT = 0;
  hook: { x: number; y: number; vx: number; vy: number; latched: boolean; tx: number; ty: number; dist: number } | null = null;
  hookSprite: Sprite;
  rope: THREE.Mesh;
  hookCool = 0;
  moving = false;
  locked = false;
  private wasGround = true;

  constructor(public g: Game, def: HeroDef, x: number, y: number) {
    this.def = def;
    this.frames = g.assets.heroes[def.id];
    this.look = g.assets.looks[def.id];
    this.body = makeBody(x, y, 10, 26);
    this.sprite = g.gfx.sprite(this.frames.stand.f, 30);
    this.shieldSprite = g.gfx.sprite(g.assets.fx.ring[3], 31, true);
    this.shieldSprite.visible = false;
    this.armor = def.armor;
    this.hookSprite = g.gfx.sprite(g.assets.fx.hook, 32);
    this.hookSprite.visible = false;
    this.rope = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xd8c890, depthTest: false, depthWrite: false, transparent: true }));
    this.rope.renderOrder = 29;
    this.rope.visible = false;
    g.gfx.scene.add(this.rope);
    this.lastSafe = { x, y };
  }

  get weapon() { return this.weapons[this.slot]; }
  get alive() { return this.state === 'play' || this.state === 'reel'; }

  box(): [number, number, number, number] {
    const b = this.body;
    if (this.prone) return [b.x - 10, b.y - 9, b.x + 10, b.y];
    if (this.curl) return [b.x - 6, b.y - 18, b.x + 6, b.y - 4];
    return [b.x - 4, b.y - 25, b.x + 4, b.y];
  }
  center(): [number, number] { return [this.body.x, this.body.y - (this.prone ? 5 : 14)]; }

  giveWeapon(k: WeaponKind) {
    const w = this.weapon;
    if (w.kind === k) w.level = Math.min(2, w.level + 1);
    else {
      // fill the empty (rifle) slot first so the player keeps what they had
      const other = this.weapons[1 - this.slot];
      if (w.kind !== 'R' && other.kind === 'R') { this.weapons[1 - this.slot] = { kind: k, level: 1 }; this.slot = 1 - this.slot; }
      else this.weapons[this.slot] = { kind: k, level: 1 };
    }
  }

  update() {
    const g = this.g, inp = g.input, b = this.body;
    this.t++; this.stateT++;
    if (this.cooldown > 0) this.cooldown--;
    if (this.hookCool > 0) this.hookCool--;
    if (this.invuln > 0) this.invuln--;
    if (this.barrier > 0) this.barrier--;
    if (this.def.armor && !this.armor) { this.armorRegen--; if (this.armorRegen <= 0) { this.armor = true; g.audio.sfx('swap'); } }

    if (this.state === 'dying' || this.state === 'dead') { this.updateDeath(); this.draw(); return; }

    const left = inp.held('left'), right = inp.held('right'), up = inp.held('up'), down = inp.held('down');
    const dirX = (right ? 1 : 0) - (left ? 1 : 0);
    this.locked = inp.held('lock');

    if (this.state === 'reel') { this.updateReel(); this.draw(); return; }

    if (dirX !== 0) this.facing = dirX;
    const ground = b.onGround;
    // ---- aiming ----
    this.prone = false;
    if (ground && !this.locked) {
      if (down && dirX === 0) { this.prone = true; this.aim = 'f'; }
      else if (up) this.aim = dirX ? 'uf' : 'u';
      else if (down) this.aim = 'df';
      else this.aim = 'f';
    } else if (ground && this.locked) {
      this.aim = up ? (dirX ? 'uf' : 'u') : down ? 'df' : 'f';
    } else {
      this.aim = up ? (dirX ? 'uf' : 'u') : down ? (dirX ? 'df' : 'd') : 'f';
    }

    // ---- movement ----
    const speed = this.def.speed;
    if (this.locked && ground) b.vx = 0;
    else if (this.prone) b.vx = 0;
    else b.vx = dirX * speed;
    this.moving = b.vx !== 0 && ground;

    if (inp.pressed('jump') && ground) {
      if (down && this.onOneway()) { b.dropTimer = 14; b.y += 2; this.curl = false; }
      else { b.vy = -this.def.jump; this.curl = true; g.audio.sfx('jump'); }
    }
    b.vy = Math.min(MAXFALL, b.vy + GRAV);
    // keep inside the camera's left/right edges
    g.world.move(b);
    const minX = g.gfx.camX + 6, maxX = g.gfx.camX + VW - 6;
    if (b.x < minX) b.x = minX;
    if (b.x > maxX) b.x = maxX;
    if (b.onGround) {
      if (!this.wasGround) { this.curl = false; g.audio.sfx('land', 0.6); }
      this.safeT++;
      if (this.safeT > 20 && g.world.groundBelow(b.x - 4, b.y + 1, 1) && g.world.groundBelow(b.x + 4, b.y + 1, 1)) this.lastSafe = { x: b.x, y: b.y };
    } else this.safeT = 0;
    this.wasGround = b.onGround;

    // ---- weapons ----
    if (inp.pressed('swap')) { this.slot = 1 - this.slot; g.audio.sfx('swap'); }
    if (inp.held('shoot') && this.cooldown <= 0) {
      const [mx, my, ang] = this.muzzle();
      this.cooldown = fireWeapon(g, this.weapon, mx, my, ang);
      if (this.weapon.kind !== 'F') g.addFx(new Anim(g, g.assets.fx.flash, mx, my, 2, 36, true));
    }
    // ---- grappling hook ----
    if (inp.pressed('special') && !this.hook && this.hookCool <= 0) this.fireHook(up && dirX === 0);
    this.updateHook();

    // fell off the bottom of the screen
    if (b.y > g.gfx.camY + VH + 40) this.die(true);
    this.draw();
  }

  private onOneway() {
    const b = this.body;
    const ty = Math.floor((b.y + 1) / TS);
    return this.g.world.oneway(Math.floor(b.x / TS), ty) && !this.g.world.solid(Math.floor(b.x / TS), ty);
  }

  muzzle(): [number, number, number] {
    const b = this.body, f = this.facing;
    const ang = (AIMS[this.aim] * Math.PI) / 180;
    const worldAng = f > 0 ? ang : Math.PI - ang;
    if (this.prone) return [b.x + f * 17, b.y - 4, worldAng];
    if (this.curl) return [b.x + Math.cos(worldAng) * 10, b.y - 12 + Math.sin(worldAng) * 10, worldAng];
    const pose = this.body.onGround ? (this.moving ? runPose(this.aim, 0, 6) : standPose(this.aim)) : airPose(this.aim);
    const [mx, my] = muzzle(pose, this.look);
    return [b.x + mx * f, b.y + my, worldAng];
  }

  // ---------------- grappling hook ----------------
  private fireHook(straightUp: boolean) {
    const [cx, cy] = this.center();
    const a = straightUp ? -Math.PI / 2 : (this.facing > 0 ? -Math.PI / 4 : -3 * Math.PI / 4);
    const sp = 8;
    this.hook = { x: cx, y: cy - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, latched: false, tx: 0, ty: 0, dist: 0 };
    this.g.audio.sfx('grapple');
  }
  private updateHook() {
    const h = this.hook;
    if (!h) { this.hookSprite.visible = false; this.rope.visible = false; return; }
    const g = this.g;
    if (!h.latched) {
      for (let s = 0; s < 2; s++) {
        h.x += h.vx / 2; h.y += h.vy / 2; h.dist += 4;
        const tx = Math.floor(h.x / TS), ty = Math.floor(h.y / TS);
        if (g.world.solid(tx, ty) || g.world.oneway(tx, ty)) {
          // find the top of this column so we can pull the player up onto it
          let top = ty;
          while (top > 0 && (g.world.solid(tx, top - 1) || g.world.oneway(tx, top - 1))) top--;
          const free = !g.world.solid(tx, top - 1) && !g.world.solid(tx, top - 2);
          if (free && top <= ty + 0) {
            h.latched = true; h.tx = tx; h.ty = top;
            g.audio.sfx('clink');
            this.state = 'reel'; this.stateT = 0; this.curl = false;
          } else { this.hook = null; this.hookCool = 10; g.audio.sfx('hit'); }
          break;
        }
        if (h.dist > (this.def.id === 'ryder' ? 150 : 130)) { this.hook = null; this.hookCool = 8; break; }
      }
    }
    this.drawHook();
  }
  private updateReel() {
    const h = this.hook!, b = this.body, g = this.g;
    if (!h) { this.state = 'play'; return; }
    // target: standing on top of the hooked column, nudged toward its center
    let tx = h.tx * TS + TS / 2;
    const ty = h.ty * TS;
    // prefer to land on the near half of the platform edge
    tx = Math.max(h.tx * TS + 5, Math.min(h.tx * TS + TS - 5, tx));
    const dx = tx - b.x, dy = (ty - 2) - b.y;
    const d = Math.hypot(dx, dy);
    const sp = this.def.id === 'ryder' ? 6 : 5;
    if (this.stateT % 6 === 0) g.audio.sfx('reel');
    if (d <= sp || this.stateT > 70) {
      b.x = tx; b.y = ty; b.vx = 0; b.vy = 0; b.onGround = true;
      this.state = 'play'; this.hook = null; this.hookCool = 12;
      this.drawHook();
      return;
    }
    b.x += (dx / d) * sp; b.y += (dy / d) * sp;
    b.vy = 0;
    h.x = tx; h.y = ty + 2;
    // can still shoot while reeling
    if (g.input.held('shoot') && this.cooldown <= 0) {
      this.aim = 'f';
      const [mx, my, ang] = this.muzzle();
      this.cooldown = fireWeapon(g, this.weapon, mx, my - 6, ang);
    }
    this.drawHook();
  }
  private drawHook() {
    const h = this.hook;
    if (!h) { this.hookSprite.visible = false; this.rope.visible = false; return; }
    const [hx, hy] = [this.body.x + this.facing * 2, this.body.y - 26];
    this.hookSprite.visible = true;
    this.hookSprite.x = h.x; this.hookSprite.y = h.y;
    this.hookSprite.rot = Math.atan2(h.y - hy, h.x - hx);
    this.hookSprite.sync();
    const dx = h.x - hx, dy = h.y - hy, len = Math.hypot(dx, dy);
    this.rope.visible = true;
    this.rope.position.set(Math.round(hx + dx / 2), -Math.round(hy + dy / 2), 0);
    this.rope.scale.set(Math.max(1, len), 1, 1);
    this.rope.rotation.z = -Math.atan2(dy, dx);
  }

  // ---------------- damage / death ----------------
  hurt() {
    if (!this.alive || this.invuln > 0 || this.barrier > 0) return;
    const g = this.g;
    if (this.armor) {
      this.armor = false; this.armorRegen = 60 * 12; this.invuln = 90;
      g.audio.sfx('armorHit');
      g.gfx.shake = 3;
      for (let i = 0; i < 8; i++) g.addFx(new Anim(g, g.assets.fx.spark, this.body.x + (Math.random() - 0.5) * 16, this.body.y - 14 + (Math.random() - 0.5) * 20, 2, 42, true, i));
      return;
    }
    this.die(false);
  }
  die(fell: boolean) {
    if (!this.alive) return;
    const g = this.g;
    this.state = fell ? 'dead' : 'dying';
    this.stateT = 0;
    this.hook = null; this.drawHook();
    this.body.vx = -this.facing * 1.6; this.body.vy = -3.8;
    this.prone = false; this.curl = false;
    g.audio.sfx('die');
    g.gfx.shake = 4;
    // lose the weapon in hand
    this.weapons[this.slot] = { kind: 'R', level: 1 };
  }
  private updateDeath() {
    const b = this.body, g = this.g;
    if (this.state === 'dying') {
      b.vy = Math.min(MAXFALL, b.vy + GRAV);
      g.world.move(b);
      if (b.onGround && this.stateT > 10) { b.vx = 0; this.state = 'dead'; this.stateT = 0; }
      if (b.y > g.gfx.camY + VH + 40) { this.state = 'dead'; this.stateT = 0; }
    }
    if (this.state === 'dead' && this.stateT > 70) g.onPlayerDead();
  }
  respawn(x: number, y: number) {
    const b = this.body;
    b.x = x; b.y = y; b.vx = 0; b.vy = 1; b.onGround = false;
    this.state = 'play'; this.stateT = 0;
    this.curl = true;
    this.invuln = 150;
    this.lastSafe = { x, y };
  }

  draw() {
    const s = this.sprite, b = this.body, fr = this.frames;
    s.rot = 0;
    s.flip = this.facing < 0;
    if (this.state === 'dying') { s.setFrame(fr.hurt); s.rot = (this.stateT * 0.25) * -this.facing; }
    else if (this.state === 'dead') s.setFrame(fr.dead);
    else if (this.state === 'reel') s.setFrame(fr.hang);
    else if (this.curl && !b.onGround) {
      const f = fr.curl[Math.floor(this.t / 4) % 4];
      s.setFrame(f);
    } else if (this.prone) s.setFrame(fr.prone);
    else if (b.onGround) {
      if (this.moving) {
        const a = this.aim === 'uf' || this.aim === 'df' ? this.aim : 'f';
        s.setFrame(fr.run[a][Math.floor(this.t / 5) % 6]);
      } else s.setFrame(fr.stand[this.aim === 'd' ? 'df' : this.aim]);
    } else s.setFrame(fr.air[this.aim]);
    s.x = b.x; s.y = this.curl && !b.onGround && this.state === 'play' ? b.y - 12 : b.y;
    if (this.state === 'dying' && s.rot !== 0) s.y = b.y - 14;
    s.visible = !(this.invuln > 0 && this.alive && Math.floor(this.t / 3) % 2 === 0);
    s.sync();
    // barrier power-up / armor glint
    const sh = this.shieldSprite;
    if (this.alive && (this.barrier > 0 || (this.armor && this.t % 120 < 10))) {
      sh.visible = this.barrier > 120 || this.t % 4 < 2 || this.barrier === 0;
      sh.setFrame(this.g.assets.fx.ring[this.barrier > 0 ? 3 + (Math.floor(this.t / 3) % 2) : Math.min(5, Math.floor((this.t % 120) / 2))]);
      sh.x = b.x; sh.y = b.y - 13;
      sh.sync();
    } else sh.visible = false;
  }
  destroy() {
    this.sprite.remove(); this.shieldSprite.remove(); this.hookSprite.remove();
    this.g.gfx.scene.remove(this.rope);
  }
}
