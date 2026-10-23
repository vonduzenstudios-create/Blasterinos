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
`&cp=2` starts from its on-foot or boss checkpoint.

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
- **`src/game/`** holds the gameplay: player, weapons, enemies, bosses and the game state
  machine. Each stage implements the `Stage` interface (`stage.ts`): `stage1.ts` with
  `level.ts` and `boss.ts` for Venom Falls, `stage2.ts` with `vehicles.ts` and `worm.ts`
  for Scorched Dunes. The waterfall, water and quicksand are small GLSL shaders.
