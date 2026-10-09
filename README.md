[![Smoke tests](https://github.com/Vaishnav1828/zombie-survival-6-waves/actions/workflows/ci.yml/badge.svg)](https://github.com/Vaishnav1828/zombie-survival-6-waves/actions/workflows/ci.yml)

# AFTERDARK — Zombie Survival: 6 Waves

A self-contained, 2D browser survival game built for the **GAME-GD1 Wave Survival Game** assignment. Survive six escalating waves, collect temporary weapons before the pickup signal expires, and decide when to fight or escape. The game runs without a framework, server-side code, or third-party assets.

## Play

**Option 1:** Open `index.html` in a current desktop browser.

**Option 2 (recommended):** serve the folder locally:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Controls

| Action | Control |
|---|---|
| Move | `W A S D` or arrow keys; on mobile, drag the left virtual joystick |
| Aim | Mouse |
| Fire | Left mouse button or `Space`; on mobile, hold the red **FIRE** button for auto-aim |
| Pause / resume | `P` |
| Restart after game over / victory | `R` or the on-screen button |
| Sound | `Sound: ON/OFF` button in the top-right |

Audio is synthesized locally with the Web Audio API (shooting, shotgun blast, pickup, hit, ranged attack, kill, wave start, victory and game-over cues). No external audio files, downloads, or network requests are required. Browsers require a user gesture before playing audio.

## Mobile play\n\nOpen the [live mobile game](https://vaishnav1828.github.io/zombie-survival-6-waves/) on your phone. The responsive canvas provides an on-screen joystick on the left and a hold-to-fire button on the right. The fire button automatically aims at the nearest active zombie. No app installation is needed.\n\n## Gameplay

- **Timed weapon drops:** signal markers appear with a pickup countdown. Collect them to equip a temporary shotgun, SMG, or rifle with limited ammo and weapon time.
- **Escape phase:** when a weapon expires or runs out of ammo, keep moving while you wait for another drop.
- **Two enemy classes:** green chasers move directly toward the player and damage on contact; purple ranged infected keep distance, strafe, and fire projectiles.
- **Six-wave run:** clear each wave to reach the next. Enemy counts, speed, health, and ranged composition are calculated from the current wave.
- **Score and rank:** chaser kill = 100, ranged kill = 150, weapon pickup = 50, wave clear = 500. Rank thresholds are S/A/B/C/D.
- **Persistence:** personal best score is stored in browser `localStorage`; it survives reloads in the same browser/profile.

## Assignment requirement map

| Requirement | Implementation |
|---|---|
| Player movement and attack | `update()`, `fire()`, `drawPlayer()` in `src/game.js` |
| At least two distinct enemy behaviors | Chaser contact AI and ranged keep-distance/strafe/projectile AI in `update()` |
| Algorithmic increasing wave difficulty | `wavePlan(n)` calculates count, speed, ranged quota, health and spawn gap |
| Explicit game-state machine | `State` enum-like object: `MENU`, `PLAYING`, `PAUSED`, `GAME_OVER`, `VICTORY` |
| Correct pause/resume | `update()` exits unless state is `PLAYING`, so timers, spawns, enemies and bullets freeze |
| Object pooling | `enemyPool`, `bulletPool`, `particlesPool`, `obtain()`, `putBack()` |
| Persistent data | guarded `localStorage` read/write for best score |
| Sound effects | Procedural Web Audio sounds; toggleable and local |
| Score/rank and restart | `finish()`, `rank()`, `beginGame()` |

## Technical decisions

- **No dependencies:** plain HTML, CSS and JavaScript keep setup simple and reproducible.
- **Procedural sound:** uses Web Audio oscillators and generated noise instead of separately sourced audio assets.
- **Object pooling:** enemies, bullets, and particles are recycled to reduce object churn during busy waves.
- **Temporal difficulty:** `wavePlan()` calculates later-wave pressure from the wave number rather than enumerating fixed wave scripts.
- **Defensive persistence:** browser storage access is wrapped so privacy modes or disabled storage do not stop the game.

## Known limitations / next improvements

This is a compact arcade prototype: it uses stylized canvas-drawn characters instead of imported sprite sheets, stores the best score per browser rather than on a server, and uses a single arena. Future improvements could add authored sprite animation, difficulty settings, mobile touch controls, configurable sound volume, and automated gameplay tests.


## Smoke tests

Node.js 18 or newer is needed only to run the dependency-free checks:

```bash
npm test
```

The smoke tests compile-check the game script, validate HTML asset and UI references, verify the state machine and object pools, and assert that the calculated wave counts are 5, 9, 13, 17, 21, and 25 with increasing speed/health. GitHub Actions runs these checks on pushes to `main` and pull requests.
