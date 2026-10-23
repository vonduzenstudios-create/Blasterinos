// Unified gamepad + keyboard input, sampled once per fixed update.
// Gamepad (standard mapping): A jump, X shoot, Y grapple, B / LB swap weapon,
// RB / RT / LT hold to lock in place, Start pause. D-pad or left stick to move and aim.

export type Button = 'left' | 'right' | 'up' | 'down' | 'jump' | 'shoot' | 'special' | 'swap' | 'lock' | 'start';

export const BUTTONS: Button[] = ['left', 'right', 'up', 'down', 'jump', 'shoot', 'special', 'swap', 'lock', 'start'];

/** What the simulation reads: one per player. The local device and network inputs both fit it. */
export interface Pad {
  readonly lastDevice: 'keyboard' | 'gamepad';
  held(b: Button): boolean;
  pressed(b: Button): boolean;
  released(b: Button): boolean;
  anyPressed(): boolean;
}

const KEYMAP: Record<string, Button> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  KeyK: 'jump', Space: 'jump', KeyZ: 'jump',
  KeyJ: 'shoot', KeyX: 'shoot',
  KeyL: 'special', KeyC: 'special',
  KeyI: 'swap', KeyV: 'swap',
  ShiftLeft: 'lock', ShiftRight: 'lock', KeyU: 'lock',
  Enter: 'start', Escape: 'start', KeyP: 'start',
};

export class Input implements Pad {
  private keys = new Set<Button>();
  private tapped = new Set<Button>(); // pressed and released between two updates
  private down: Record<Button, boolean> = {} as any;
  private prev: Record<Button, boolean> = {} as any;
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';
  onFirstInteraction: (() => void) | null = null;

  constructor() {
    for (const b of BUTTONS) { this.down[b] = false; this.prev[b] = false; }
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return; // typing a room code
      const b = KEYMAP[e.code];
      if (b) { if (!e.repeat) this.tapped.add(b); this.keys.add(b); e.preventDefault(); this.lastDevice = 'keyboard'; }
      this.interact();
    });
    window.addEventListener('keyup', (e) => {
      const b = KEYMAP[e.code];
      if (b) { this.keys.delete(b); e.preventDefault(); }
    });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => this.interact());
  }

  private interact() {
    if (this.onFirstInteraction) { const f = this.onFirstInteraction; this.onFirstInteraction = null; f(); }
  }

  update() {
    for (const b of BUTTONS) {
      this.prev[b] = this.down[b];
      this.down[b] = this.keys.has(b);
      // a tap shorter than one frame still counts as one press
      if (this.tapped.has(b) && !this.down[b] && !this.prev[b]) this.down[b] = true;
    }
    this.tapped.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const bt = (i: number) => !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4);
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      const g: Partial<Record<Button, boolean>> = {
        jump: bt(0), swap: bt(1) || bt(4), shoot: bt(2), special: bt(3),
        lock: bt(5) || bt(6) || bt(7), start: bt(9),
        up: bt(12) || ay < -0.45, down: bt(13) || ay > 0.45,
        left: bt(14) || ax < -0.45, right: bt(15) || ax > 0.45,
      };
      let any = false;
      for (const b of BUTTONS) if (g[b]) { this.down[b] = true; any = true; }
      if (any) { this.lastDevice = 'gamepad'; this.interact(); }
    }
  }

  held(b: Button) { return this.down[b]; }
  pressed(b: Button) { return this.down[b] && !this.prev[b]; }
  released(b: Button) { return !this.down[b] && this.prev[b]; }
  anyPressed() { return BUTTONS.some((b) => this.pressed(b) && b !== 'left' && b !== 'right' && b !== 'up' && b !== 'down'); }
  /** Buttons held this update as a bitmask (bit i = BUTTONS[i]), for sending over the network. */
  bits() { let m = 0; BUTTONS.forEach((b, i) => { if (this.down[b]) m |= 1 << i; }); return m; }
}

/** A pad driven by bitmasks, one per simulation frame (a remote player, or the local one delayed). */
export class PadState implements Pad {
  cur = 0; prev = 0;
  constructor(private device: Input) {}
  get lastDevice() { return this.device.lastDevice; }
  set(bits: number) { this.prev = this.cur; this.cur = bits; }
  held(b: Button) { return (this.cur & (1 << BUTTONS.indexOf(b))) !== 0; }
  pressed(b: Button) { const m = 1 << BUTTONS.indexOf(b); return (this.cur & m) !== 0 && (this.prev & m) === 0; }
  released(b: Button) { const m = 1 << BUTTONS.indexOf(b); return (this.cur & m) === 0 && (this.prev & m) !== 0; }
  anyPressed() { return BUTTONS.some((b) => this.pressed(b) && b !== 'left' && b !== 'right' && b !== 'up' && b !== 'down'); }
}
