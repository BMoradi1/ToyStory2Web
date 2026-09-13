
# ToyStory2Web

An open-source reimplementation of the engine behind **Toy Story 2: Buzz
Lightyear to the Rescue** (Traveller's Tales, 1999), running in the browser.

🤖 Documentation and Code written with Claude Code under an agentic workflow. This project is testing the limits of what current models can implement with proper direction. Project is using a mix of Fable 5 and Opus 5 with manual monitored hand-offs ensuring token cost efficency. 🤖


## Screenshots
### Phase 1 level render
<img width="1413" height="937" alt="image" src="https://github.com/user-attachments/assets/2f4abd0a-e8bd-424f-b862-373e684ac664" />

<img width="1351" height="881" alt="image" src="https://github.com/user-attachments/assets/26728f2a-0acb-4eb9-bcd6-a8d6b3a316ba" />

### Model animation explorer
<img width="844" height="720" alt="chrome-capture-2026-09-03" src="https://github.com/user-attachments/assets/2154a78e-b3a9-467e-9e19-d0df8d4069a7" />

### In-Game
<img width="1434" height="992" alt="image" src="https://github.com/user-attachments/assets/84ee2b50-81c8-4ed2-bfc5-1268b0133555" />

#### Early gameplay
<img width="600" height="384" alt="chrome-capture-2026-09-05 (1)" src="https://github.com/user-attachments/assets/f472592a-5057-449e-b7e3-4366ba1ef9c3" />

<img width="731" height="630" alt="chrome-capture-2026-09-05" src="https://github.com/user-attachments/assets/9eb7f1aa-0824-41eb-8cf6-3d4d32c28630" />



## This repository contains no game assets

None of the game's data ships here, and none ever will — the models, textures,
music and video are Disney/Pixar/Activision property. What lives in this repo is
an engine and a set of format parsers. You point it at **your own copy** of the
game, and it reads the files locally in your browser. Nothing is uploaded.

## Running it

    npm install
    npm run dev

Open the page and choose (or drag in) your `Toy Story 2` install folder. The
folder picker needs a Chromium-based browser; everywhere else, drag the folder
onto the page instead. Nothing is uploaded either way.

### In the viewer

| key | what it does |
|---|---|
| `enter` | play: drive Buzz around the level, on the original's physics. While playing it pages a text box and nothing else |
| `escape` | pause: the game's own menu (continue, camera mode, volume, exit level). Escape again backs out, and "exit level" hands the camera back to the orbit controls |
| `0`-`9` | stand in that zone: draw it, zone 0, and whatever its doorways lead to |
| `a` | show the whole level again |
| `k` | overlay the collision hull — green where Buzz can stand, red where he cannot |
| `p` | stand the selected character on the floor |
| `c` | cycle back-face culling, to check the winding by eye |
| `g` | collapse the level to a single material |

The game boots the way it did: the three logo movies, the notice cards,
the title with its "press jump", the list menu and the level select, all
from your install, with the text read out of its executable. Arrows or
WASD move, Space or Enter is jump, Escape is cancel; the level plays from
the select, and the pause menu's "exit level" brings the select back.
The select flies over its diorama — the neighbourhood model in
`data/level06/level1`, which is what the game's "level 16" turns out to
be — with the level's name, the tokens you hold and the arrows over it.

The cutscenes play from your install too: the three logos when the
folder opens, a level's intro the first time you play it, and a boss's
movie when it falls. Escape, Enter, Space or a click skips one.

Progress is the game's own save record: lives, health, the camera choice,
the volume sliders and the tokens per level, kept in the browser and seeded
from the `Toy200.sav` in your install the first time. The **save file**
button downloads a `Toy200.sav` you can copy into the install yourself;
the viewer never writes there. **Load game** on the main menu lets you choose
an exported save or the save in the selected install, preview it, and load it
into the browser. **Options** uses the original Etch A Sketch screen for volume controls,
keyboard bindings, camera mode and detail level. Jump accepts volume changes;
Escape cancels a subpage. **Load game** opens the original load/save pages
with eight browser slots. **Import save file** opens the native picker and
places the chosen save in slot eight for loading. Saves never modify the
install. **Movie viewer** uses the original binocular artwork and replays
unlocked local movies without changing progress. Arrows/stick navigate,
Space/Enter selects, and Escape/gamepad Triangle goes back. Keyboard bindings
use physical key capture; Enter accepts the controller page.
| `s` | report what is actually in the scene |
| `m` | mute or unmute |

While playing: **WASD** or a gamepad stick to move, **space** to jump (again at
the top for a double jump), **J** to spin (**J** or **Shift** during a jump
for ground pound), **K** for the laser, **Q**/**E** or
the shoulder buttons to swing the camera, **M** to mute. The normal laser is a
red beam; holding K to full charge and releasing fires a wider yellow beam.
Disk ammunition switches firing to homing disks, consuming one round per shot;
when it runs out, firing returns to the laser. Movement is
camera-relative, as the original's is, and Buzz is animated from the game's own
animation state machine. Walls stop Buzz, and reachable ledges can be caught
while descending from a jump. Falling out of the level returns him to his
last safe position.

## What works today

- **Levels render.** Every one of the game's 16 real scene files parses, 320,257
  triangles in all, textured, with per-face blending and back-face culling. The
  material rules are not guesses: they were read out of the PC executable and
  checked against the game's own converted copy of each level.
- **Visibility.** The game divides a level into zones joined by portals standing
  in doorways. Both are decoded, so the viewer can draw one room and its
  neighbours instead of the whole house.
- **Characters.** All 68 models load and texture, and all 170 animations play.
- **Collectibles.** Coins, health, extra lives and the five Pizza Planet
  tokens of each level are placed where the game places them and collected
  with the engine's own reach test. The game has no "type" field for these:
  it decides what an object is by counting its polygons, and that rule is
  ported as found. The shapes standing in for them are placeholders: the real
  coin art is a sprite inside the executable that is not extracted yet.
- **Level 1's five tokens can all be got.** Round up Bo Peep's sheep, bring
  Hamm fifty coins, win the R.C. car's three-lap race, and beat the tin
  robot in the attic, which is immune until it opens up and has to be spun
  while it is. The fifth is the one behind the basement boxes. Rex tells you
  what is still to do, skipping what you have done.
- **Crates push.** Lean on one of the shove-able crates and it runs along
  the rail the level gives it, tips over a ledge, falls and lands, and can
  be pushed on from there. Its collision moves with it. The crate you see
  is a stand-in box: the real one is baked into the level geometry and
  cannot be moved yet.
- **Hint signs talk.** Touch one of the tutorial signposts and the game
  does what it always did: freezes Buzz, flies the camera along the sign's
  own path, and types the hint out a character at a time. The words come
  from your executable, not from this repository.
- **Music.** Each level's theme streams from your install's own `audio`
  folder, chosen the way the game chooses it and mixed through the volume
  curve out of the executable. Press `n` to mute it.
- **Sound.** Buzz's effects play from your install's own `data/sfx`, found by
  the names the engine itself uses — a table of 61 strings inside the
  executable that match the files on disc exactly.
- **Buzz moves.** Press enter and you can walk, run, turn, jump, double jump and
  spin around Andy's house, with the game's own follow camera behind you.
  Every constant — gravity, the jump impulse, friction,
  the turn rate, the attack timings — was read out of the PC executable and
  checked against the PlayStation one, not tuned by feel. He is animated by the
  game's own animation state machine, a 28-state table of byte scripts that also
  turned out to settle how fast animations actually play.
- **Collision.** The hull parses (23,394 polygons across the game) and can be
  drawn over the level. Movement uses the original's own mover, a swept sphere:
  walls stop you, ledges and steps behave, and being on the ground means
  touching something flatter than 60 degrees rather than finding a floor
  underfoot. Fall out of the level and you are put back where you last stood
  safely, as the original does.
- **Edge climb.** Jump toward a reachable ledge: Buzz automatically catches
  it while descending and pulls himself up. The original reach, flatness and
  clearance checks reject high shelves and obstructed climbs; animation state
  9 plays the 82-tick pull-up before movement resumes.
- **Creatures move.** Every scene's enemies and cast are read from the
  level's packet file (an RNC-compressed container the game's own unpacker
  was transcribed for) and then *run*: the game's own script interpreter,
  44 scripts out of the executable, and the shared mover that walks them,
  leaps them, turns them and pens each one inside its patrol box. The Zurg
  toys of level 1 patrol and lunge; the hover bots drift and keep station
  above Buzz. All 373 creatures in the game are exercised by a probe tool.
  Buzz's spin kills what the data says it can kill, and the ones marked
  dangerous hurt him back, using each creature's own hit ellipsoid read out
  of its model. Each one is drawn as the model the game draws, posed by the
  animation its script selected.
- **Hint signs and push blocks, decoded.** The tutorial signposts (a talk
  box with a scripted camera flight, also how every character speaks) and
  the crates Buzz shoves along rails are read out of the executable and
  checked against every level's scene; see docs/LEVELS.md. Not yet ported.
- **Two oracles.** An offline rasteriser and a headless browser driver, so a
  change can be checked pixel against pixel rather than by eye. They are how
  most of the bugs above were found.

## What doesn't work yet

**The camera** has the original's distance, height, yaw lag, hand-turning and
auto-centring, and pulls in rather than clipping through scenery. What is
missing is its look-ahead and the pitch it leans into as Buzz climbs or drops,
so it will not always frame a jump the way the real game does.

**Everything around the moving.** No enemies, no pickups, no HUD, no save file,
no audio, no cutscenes. The spawn point is a heuristic — the pickup marker
standing on the largest reachable floor — because the real one lives in the
level's own code, which is not decoded.

Smaller things, all recorded in [`TODOPLAN.txt`](TODOPLAN.txt): visibility takes
one step through the portal graph rather than recursing with a clipped view
frustum, and absolute screen brightness has not been compared against the retail
game.

See [`docs/PLAYER.md`](docs/PLAYER.md) for the gameplay research: the physics,
the animation system, and how each number was found.
See [`docs/FORMATS.md`](docs/FORMATS.md) for the file-format research — including
the discovery that this PC release is a converted PlayStation game that shipped
its entire PSX source data tree, build scripts and all, and that the disc
therefore holds every level twice.

## Command line

Everything here reads an install and writes nothing into it.

    # dump every texture in a level container to .bmp
    npm run extract -- "Toy Story 2/data/level01/level.ngn" out/level01

    # parse every file of a kind across the install and report
    npx tsx tools/dat-validate.ts "Toy Story 2"
    npx tsx tools/all-validate.ts "Toy Story 2"
    npx tsx tools/anm-validate.ts "Toy Story 2"
    npx tsx tools/collision-validate.ts "Toy Story 2"

    # cross-check level.dat against the game's own converted copy
    npx tsx tools/scene-crosscheck.ts "Toy Story 2"

    # the mode-bit -> material table, rebuilt from the data
    npx tsx tools/material-table.ts "Toy Story 2"

    # render a level offline, or drive the real viewer headlessly
    npx tsx tools/render-level.ts "Toy Story 2" level01/level out.png --viewer
    npx tsx tools/browser-shot.ts "Toy Story 2" shot.png     # needs npm run dev

    # step the character controller and check it against the constants
    npx tsx tools/player-probe.ts

`tools/ghidra/` rebuilds a greppable decompile of either executable, which is
where the gameplay constants come from.

## Contributing

Read [`CLAUDE.md`](CLAUDE.md) first — it covers the asset rules and the
conventions parsers follow. The short version: never commit game data, treat the
install directory as read-only, and never claim a format is understood without
parsing it end to end and validating the result.

## License

The code in this repository is licensed under the **MIT License** — see
[`LICENSE`](LICENSE). Take the parsers and build something with them; that is
what they are for. The file formats documented in
[`docs/FORMATS.md`](docs/FORMATS.md) cost more to work out than the viewer did,
and nobody else should have to spend that month twice.

MIT covers the engine, the parsers and the research prose: work written from
scratch here. It cannot and does not grant you any right to the game's data,
which is not ours to license — including the permission to "sell copies" that
the licence grants for *this software*. Reverse-engineering notes describe a
file format; they do not come with permission to copy what is stored in it.

## Legal

This project is not affiliated with, authorised by, endorsed by, or in any way
connected to Disney, Pixar, Activision, or Traveller's Tales. "Toy Story 2" and
"Buzz Lightyear" are trademarks of their respective owners, used here only to
name the game whose files this software reads.

No game assets are distributed here, in the repository or in any build. Running
this requires a copy of the game that you already own; the files are read from
your own machine, in your own browser, and are never uploaded anywhere.
