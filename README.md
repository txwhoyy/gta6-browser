[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/txwhoyy/gta6-browser/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/txwhoyy/gta6-browser/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Marisol Heat

An open-world crime game that runs in a desktop browser from static files — no build step, no network, everything generated in code. Welcome to **Port Marisol**, a sun-soaked city on a bay: eleven blocks of streets, parks and parking lots, a marina, a hotel strip, and one long shore road with the sea beside it.

You are **Nico**, a courier with quick feet and quicker hands. The fixer **Madame Zara** runs jobs from her boardwalk kiosk — fetch a coupe from the North Docks, move a hot package for the Hotel Azul, race the shore flares, lift an evidence sedan from Club Neon while the police close in, and pull off the Final Score. Between jobs the city is yours: steal cars, brawl, outrun the law, and take courier work whenever you want it.

## What's in the city

- **A complete open world** — a full street grid with two-way traffic that turns at intersections and queues behind you, parked cars in lots and at kerbs, and crowds strolling the sidewalks and the beach.
- **On foot and by car** — walk, run, punch, and get into almost any car you can reach. Driving is arcade physics: acceleration, braking, reverse, handbrake drifts, collisions and damage, with smoke as a car dies.
- **A wanted system with real police** — theft, hit-and-runs and violence raise your stars (to five). Patrol cars pathfind across the road grid to find you, ram you, and box you in; on foot they will bust you if they corner you standing still. Lie low and the heat cools, star by star.
- **Missions and a story** — a five-job chain for Madame Zara with briefs, objective markers, a guiding arrow, timers and escape sequences, then endless courier runs. Cash buys nothing but pride — and pays your fines when you are busted or your hospital bill when you are wasted.
- **A full HUD** — cash, wanted stars, health, car health and speed, the current objective, and a live minimap with the mission beacon, the police and your heading.
- **Sound, synthesized live** — an engine note that follows your speed, two-tone sirens that swell as the police close in, crashes, pickups, jingles, and a slow synthwave loop. No audio files.
- **Saving** — progress (cash, jobs done, story state) is kept in the browser and offered as *Continue* on the title screen.

## Controls

| Keys | Action |
| --- | --- |
| `W A S D` / arrow keys | Walk, and drive (accelerate, brake/reverse, steer) |
| `Shift` | Run on foot |
| `F` | Get in / out of a car |
| `J` or mouse click | Punch |
| `Space` | Handbrake |
| `P` or `Esc` | Pause |
| `M` | Sound on/off |
| `Enter` | Start · `N` new game · `R` back on the street after a bust |

## Run it

Serve the `game/` folder with any static file server and open it in a desktop browser:

```sh
node serve.ts            # then open http://localhost:8080
```

or simply `python3 -m http.server --directory game 8080`. The game is plain files under `game/` (`index.html` plus ES modules in `game/src/`); it loads nothing from the network.

`main.ts` is the entry's handover program: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies `game/` and `screenshots/` to `out/` and writes the `dossier.json` summary there.

## Layout

- `game/index.html` — the page and its styles
- `game/src/main.js` — the game conductor: states, loop, collisions, crime
- `game/src/city.js` — Port Marisol itself: grid, buildings, beach, routes
- `game/src/vehicles.js`, `game/src/traffic.js` — car physics and ambient traffic
- `game/src/police.js` — the wanted system and patrol AI
- `game/src/pedestrians.js` — the crowds
- `game/src/missions.js` — Zara's five jobs and the courier runs
- `game/src/render.js` — the world, the HUD, the minimap and the screens
- `game/src/audio.js` — the synthesized sound
- `game/src/shots.js` — the staged scenes behind the screenshots (`?shot=chase` and friends)

<sub>Entered on [make.fun](https://make.fun/?ref=1paa8b6t&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
