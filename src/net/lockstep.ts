// Online co-op by deterministic lockstep.
//
// Both machines run the whole game. The only thing that crosses the network is each
// player's buttons: 10 bits per frame, packed two frames to a packet (about 30 small
// packets a second each way). A frame is simulated only once both players' inputs for it
// are in, so the two simulations see exactly the same inputs and stay identical.
//
// To hide the trip to the other player, local input is scheduled `delay` frames ahead:
// what you press now applies a few frames from now, on both screens at once. The delay
// adapts to the measured round trip. Math.random is swapped for a seeded generator while
// the game updates, so every random roll matches too.

import { PadState, type Input } from '../engine/input';
import { VW, VH } from '../engine/gfx';
import { drawText } from '../engine/font';
import type { Game } from '../game/game';

const STEP = 1000 / 60;
const RING = 512, MASK = RING - 1;
/** Both sides start with this many empty input frames, so nobody waits on frame 0. */
const START_DELAY = 4;
const MIN_DELAY = 2, MAX_DELAY = 12;
const HASH_EVERY = 120;

const enum Msg { Input = 1, Ping = 2, Pong = 3, Hash = 4 }

/** Small, fast seeded PRNG (mulberry32). Same seed, same sequence on every browser. */
function seeded(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, state: () => s };
}

export class Lockstep {
  /** Input bits per player, by frame. */
  private inputs = [new Uint16Array(RING), new Uint16Array(RING)];
  /** Inputs are known for frames [0, known[i]) for player i. */
  private known = [START_DELAY, START_DELAY];
  private pads: PadState[];
  private menu: PadState;
  private rng: ReturnType<typeof seeded>;
  private pending: number[] = [];
  private pendingFrom = START_DELAY;
  private acc = 0;
  private last = performance.now();
  private lastPing = 0;
  private stallTicks = 0;
  private ours = new Map<number, number>();
  private theirs = new Map<number, number>();
  private ended = false;
  frame = 0;
  delay = START_DELAY;
  rtt = -1;
  desync = false;
  /** Bytes sent and received (WebSocket payload only), for the on-screen meter. */
  bytesOut = 0;
  bytesIn = 0;
  onEnd: ((reason: string) => void) | null = null;

