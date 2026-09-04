# ToyStory2Web

An open-source reimplementation of the engine behind **Toy Story 2: Buzz
Lightyear to the Rescue** (Traveller's Tales, 1999), running in the browser.

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

Open the page and choose (or drag in) your `Toy Story 2` install folder.

## What works today

- **Texture extraction.** Level `.ngn` containers are parsed and every texture
  decoded and displayed. Levels are enumerated from the install automatically.
- **A viewer stage** — grid, orbit camera, and a fixed-timestep loop pinned to
  the original engine's ~59 FPS pacing, ready for geometry.

## What doesn't work yet

Everything else. Models (`.all`), animations (`.anm`) and world geometry
(`level.dat`) are still being reverse-engineered, and gameplay hasn't started.
See [`docs/FORMATS.md`](docs/FORMATS.md) for the current state of that research
— including the discovery that this PC release is a converted PlayStation game
that shipped its entire PSX source data tree, build scripts and all.

## Command line

    npm run extract -- "Toy Story 2/data/level01/level.ngn" out/level01

Dumps every texture in a level container to `.bmp` files.

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
