import { Gfx, VW, VH } from '../engine/gfx';
import { Input } from '../engine/input';
import { audio, type Audio } from '../engine/audio';
import { drawText } from '../engine/font';
import { buildAssets, type Assets } from './assets';
import { World } from './world';
import { Player, HEROES, type HeroDef } from './player';
import { PlayerBullet, WEAPON_NAMES, type Hittable } from './weapons';
import { Enemy, EnemyBullet, Pickup, Runner, Rifleman, Turret, Leaper, Drone, Crawler, Capsule, RunnerSpawner, LogSpawner } from './enemies';
import { Gate, Hydra } from './boss';
import { buildWorld, buildSpawns, buildScenery, buildDecor, SHAFT_X, GATE_CAM_X, JUNGLE_CAM_Y, ARENA_FLOOR, LAKE_Y, GROUND, MAP_H, type Spawn, type Scenery } from './level';
import { TS } from '../art/tiles';
import { STAGE_SONG, BOSS_SONG, TITLE_SONG, CLEAR_SONG, GAMEOVER_SONG, READY_SONG } from './music';
import { explode } from './effects';

type Mode = 'title' | 'select' | 'intro' | 'play' | 'paused' | 'gameover' | 'clear';
type CamMode = 'scroll' | 'gate' | 'climb' | 'boss';

interface Updatable { dead: boolean; update(): void; destroy(): void; }
interface FloatText { text: string; x: number; y: number; t: number; }

export class Game {
  gfx: Gfx;
  input = new Input();
  audio: Audio = audio;
  assets!: Assets;
  hud: CanvasRenderingContext2D;
  mode: Mode = 'title';
  modeT = 0;
  t = 0;

  world!: World;
  scenery!: Scenery;
  player!: Player;
  hero: HeroDef = HEROES[0];
  enemies: Enemy[] = [];
  pBullets: PlayerBullet[] = [];
  eBullets: EnemyBullet[] = [];
  pickups: Pickup[] = [];
  fx: Updatable[] = [];
  misc: Updatable[] = [];
  spawns: Spawn[] = [];
  gate: Gate | null = null;
  hydra: Hydra | null = null;
  camMode: CamMode = 'scroll';
  checkpoint = 0;
  lives = 3;
  score = 0;
  hiScore = 0;
  continues = 3;
  texts: FloatText[] = [];
  banner: { text: string; sub?: string; t: number } | null = null;
  selectIdx = 0;
  menuIdx = 0;
  titleCam = 0;
  private sceneReady = false;

  constructor(glCanvas: HTMLCanvasElement, hudCanvas: HTMLCanvasElement) {
    this.gfx = new Gfx(glCanvas);
    hudCanvas.width = VW; hudCanvas.height = VH;
    this.hud = hudCanvas.getContext('2d')!;
    this.hud.imageSmoothingEnabled = false;
    this.input.onFirstInteraction = () => { this.audio.init(); };
    try { this.hiScore = parseInt(localStorage.getItem('blasterinos.hi') || '0') || 0; } catch { /* storage unavailable */ }
  }

  boot() {
    this.assets = buildAssets();
    this.buildScene(0);
    this.setMode('title');
  }

  get bossActive() { return this.camMode === 'gate' || this.camMode === 'boss'; }
  addFx(f: Updatable) { this.fx.push(f); }
  addScore(n: number) { this.score += n; if (this.score > this.hiScore) this.hiScore = this.score; }
  flashText(text: string, x: number, y: number) { this.texts.push({ text, x, y, t: 0 }); }
  targets(): Hittable[] {
    const out: Hittable[] = [...this.enemies];
    if (this.gate) out.push(...this.gate.parts());
    if (this.hydra) out.push(...this.hydra.parts());
    return out;
  }

  setMode(m: Mode) {
    this.mode = m; this.modeT = 0;
    if (m === 'title') this.audio.play(TITLE_SONG);
    if (m === 'gameover') this.audio.play(GAMEOVER_SONG);
    if (m === 'clear') this.audio.play(CLEAR_SONG);
  }

