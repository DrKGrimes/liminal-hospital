# Liminal Hospital

A gently creepy first-person walking simulator set in an endless, procedurally
generated hospital. Built with Three.js — no build step, no assets; every
mesh, texture, and sound is generated in code.

You arrive outside at night that isn't night. The sliding doors are faulty.
Reception is unstaffed. The corridors go on.

## Playing

Serve the folder over HTTP and open it in a browser:

```sh
python3 -m http.server 8741
# then visit http://localhost:8741/
```

(Modules won't load from `file://` — it needs a local server.)

| Control | Action |
|---|---|
| Click | enter / capture mouse |
| WASD | walk |
| Mouse (or arrow keys) | look |
| Shift | hurry |
| E | take an item |
| P | take a photograph (saves a captioned sepia print) |
| Esc | pause |

### URL options
- `?seed=12345` — play a specific world (the seed is shown on the title screen)
- `?test` — auto-start without pointer lock (used for automated play-testing)

## What's in there

- **Endless deterministic world** — an infinite grid of corridors, wards,
  offices, storage rooms and waiting bays, streamed in 48 m chunks. The same
  seed always produces the same hospital.
- **Depth zones** — concentric "wards" ringed by locked glass security doors.
  The bumper stripe on the walls changes colour as you go deeper. Staff
  keycards for each ring are hidden in rooms of the ring before it (at least
  one is always guaranteed to exist).
- **Strange objects** — five lovecraftian relics on pedestals in distant
  rooms. Carrying them thickens the hum, darkens the fog, and eventually you
  start hearing whispers.
- **Anomalies** — rooms that are wrong in quiet ways: chair circles, walls of
  clocks all stopped at 3:33, audiences of chairs facing a single bed, rooms
  of identical plants, rooms containing only one shoe.
- **Atmosphere** — flickering fluorescents, a dark figure that occasionally
  crosses a distant junction, signage that becomes less trustworthy with
  depth, and fully synthesized audio: mains hum, PA chimes, distant door
  slams, gurney rattles, and tannoy announcements that say nothing parseable.

## Code map

| File | What it does |
|---|---|
| `src/gen.js` | Pure deterministic layout logic — cell types, walls, doors, zones, item spawns |
| `src/world.js` | Chunk streaming, merged geometry, doors, pickups, room dressing |
| `src/props.js` | Procedural furniture, relics, signs, canvas textures |
| `src/player.js` | First-person controller and grid collision |
| `src/audio.js` | All-synthesized Web Audio engine |
| `src/ui.js` | DOM HUD: captions, prompts, inventory chips |
| `src/main.js` | Renderer, light pool, flicker, the figure, game loop |

A debug API is exposed as `window.__game` (`state()`, `teleport(x,z)`,
`look(yaw,pitch)`, `press(code)`), which is how the game was play-tested.
