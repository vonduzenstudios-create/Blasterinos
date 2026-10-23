// The online co-op lobby: a small DOM panel over the game for hosting or joining a room.
// Rooms live on the relay server (server/ in this repo); the server URL comes from
// VITE_NET_URL at build time, or ?server=wss://... in the address bar for testing.

import type { Game } from '../game/game';
import { Lockstep } from './lockstep';

const DEFAULT_SERVER = 'wss://blasterinos-net.onrender.com';

export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('server');
  return q || ((import.meta as any).env?.VITE_NET_URL as string | undefined) || DEFAULT_SERVER;
}

const CSS = `
#lobby { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(7,6,11,0.7); font: bold 14px/1.5 ui-monospace, Menlo, Consolas, monospace;
  color: #c8c0e0; text-transform: uppercase; letter-spacing: 1px; z-index: 10; }
#lobby.open { display: flex; }
#lobby .box { background: #120d16; border: 2px solid #3a3450; box-shadow: 0 0 0 2px #120d16;
  padding: 18px 20px; width: min(340px, calc(100vw - 32px)); box-sizing: border-box; text-align: center; }
#lobby h2 { margin: 0 0 12px; color: #ffd040; font-size: 18px; letter-spacing: 2px; }
#lobby button { font: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer;
  background: #2a2040; color: #fff; border: 2px solid #3a3450; padding: 6px 12px; margin: 4px; }
#lobby button:hover, #lobby button:focus { border-color: #ffd040; outline: none; }
#lobby input { font: inherit; width: 5.5em; text-align: center; text-transform: uppercase; letter-spacing: 4px;
  background: #07060b; color: #ffd040; border: 2px solid #3a3450; padding: 5px; margin: 4px; }
#lobby .code { font-size: 34px; color: #ffd040; letter-spacing: 8px; margin: 6px 0; }
#lobby .status { min-height: 3em; margin: 10px 0 4px; color: #fff; font-size: 12px; text-transform: none; }
#lobby .row { margin: 6px 0; }
#lobby .hint { font-size: 11px; color: #8a84a0; text-transform: none; }
`;

export class Lobby {
  private el: HTMLDivElement;
  private status: HTMLDivElement;
  private body: HTMLDivElement;
  private ws: WebSocket | null = null;

  constructor(private game: Game, private onStart: (net: Lockstep) => void) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'lobby';
    this.el.innerHTML = `<div class="box"><h2>Online co-op</h2><div class="body"></div><div class="status"></div>
      <div class="row"><button data-act="close">Back</button></div></div>`;
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('.body')!;
    this.status = this.el.querySelector('.status')!;
    this.el.querySelector<HTMLButtonElement>('[data-act=close]')!.onclick = () => this.close();
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  open(message = '') {
    this.game.inputBlocked = true;
    this.el.classList.add('open');
    this.body.innerHTML = `
      <div class="row"><button data-act="host">Host a game</button></div>
      <div class="row">or join with a code<br><input maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false"><button data-act="join">Join</button></div>
      <div class="hint">Two players, one on each computer. Inputs are synced, so it needs very little bandwidth.</div>`;
    const input = this.body.querySelector('input')!;
    this.body.querySelector<HTMLButtonElement>('[data-act=host]')!.onclick = () => this.host();
    this.body.querySelector<HTMLButtonElement>('[data-act=join]')!.onclick = () => this.join(input.value);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(input.value); });
    this.setStatus(message);
    this.body.querySelector<HTMLButtonElement>('[data-act=host]')!.focus();
  }

  close() {
    this.el.classList.remove('open');
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    // let the key that closed the panel go before the title listens again
    setTimeout(() => { this.game.inputBlocked = false; }, 100);
  }

  /** Open straight into joining, for invite links (?room=CODE). */
  joinFromLink(code: string) { this.open(); this.join(code); }

  private setStatus(s: string) { this.status.textContent = s; }

  private host() {
    const q = new URLSearchParams(location.search);
    const stage = Math.max(0, Math.min(this.game.stageCount - 1, (parseInt(q.get('stage') || '1') || 1) - 1));
    const cp = Math.max(0, Math.min(2, parseInt(q.get('cp') || '0') || 0));
    this.connect({ t: 'host', stage, cp });
  }

  private join(code: string) {
    code = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { this.setStatus('Enter the 4 letter code from the host.'); return; }
    this.connect({ t: 'join', code });
  }

  private connect(hello: object) {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); }
    this.body.innerHTML = '';
    this.setStatus('Connecting to the server... (a sleeping free server can take up to a minute to wake up)');
    let ws: WebSocket;
    try { ws = new WebSocket(serverUrl()); } catch { this.setStatus('Bad server address: ' + serverUrl()); return; }
    this.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify(hello)); this.setStatus('Connected.'); };
    ws.onerror = () => this.setStatus('Could not reach the co-op server.');
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.open('The connection closed. Try again?'); } };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'room') this.showRoom(msg.code);
      else if (msg.t === 'error') { this.ws = null; ws.onclose = null; ws.close(); this.open(msg.msg); }
      else if (msg.t === 'left') this.setStatus(msg.reason);
      else if (msg.t === 'start') this.start(ws, msg);
    };
  }

  private showRoom(code: string) {
    const link = location.origin + location.pathname + '?room=' + code;
    this.body.innerHTML = `<div>Your code</div><div class="code">${code}</div>
      <div class="row"><button data-act="copy">Copy invite link</button></div>`;
    this.body.querySelector<HTMLButtonElement>('[data-act=copy]')!.onclick = () => {
      navigator.clipboard?.writeText(link).then(() => this.setStatus('Link copied. Send it to your partner.'), () => this.setStatus(link));
    };
    this.setStatus('Waiting for your partner to join...');
  }

  private start(ws: WebSocket, msg: { you: 0 | 1; seed: number; stage: number; cp: number }) {
    this.ws = null; // the game owns the socket now
    ws.onclose = null; ws.onerror = null;
    this.el.classList.remove('open');
    this.game.inputBlocked = false;
    this.game.audio.init();
    const stage = Math.max(0, Math.min(this.game.stageCount - 1, msg.stage | 0));
    this.onStart(new Lockstep(ws, this.game, msg.you, msg.seed, { stage, cp: msg.cp | 0 }));
  }
}