  // ---------------------------------------------------------------- scene setup
  private clearEntities() {
    for (const list of [this.enemies, this.pBullets, this.eBullets, this.pickups, this.fx, this.misc] as Updatable[][]) { for (const e of list) e.destroy(); list.length = 0; }
    this.gate?.destroy(); this.gate = null;
    this.hydra?.destroy(); this.hydra = null;
    this.player?.destroy();
  }
  buildScene(cp: number) {
    if (this.sceneReady) this.clearEntities();
    this.gfx.clear();
    this.world = buildWorld();
    if (cp > 0) this.world.fill(197, 80, 199, GROUND - 1, 0); // gate already destroyed
    this.world.build(this.gfx);
    this.scenery = buildScenery(this.gfx, this.assets);
    buildDecor(this.gfx, this.assets);
    this.spawns = buildSpawns();
    this.checkpoint = cp;
    if (cp === 0) {
      this.gfx.camX = 0; this.gfx.camY = JUNGLE_CAM_Y; this.camMode = 'scroll';
      this.gate = new Gate(this, 196 * TS - 8, GROUND * TS);
    } else if (cp === 1) {
      this.gfx.camX = SHAFT_X; this.gfx.camY = JUNGLE_CAM_Y; this.camMode = 'climb';
      for (const s of this.spawns) if (s.x < SHAFT_X) s.done = true;
    } else {
      this.gfx.camX = SHAFT_X; this.gfx.camY = 0; this.camMode = 'climb';
      for (const s of this.spawns) s.done = true;
    }
    this.sceneReady = true;
  }
  startStage(cp: number) {
    this.buildScene(cp);
    const starts = [[3 * TS, GROUND * TS - 40], [SHAFT_X + 60, GROUND * TS - 40], [SHAFT_X + 60, ARENA_FLOOR + 3 * TS]];
    const [x, y] = starts[cp];
    this.player = new Player(this, this.hero, x, y);
    this.player.respawn(x, y);
    this.player.invuln = 60;
    if (cp === 2) { this.player.body.y = 15 * TS; this.player.body.vy = -5.5; this.gfx.camY = 0; }
    this.banner = null;
    this.texts = [];
    this.setMode('intro');
    this.audio.play(READY_SONG);
  }

  // ---------------------------------------------------------------- main update
  update() {
    this.t++; this.modeT++;
    this.input.update();
    switch (this.mode) {
      case 'title': this.updateTitle(); break;
      case 'select': this.updateSelect(); break;
      case 'intro':
        this.updateWorld(false);
        if (this.modeT > 130) { this.setMode('play'); this.audio.play(this.hydra ? BOSS_SONG : STAGE_SONG); }
        break;
      case 'play':
        if (this.input.pressed('start')) { this.setMode('paused'); this.audio.sfx('pause'); this.audio.musicBus && (this.audio.musicBus.gain.value = 0.1); break; }
        this.updateWorld(true);
        break;
      case 'paused':
        if (this.input.pressed('start')) { this.mode = 'play'; this.audio.sfx('pause'); this.audio.musicBus && (this.audio.musicBus.gain.value = 0.32); }
        break;
      case 'gameover': this.updateGameOver(); break;
      case 'clear':
        this.updateWorld(false);
        if (this.modeT > 240 && (this.input.pressed('start') || this.input.pressed('jump'))) {
          this.buildScene(0);
          this.setMode('title');
        }
        break;
    }
    this.gfx.update();
    this.scenery.update(this.gfx.camX, this.gfx.camY, this.t / 60);
    this.drawHud();
  }
  render() { this.gfx.render(); }

