# Blasterinos

A browser run-and-gun tech demo in the style of Contra 4 (Nintendo DS). Every asset is
generated in code at startup: the pixel art, tiles, backgrounds, effects, sound effects
and music. There are no image or audio files in the repo.

**Stage 1, Venom Falls:** fight through the jungle, break the fortress gate, climb the
waterfall and take down the three-headed hydra that lives in the lake at the top.

**Stage 2, Scorched Dunes:** ride shotgun in a jeep tearing across the desert while dirt
bikers and an attack gunship chase you down, until something enormous erupts out of the
road and flips the jeep. Finish on foot over dunes, mesas and quicksand to the nest of the
Great Dune Worm. Clearing stage 1 rolls straight into stage 2 with your weapons.

**Stage 5, The Alien Hive:** the final stage. A run through the guts of an alien nest, past
acid pits, swollen acid pustules and the puckered holes the grubs keep squeezing out of, down
to the Hive Mother. She backs into her chamber rear end first, lays eggs and breaks wind; shoot
her vent while it is open and her head whenever you can reach it. Beating her rolls the
ending and credits.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`
(set **Settings > Pages > Source** to **GitHub Actions** once).

## Controls

| Action | Gamepad | Keyboard |
| --- | --- | --- |
| Move / aim (8-way) | D-pad or left stick | Arrows or WASD |
| Shoot | X | X or J |
| Jump (down + jump drops through ledges) | A | Z, K or Space |
| Grappling hook (up + hook fires straight up) | Y | C or L |
| Lock in place to aim | RB, LT or RT | Shift or U |
| Swap weapon slot | B or LB | V or I |
| Pause | Start | Enter or Esc |

Hold down while standing to go prone.

## The game

- **Two soldiers.** Ryder runs faster, jumps higher and reels in faster. Voss is slower but
  wears armor that absorbs one hit and recharges after 12 seconds.
- **One-hit deaths, three lives**, Contra-style drop-in respawns and three continues.
- **Weapons** come from flying capsules: Machine gun, Spread, Laser, Homing and Flame.
  You carry two, swap between them, and picking up the same letter again powers it up.
  Dying loses the weapon in your hands. The B capsule gives a temporary barrier.
- **Enemies:** running soldiers, riflemen behind sandbags, snipers, pop-up turrets,
  leaping aliens, drones, wall crawlers on the falls and logs washing down the waterfall.
- **Mid-boss:** a fortress gate with two cannons and a core.
- **Boss:** a hydra whose body rises from the lake in the background. Destroy its three
  heads, then its exposed core while its claws slam the ledge from the foreground.
- **Stage 2:** on the jeep you can shuffle along the bed, jump and duck while you shoot.
  Lean on the front or back of the bed and the driver speeds up or eases off, so you can
  steer the jeep around the screen to dodge or catch falling power-ups.
  The gunship sweeps over to bomb the jeep. The Dune Worm only takes real damage when its
  head peels open, either to spit sand or after it bursts up under you (watch for the
  shaking mound). It also sends baby worms through the sand.

Testing shortcut: `/?stage=2` starts on stage 2 after soldier select, and `&cp=1` or
`&cp=2` starts from its on-foot or boss checkpoint. `/?stage=5` does the same for the hive
(`&cp=1` halfway, `&cp=2` the Hive Mother).

## Online co-op

Pick **ONLINE CO-OP** on the title screen. One player hosts and gets a four letter code
(or an invite link); the other joins with it. Each player picks a soldier and the stage
starts when both are ready. Lives are a shared pool of six, and the camera waits for
whoever is behind.

**How it stays cheap on bandwidth:** both browsers run the whole game in deterministic
lockstep. Only button presses cross the network (10 bits per player per frame, sent two
frames to a packet), so each player uses roughly 2 KB/s including TCP overhead and the
server does nothing but relay. Random rolls come from a shared seed. The cost is a few
frames of input delay (it adapts to the ping), and if one player's connection stalls,
both games pause until it catches up. Every two seconds the two games compare a hash of
their state and show OUT OF SYNC if they ever disagree.

The relay lives in `server/` (Node + `ws`, no build step) and deploys to Render from
`render.yaml`:

1. In the Render dashboard choose **New > Blueprint**, connect this repo and apply it.
   That creates a free web service called `blasterinos-net`.
2. If Render gives it a URL other than `https://blasterinos-net.onrender.com`, add a
   repository variable `NET_URL` (Settings > Secrets and variables > Actions > Variables)
   set to `wss://<your-service>.onrender.com` and re-run the Pages deploy.

A free Render service sleeps after 15 idle minutes, so the first connection can take up to
a minute. To test locally: `cd server && npm install && npm start`, then open
`http://localhost:5173/?server=ws://localhost:8080` in two windows.

## How it is built

- **Three.js + Vite + TypeScript.** The scene renders through an orthographic camera at
  384x216 and is scaled up with nearest-neighbour filtering, so it stays pixel-crisp.
- **`src/engine/pixel.ts`** is a small pixel painter. Sprites are drawn from shapes into
  parts, each part is shaded (edge lighting, or a distance-field "volume" shade for big
  shapes like the hydra), and the result gets a dark outline.
- **`src/art/`** builds every sprite: `humanoid.ts` rasterizes a posed skeleton for the
  heroes and soldiers, and the other files cover tiles, backgrounds, enemies, effects,
  props and the hydra. Open `/?sheet` in dev to see all generated sprites.
- **`src/engine/audio.ts`** synthesizes all sound with the Web Audio API (pulse waves,
  filtered saw bass, noise drums), and **`src/game/music.ts`** holds the songs as step
  sequences with generated bass, arpeggio and drum parts.
- **`src/net/`** is online co-op: `lockstep.ts` syncs inputs and steps the game, and
  `lobby.ts` is the host / join panel.
- **`src/game/`** holds the gameplay: player, weapons, enemies, bosses and the game state
  machine. Each stage implements the `Stage` interface (`stage.ts`): `stage1.ts` with
  `level.ts` and `boss.ts` for Venom Falls, `stage2.ts` with `vehicles.ts` and `worm.ts`
  for Scorched Dunes, `stage5.ts` with `hive.ts` and `art/hive.ts` for the Alien Hive, and
  `ending.ts` for the credits. The waterfall, water and quicksand are small GLSL shaders.