  constructor(private ws: WebSocket, private game: Game, readonly me: 0 | 1, seed: number, opts: { stage: number; cp: number }) {
    const device: Input = game.device;
    this.pads = [new PadState(device), new PadState(device)];
    this.menu = new PadState(device);
    this.rng = seeded(seed);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e) => this.receive(e.data);
    ws.onclose = () => this.end('Lost the connection to the server.');
    // set up the shared starting state with the shared random sequence too
    this.withSeededRandom(() => game.startNet(this.pads, this.menu, opts));
  }

  get stalled() { return this.stallTicks > 20; }

  /** Called every animation frame instead of the single player loop. */
  tick(now: number) {
    if (this.ended) return;
    this.acc = Math.min(this.acc + Math.min(100, now - this.last), STEP * 8);
    this.last = now;
    let steps = 0, waiting = false;
    while (this.acc >= STEP && steps < 4) {
      if (this.known[0] <= this.frame || this.known[1] <= this.frame) { waiting = true; break; }
      this.step();
      this.acc -= STEP; steps++;
    }
    this.stallTicks = waiting ? this.stallTicks + 1 : 0;
    // batch two frames per packet; when waiting, send what we have so the partner never waits on us
    if (this.pending.length >= 2 || (this.pending.length && (waiting || this.delay <= MIN_DELAY))) this.flush();
    if (now - this.lastPing > 1000) {
      this.lastPing = now;
      const b = new DataView(new ArrayBuffer(9));
      b.setUint8(0, Msg.Ping); b.setFloat64(1, now);
      this.send(b.buffer);
    }
    if (steps > 0 || this.stalled) this.drawOverlay();
  }

  private step() {
    const g = this.game, device = g.device;
    device.update();
    const bits = device.bits();
    // schedule this input `delay` frames ahead (filling any gap if the delay just grew)
    const target = this.frame + this.delay;
    while (this.known[this.me] <= target) {
      this.inputs[this.me][this.known[this.me] & MASK] = bits;
      this.pending.push(bits);
      this.known[this.me]++;
    }
    const f = this.frame & MASK;
    const a = this.inputs[0][f], b = this.inputs[1][f];
    this.pads[0].set(a); this.pads[1].set(b); this.menu.set(a | b);
    this.withSeededRandom(() => g.update());
    this.frame++;
    if (this.frame % HASH_EVERY === 0) {
      const h = this.hash();
      this.ours.set(this.frame, h);
      this.compare(this.frame);
      const v = new DataView(new ArrayBuffer(9));
      v.setUint8(0, Msg.Hash); v.setUint32(1, this.frame); v.setUint32(5, h);
      this.send(v.buffer);
    }
  }

  private withSeededRandom(fn: () => void) {
    const native = Math.random;
    Math.random = this.rng.next;
    try { fn(); } finally { Math.random = native; }
  }

  private flush() {
    const n = this.pending.length;
    const v = new DataView(new ArrayBuffer(6 + n * 2));
    v.setUint8(0, Msg.Input); v.setUint32(1, this.pendingFrom); v.setUint8(5, n);
    this.pending.forEach((bits, i) => v.setUint16(6 + i * 2, bits));
    this.send(v.buffer);
    this.pendingFrom += n;
    this.pending = [];
  }

  private send(buf: ArrayBuffer) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(buf);
    this.bytesOut += buf.byteLength;
  }

  private receive(data: ArrayBuffer | string) {
    if (typeof data === 'string') {
      let msg: any;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.t === 'left') this.end(msg.reason || 'Your partner left the game.');
      return;
    }
    this.bytesIn += data.byteLength;
    const v = new DataView(data);
    const peer = 1 - this.me;
    switch (v.getUint8(0)) {
      case Msg.Input: {
        const from = v.getUint32(1), n = v.getUint8(5);
        // packets arrive in order over the WebSocket, so this is always the next run of frames
        if (from !== this.known[peer]) { this.end('Network error: input out of order.'); return; }
        for (let i = 0; i < n; i++) this.inputs[peer][(from + i) & MASK] = v.getUint16(6 + i * 2);
        this.known[peer] = from + n;
        break;
      }
      case Msg.Ping: {
        v.setUint8(0, Msg.Pong);
        this.send(data);
        break;
      }
      case Msg.Pong: {
        const rtt = performance.now() - v.getFloat64(1);
        this.rtt = this.rtt < 0 ? rtt : this.rtt * 0.7 + rtt * 0.3;
        // enough frames of delay to cover the one way trip, plus the packet batching and some jitter
        const want = Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.ceil(this.rtt / 2 / STEP) + 2));
        if (want > this.delay) this.delay++;
        else if (want < this.delay) this.delay--;
        break;
      }
      case Msg.Hash: {
        const f = v.getUint32(1);
        this.theirs.set(f, v.getUint32(5));
        this.compare(f);
        break;
      }
    }
  }

  /** Both sides hash their state every few seconds; a mismatch means the games have drifted apart. */
  private compare(f: number) {
    const a = this.ours.get(f), b = this.theirs.get(f);
    if (a === undefined || b === undefined) return;
    this.ours.delete(f); this.theirs.delete(f);
    if (a !== b && !this.desync) {
      this.desync = true;
      console.warn('Blasterinos co-op: the two games went out of sync at frame ' + f);
    }
  }

  hash() {
    const g = this.game;
    let h = 0x811c9dc5;
    const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619); };
    mix(this.rng.state()); mix(g.score); mix(g.lives); mix(g.stageIdx); mix(g.t);
    mix(Math.round(g.gfx.camX * 16)); mix(Math.round(g.gfx.camY * 16));
    mix(g.enemies.length); mix(g.eBullets.length); mix(g.pBullets.length); mix(g.pickups.length);
    for (const p of g.players) { mix(Math.round(p.body.x * 16)); mix(Math.round(p.body.y * 16)); mix(p.state.length); }
    for (const e of g.enemies) { mix(Math.round(e.x * 16)); mix(Math.round(e.y * 16)); mix(e.hp); }
    return h >>> 0;
  }

  private drawOverlay() {
    const c = this.game.hud;
    if (this.stalled) {
      c.fillStyle = '#120d16'; c.fillRect(VW / 2 - 90, VH / 2 - 14, 180, 26);
      drawText(c, 'WAITING FOR PARTNER...', VW / 2, VH / 2 - 6, '#ffd040', { align: 'center' });
    }
    const ping = this.rtt < 0 ? '--' : String(Math.round(this.rtt));
    drawText(c, 'PING ' + ping, VW - 4, VH - 10, '#5a5470', { align: 'right' });
    if (this.desync) drawText(c, 'OUT OF SYNC', 4, VH - 10, '#ff4040');
  }

  private end(reason: string) {
    if (this.ended) return;
    this.ended = true;
    this.ws.onclose = null; this.ws.onmessage = null;
    try { this.ws.close(); } catch { /* already closed */ }
    this.onEnd?.(reason);
  }
  /** Leave the game from this side. */
  quit() { this.end('You left the online game.'); }
}
