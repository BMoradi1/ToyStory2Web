# ToyStory2Web

An open-source reimplementation of the engine behind **Toy Story 2: Buzz
Lightyear to the Rescue** (Traveller's Tales, 1999), running in the browser.

🤖 Written with Claude Code under an agentic workflow. 🤖


## Screenshots
### Phase 1 level renderer
<img width="1413" height="937" alt="image" src="https://github.com/user-attachments/assets/2f4abd0a-e8bd-424f-b862-373e684ac664" />


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
| `0`-`9` | stand in that zone: draw it, zone 0, and whatever its doorways lead to |
| `a` | show the whole level again |
| `k` | overlay the collision hull — green where Buzz can stand, red where he cannot |
| `p` | stand the selected character on the floor |
| `c` | cycle back-face culling, to check the winding by eye |
| `g` | collapse the level to a single material |
| `s` | report what is actually in the scene |

## What works today

- **Levels render.** Every one of the game's 16 real scene files parses, 320,257
  triangles in all, textured, with per-face blending and back-face culling. The
  material rules are not guesses: they were read out of the PC executable and
  checked against the game's own converted copy of each level.
- **Visibility.** The game divides a level into zones joined by portals standing
  in doorways. Both are decoded, so the viewer can draw one room and its
  neighbours instead of the whole house.
- **Characters.** All 68 models load and texture, and all 170 animations play.
- **Collision.** The hull parses (23,394 polygons across the game), can be drawn
  over the level, and answers "what is the floor under this point", which is
  what puts Buzz on the ground in the right place.
- **Two oracles.** An offline rasteriser and a headless browser driver, so a
  change can be checked pixel against pixel rather than by eye. They are how
  most of the bugs above were found.

## What doesn't work yet

**Gameplay.** There is no character controller, no follow camera, no enemies and
no pickups — Buzz stands in the level but does not move. That is the next phase,
and the intent is to take his gravity, jump and attack constants from the
original code rather than tune them until they feel right.

Smaller things, all recorded in [`TODOPLAN.txt`](TODOPLAN.txt): visibility takes
one step through the portal graph rather than recursing with a clipped view
frustum; absolute screen brightness has not been compared against the retail
game; audio and the cutscenes are identified but unimplemented.

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
