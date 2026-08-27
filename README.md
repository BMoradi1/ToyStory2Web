# ToyStory2Web

An open-source reimplementation of the engine behind **Toy Story 2: Buzz
Lightyear to the Rescue** (Traveller's Tales, 1999), running in the browser.

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
