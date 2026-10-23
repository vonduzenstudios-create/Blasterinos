// Blasterinos online co-op relay.
//
// The game runs a deterministic lockstep simulation on both players' machines, so the
// server never simulates anything. It pairs two players into a room by a short code,
// hands them a shared random seed, and forwards each player's input packets (a few bytes
// every other frame) to the other one. Binary messages are relayed untouched; text
// messages are small JSON lobby commands.

import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8080;
// Comma separated list of page origins allowed to connect, e.g.
// https://vonduzenstudios-create.github.io,http://localhost:5173 (empty allows any).
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
const HOST_WAIT_MS = 15 * 60 * 1000;
const MAX_MSGS_PER_SEC = 240; // inputs go out at ~30 Hz; anything far above that is abuse

/** @type {Map<string, { host: any, guest: any, opts: { stage: number, cp: number }, timer: any }>} */
const rooms = new Map();

const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`Blasterinos co-op relay. ${rooms.size} room(s) open.\n`);
});

const wss = new WebSocketServer({
  server: http,
  maxPayload: 1024,
  perMessageDeflate: false, // packets are tiny; compression would only add latency
  verifyClient: ({ origin }) => !ORIGINS.length || ORIGINS.includes(origin),
});

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

function closeRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  rooms.delete(code);
  clearTimeout(room.timer);
  for (const ws of [room.host, room.guest]) {
    if (!ws) continue;
    ws.room = null;
    send(ws, { t: 'left', reason });
  }
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.peer = null;
  ws.alive = true;
  ws.msgs = 0;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (data, isBinary) => {
    if (++ws.msgs > MAX_MSGS_PER_SEC) { ws.terminate(); return; }
    if (isBinary) {
      // input / ping / checksum packets: straight to the other player
      if (ws.peer && ws.peer.readyState === ws.OPEN) ws.peer.send(data, { binary: true });
      return;
    }
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (msg.t === 'host' && !ws.room) {
      const code = newCode();
      const stage = Math.max(0, Math.min(9, msg.stage | 0)), cp = Math.max(0, Math.min(2, msg.cp | 0));
      const room = { host: ws, guest: null, opts: { stage, cp }, timer: null };
      room.timer = setTimeout(() => { if (!room.guest) closeRoom(code, 'Nobody joined in time.'); }, HOST_WAIT_MS);
      rooms.set(code, room);
      ws.room = code;
      send(ws, { t: 'room', code });
    } else if (msg.t === 'join' && !ws.room) {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { send(ws, { t: 'error', msg: 'No game with code ' + code + '.' }); return; }
      if (room.guest) { send(ws, { t: 'error', msg: 'That game is already full.' }); return; }
      clearTimeout(room.timer);
      room.guest = ws;
      ws.room = code;
      ws.peer = room.host; room.host.peer = ws;
      const seed = randomInt(1, 0x7fffffff);
      send(room.host, { t: 'start', you: 0, seed, ...room.opts });
      send(ws, { t: 'start', you: 1, seed, ...room.opts });
    }
  });

  ws.on('close', () => {
    if (ws.room) closeRoom(ws.room, 'Your partner left the game.');
    if (ws.peer) ws.peer.peer = null;
  });
});

// drop dead connections, and reset the per-second message budget
setInterval(() => {
  for (const ws of wss.clients) ws.msgs = 0;
}, 1000);
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

http.listen(PORT, () => console.log('Blasterinos relay listening on :' + PORT));