  private updateTitle() {
    // slow pan across the stage behind the logo
    this.titleCam += 0.4;
    const span = SHAFT_X - VW;
    const k = (this.titleCam % (span * 2));
    this.gfx.camX = k < span ? k : span * 2 - k;
    this.gfx.camY = JUNGLE_CAM_Y;
    this.gate?.update();
    if (this.modeT > 30 && (this.input.pressed('start') || this.input.pressed('jump') || this.input.pressed('shoot'))) {
      this.audio.init();
      this.audio.sfx('select');
      this.setMode('select');
    }
  }
  private updateSelect() {
    const i = this.input;
    if (i.pressed('left') || i.pressed('right')) { this.selectIdx = 1 - this.selectIdx; this.audio.sfx('menu'); }
    if (this.modeT > 10 && (i.pressed('start') || i.pressed('jump') || i.pressed('shoot'))) {
      this.audio.sfx('select');
      this.hero = HEROES[this.selectIdx];
      this.lives = 3; this.score = 0; this.continues = 3;
      this.startStage(0);
    }
    if (i.pressed('special')) this.setMode('title');
  }
  private updateGameOver() {
    const i = this.input;
    if (this.continues > 0) {
      if (i.pressed('up') || i.pressed('down')) { this.menuIdx = 1 - this.menuIdx; this.audio.sfx('menu'); }
      if (this.modeT > 60 && (i.pressed('start') || i.pressed('jump') || i.pressed('shoot'))) {
        this.audio.sfx('select');
        if (this.menuIdx === 0) { this.continues--; this.lives = 3; this.score = 0; this.startStage(this.checkpoint); }
        else { this.buildScene(0); this.setMode('title'); }
      }
    } else if (this.modeT > 120 && (i.pressed('start') || i.pressed('jump'))) { this.buildScene(0); this.setMode('title'); }
  }

  private updateWorld(live: boolean) {
    const p = this.player;
    if (live || this.mode === 'intro' || this.mode === 'clear') p.update();
    if (this.mode === 'clear' && p.body.onGround) p.body.vx = 0;
    this.updateCamera();
    this.activateSpawns();
    this.gate?.update();
    if (this.gate?.dead) { this.gate.destroy(); this.gate = null; }
    this.hydra?.update();
    const step = (list: Updatable[]) => {
      for (const e of list) if (!e.dead) e.update();
      for (let k = list.length - 1; k >= 0; k--) if (list[k].dead) { list[k].destroy(); list.splice(k, 1); }
    };
    step(this.misc);
    step(this.enemies);
    step(this.pBullets);
    this.collide();
    step(this.eBullets);
    step(this.pickups);
    step(this.fx);
    for (const t of this.texts) t.t++;
    this.texts = this.texts.filter((t) => t.t < 60);
    if (this.banner) { this.banner.t++; if (this.banner.t > 240) this.banner = null; }
  }

  private collide() {
    const targets = this.targets();
    for (const b of this.pBullets) {
      if (b.dead) continue;
      const bb = b.box();
      for (const e of targets) {
        if (e.dead || b.hitSet.has(e)) continue;
        const eb = e.box();
        if (bb[0] < eb[2] && bb[2] > eb[0] && bb[1] < eb[3] && bb[3] > eb[1]) {
          if (e.invulnerable) { if (!b.pierce) { b.dead = true; this.audio.sfx('clink', 0.4); } continue; }
          e.hit(b.dmg, this);
          b.hitSet.add(e);
          if (!b.pierce) { b.dead = true; if (b.kind === 'H') explode(this, b.x, b.y, 'S', false); break; }
        }
      }
    }
  }

  private updateCamera() {
    const g = this.gfx, p = this.player;
    const px = p.body.x, py = p.body.y;
    switch (this.camMode) {
      case 'scroll': {
        const target = Math.min(px - 150, SHAFT_X);
        if (target > g.camX) g.camX = Math.min(target, g.camX + 4);
        if (this.gate && g.camX >= GATE_CAM_X) { g.camX = GATE_CAM_X; this.camMode = 'gate'; this.gate.active = true; this.audio.sfx('alarm'); this.banner = { text: 'WARNING', sub: 'FORTRESS GATE', t: 120 }; }
        if (g.camX >= SHAFT_X) {
          g.camX = SHAFT_X; this.camMode = 'climb'; this.checkpoint = Math.max(this.checkpoint, 1);
          this.banner = { text: 'CLIMB THE FALLS', sub: this.input.lastDevice === 'gamepad' ? 'PRESS Y TO GRAPPLE' : 'PRESS C OR L TO GRAPPLE', t: 0 };
        }
        break;
      }
      case 'gate': break;
      case 'climb': {
        // near the top, pull the view all the way up to frame the arena
        const target = py < 17 * TS ? 0 : Math.max(0, py - 130);
        if (target < g.camY) g.camY = Math.max(target, g.camY - 4);
        if (g.camY <= 0 && py < 16 * TS && !this.hydra) {
          g.camY = 0; this.camMode = 'boss'; this.checkpoint = 2;
          this.hydra = new Hydra(this, SHAFT_X + VW / 2, LAKE_Y, ARENA_FLOOR);
          this.audio.play(BOSS_SONG);
          this.banner = { text: 'WARNING', sub: 'HYDRA OF THE FALLS', t: 60 };
          for (const e of this.enemies) e.dead = true;
        }
        break;
      }
      case 'boss': g.camY = 0; break;
    }
  }

  private activateSpawns() {
    const g = this.gfx;
    for (const s of this.spawns) {
      if (s.done) continue;
      const inX = s.x < g.camX + VW + 24 && s.x > g.camX - 40;
      const inY = s.y > g.camY - 30 && s.y < g.camY + VH + 60;
      if (!(inX && inY)) continue;
      s.done = true;
      const edgeX = g.camX + VW + 16;
      switch (s.kind) {
        case 'runners': this.misc.push(new RunnerSpawner(this, s.arg[0], s.arg[1], s.arg[2])); break;
        case 'logs': this.misc.push(new LogSpawner(this, s.arg[0] - VH, s.arg[1], [SHAFT_X + 120, SHAFT_X + 190, SHAFT_X + 260], 140)); break;
        case 'rifle': this.enemies.push(new Rifleman(this, s.x, s.y)); break;
        case 'rifleBag': this.enemies.push(new Rifleman(this, s.x, s.y, false, true)); break;
        case 'sniper': this.enemies.push(new Rifleman(this, s.x, s.y, true)); break;
        case 'turret': this.enemies.push(new Turret(this, s.x, s.y)); break;
        case 'leaper': this.enemies.push(new Leaper(this, s.x, s.y)); break;
        case 'drone': this.enemies.push(new Drone(this, s.arg < 0 ? Math.max(s.x, edgeX) : g.camX - 16, s.y - 30, s.arg)); break;
        case 'crawler': this.enemies.push(new Crawler(this, s.x, s.y, s.arg)); break;
        case 'capsule': this.enemies.push(new Capsule(this, g.camX - 16, s.y, s.arg, 1)); break;
      }
    }
  }

  // ---------------------------------------------------------------- events
  onPlayerDead() {
    this.lives--;
    if (this.lives <= 0) { this.menuIdx = 0; this.setMode('gameover'); return; }
    // drop back in Contra style, near where the player was
    const g = this.gfx, p = this.player;
    const want = Math.max(g.camX + 30, Math.min(g.camX + VW - 30, p.lastSafe.x));
    const xs = [want, want - 40, want + 40, want - 80, want + 80, g.camX + VW / 2, g.camX + 60, g.camX + VW - 60];
    for (const x of xs) {
      const tx = Math.floor(x / TS);
      for (let ty = Math.floor((g.camY + 40) / TS); ty < Math.floor((g.camY + VH - 4) / TS); ty++) {
        if ((this.world.solid(tx, ty) || this.world.oneway(tx, ty)) && !this.world.solid(tx, ty - 1) && !this.world.solid(tx, ty - 2)) {
          p.respawn(tx * TS + 8, Math.max(g.camY + 10, ty * TS - 60));
          return;
        }
      }
    }
    p.respawn(p.lastSafe.x, p.lastSafe.y - 40);
  }
  onMidBossDefeated() {
    this.camMode = 'scroll';
    this.banner = { text: 'GATE DESTROYED', t: 120 };
  }
  onBossDefeated() {
    this.hydra?.destroy(); this.hydra = null;
    this.addScore(this.lives * 5000);
    this.setMode('clear');
    try { localStorage.setItem('blasterinos.hi', String(this.hiScore)); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- HUD + menus
  private drawHud() {
    const c = this.hud;
    c.clearRect(0, 0, VW, VH);
    if (this.mode === 'title') return this.drawTitle();
    if (this.mode === 'select') return this.drawSelect();
    const p = this.player;
    // lives as medals
    const medal = this.assets.fx.medal.canvas;
    drawText(c, '1P', 6, 5, '#7ac0ff');
    for (let i = 0; i < Math.min(8, this.lives - 1); i++) c.drawImage(medal, 22 + i * 9, 3);
    drawText(c, String(this.score).padStart(7, '0'), 6, 15, '#ffffff');
    drawText(c, 'HI ' + String(this.hiScore).padStart(7, '0'), VW - 6, 5, '#ffd040', { align: 'right' });
    // weapon slots
    for (let i = 0; i < 2; i++) {
      const w = p.weapons[i];
      const x = 6 + i * 26, y = 26;
      const active = i === p.slot;
      c.fillStyle = active ? '#ffd040' : '#3a3450';
      c.fillRect(x - 1, y - 1, 24, 16);
      c.fillStyle = '#120d16'; c.fillRect(x, y, 22, 14);
      drawText(c, w.kind, x + 3, y + 4, active ? '#ffffff' : '#8a84a0');
      for (let l = 0; l < w.level; l++) { c.fillStyle = active ? '#ff5050' : '#6a3040'; c.fillRect(x + 12 + l * 4, y + 9, 3, 3); }
    }
    drawText(c, WEAPON_NAMES[p.weapon.kind], 60, 30, '#c8c0e0');
    if (p.def.armor) drawText(c, p.armor ? 'ARMOR' : 'ARMOR ' + Math.ceil(p.armorRegen / 60), 6, 44, p.armor ? '#7ae0ff' : '#5a6070');
    if (p.barrier > 0) drawText(c, 'BARRIER ' + Math.ceil(p.barrier / 60), 6, p.def.armor ? 54 : 44, '#d080ff');
    // boss bar
    const bossHp = this.hydra ? [this.hydra.totalHp(), this.hydra.maxHp(), 'HYDRA'] : this.gate && this.gate.active ? [this.gate.core.hp + this.gate.cannons.reduce((a, k) => a + Math.max(0, k.hp), 0), 77, 'GATE'] : null;
    if (bossHp && !(this.hydra && this.hydra.phase === 'rise')) {
      const [hp, max, name] = bossHp as [number, number, string];
      const bw = 140, bx = VW / 2 - bw / 2, by = 18;
      drawText(c, name, VW / 2, 8, '#ff8080', { align: 'center' });
      c.fillStyle = '#120d16'; c.fillRect(bx - 2, by - 2, bw + 4, 8);
      c.fillStyle = '#5a1020'; c.fillRect(bx, by, bw, 4);
      c.fillStyle = '#ff3a3a'; c.fillRect(bx, by, Math.max(0, Math.round((bw * hp) / max)), 4);
      c.fillStyle = '#ffa0a0'; c.fillRect(bx, by, Math.max(0, Math.round((bw * hp) / max)), 1);
    }
    // floating texts
    for (const t of this.texts) drawText(c, t.text, t.x - this.gfx.camX, t.y - this.gfx.camY - t.t * 0.4, t.t % 6 < 3 ? '#ffffff' : '#ffd040', { align: 'center' });
    if (this.banner) {
      const b = this.banner;
      if (b.text === 'WARNING' ? b.t % 30 < 20 : true) drawText(c, b.text, VW / 2, 80, b.text === 'WARNING' ? '#ff4040' : '#ffffff', { align: 'center', scale: 2 });
      if (b.sub) drawText(c, b.sub, VW / 2, 100, '#ffd040', { align: 'center' });
    }
    if (this.mode === 'intro') {
      c.fillStyle = 'rgba(8,6,16,0.55)'; c.fillRect(0, 70, VW, 56);
      drawText(c, 'STAGE 1', VW / 2, 80, '#ffd040', { align: 'center', scale: 2 });
      drawText(c, 'VENOM FALLS', VW / 2, 102, '#ffffff', { align: 'center' });
      if (this.checkpoint === 0) {
        const hint = this.input.lastDevice === 'gamepad' ? 'X SHOOT  A JUMP  Y GRAPPLE  RB LOCK AIM  B SWAP' : 'X SHOOT  Z JUMP  C GRAPPLE  SHIFT LOCK AIM  V SWAP';
        drawText(c, hint, VW / 2, 190, '#c8c0e0', { align: 'center' });
      }
    }
    if (this.mode === 'paused') {
      c.fillStyle = 'rgba(8,6,16,0.6)'; c.fillRect(0, 0, VW, VH);
      drawText(c, 'PAUSED', VW / 2, 70, '#ffffff', { align: 'center', scale: 2 });
      this.drawControls(100);
    }
    if (this.mode === 'gameover') {
      c.fillStyle = `rgba(8,6,16,${Math.min(0.75, this.modeT / 60)})`; c.fillRect(0, 0, VW, VH);
      drawText(c, 'GAME OVER', VW / 2, 70, '#ff4040', { align: 'center', scale: 3 });
      if (this.continues > 0 && this.modeT > 60) {
        drawText(c, 'CONTINUE  (' + this.continues + ' LEFT)', VW / 2, 112, '#ffffff', { align: 'center' });
        drawText(c, (this.menuIdx === 0 ? '> ' : '  ') + 'YES', VW / 2 - 20, 130, this.menuIdx === 0 ? '#ffd040' : '#8a84a0');
        drawText(c, (this.menuIdx === 1 ? '> ' : '  ') + 'NO', VW / 2 - 20, 142, this.menuIdx === 1 ? '#ffd040' : '#8a84a0');
      }
    }
    if (this.mode === 'clear') {
      c.fillStyle = `rgba(8,6,16,${Math.min(0.6, this.modeT / 90)})`; c.fillRect(0, 0, VW, VH);
      drawText(c, 'STAGE CLEAR!', VW / 2, 50, '#ffd040', { align: 'center', scale: 3 });
      if (this.modeT > 60) drawText(c, 'SCORE ' + this.score, VW / 2, 92, '#ffffff', { align: 'center', scale: 2 });
      if (this.modeT > 100) drawText(c, 'THE HYDRA OF VENOM FALLS IS NO MORE.', VW / 2, 124, '#c8c0e0', { align: 'center' });
      if (this.modeT > 140) drawText(c, 'THANKS FOR PLAYING THE BLASTERINOS TECH DEMO', VW / 2, 140, '#c8c0e0', { align: 'center' });
      if (this.modeT > 240 && this.modeT % 60 < 40) drawText(c, 'PRESS START', VW / 2, 180, '#ffffff', { align: 'center' });
    }
  }
  private drawControls(y: number) {
    const c = this.hud;
    const pad = this.input.lastDevice === 'gamepad';
    const rows = pad
      ? [['MOVE / AIM', 'D-PAD OR STICK'], ['SHOOT', 'X'], ['JUMP', 'A  (DOWN+A DROPS)'], ['GRAPPLE', 'Y  (UP+Y STRAIGHT UP)'], ['LOCK AIM', 'RB / LT / RT'], ['SWAP WEAPON', 'B / LB']]
      : [['MOVE / AIM', 'ARROWS OR WASD'], ['SHOOT', 'X OR J'], ['JUMP', 'Z, K OR SPACE'], ['GRAPPLE', 'C OR L'], ['LOCK AIM', 'SHIFT OR U'], ['SWAP WEAPON', 'V OR I']];
    rows.forEach(([a, b], i) => {
      drawText(c, a, VW / 2 - 10, y + i * 11, '#ffd040', { align: 'right' });
      drawText(c, b, VW / 2 + 6, y + i * 11, '#ffffff');
    });
  }
  private drawTitle() {
    const c = this.hud;
    c.fillStyle = 'rgba(8,6,20,0.35)'; c.fillRect(0, 0, VW, VH);
    // logo: layered shadow + gradient fill, drawn with the pixel font
    const logo = 'BLASTERINOS';
    const y = 34 + Math.round(Math.sin(this.t / 30) * 2);
    drawText(c, logo, VW / 2 + 3, y + 3, '#120d16', { align: 'center', scale: 4, shadow: null });
    drawText(c, logo, VW / 2, y, '#c02028', { align: 'center', scale: 4, shadow: '#5a0a10' });
    c.save();
    c.beginPath(); c.rect(0, y, VW, 12); c.clip();
    drawText(c, logo, VW / 2, y, '#ffb040', { align: 'center', scale: 4, shadow: null });
    c.restore();
    c.save();
    c.beginPath(); c.rect(0, y, VW, 5); c.clip();
    drawText(c, logo, VW / 2, y, '#fff0a0', { align: 'center', scale: 4, shadow: null });
    c.restore();
    drawText(c, 'A CODE-GENERATED RUN AND GUN TECH DEMO', VW / 2, y + 36, '#c8c0e0', { align: 'center' });
    if (this.modeT % 60 < 42) drawText(c, 'PRESS START', VW / 2, 120, '#ffffff', { align: 'center', scale: 2 });
    this.drawControls(146);
    drawText(c, 'HI ' + String(this.hiScore).padStart(7, '0'), VW / 2, 8, '#ffd040', { align: 'center' });
  }
  private drawSelect() {
    const c = this.hud;
    c.fillStyle = 'rgba(8,6,20,0.75)'; c.fillRect(0, 0, VW, VH);
    drawText(c, 'SELECT YOUR SOLDIER', VW / 2, 14, '#ffffff', { align: 'center', scale: 2 });
    HEROES.forEach((h, i) => {
      const cx = VW / 2 + (i === 0 ? -90 : 90);
      const sel = i === this.selectIdx;
      c.fillStyle = sel ? '#ffd040' : '#3a3450';
      c.fillRect(cx - 62, 38, 124, 150);
      c.fillStyle = sel ? '#2a2040' : '#14101e';
      c.fillRect(cx - 60, 40, 120, 146);
      const fr = this.assets.heroes[h.id];
      const f = sel ? fr.run.f[Math.floor(this.t / 6) % 6] : fr.stand.f;
      c.drawImage(f.canvas, Math.round(cx - f.ax * 2), 110 - f.ay * 2, f.w * 2, f.h * 2);
      drawText(c, h.name, cx, 120, sel ? '#ffd040' : '#8a84a0', { align: 'center', scale: 2 });
      h.blurb.forEach((b, k) => drawText(c, b, cx, 142 + k * 10, sel ? '#ffffff' : '#6a6480', { align: 'center' }));
      const stat = (label: string, v: number, y: number) => {
        drawText(c, label, cx - 52, y, '#8a84a0');
        for (let k = 0; k < 5; k++) { c.fillStyle = k < v ? (sel ? '#ff5050' : '#6a3040') : '#2a2438'; c.fillRect(cx + 4 + k * 9, y, 7, 6); }
      };
      stat('SPEED', h.id === 'ryder' ? 5 : 3, 176 - 2);
    });
    if (this.modeT % 60 < 42) drawText(c, '< >  CHOOSE    START  CONFIRM', VW / 2, 200, '#c8c0e0', { align: 'center' });
  }
}
