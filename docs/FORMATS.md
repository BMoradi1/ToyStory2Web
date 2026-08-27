# File format research

Everything below was derived from the user's own install by direct inspection.
Confidence levels are marked honestly — **do not** treat "probable" as settled.

## The key insight: this is a PlayStation game wearing a PC coat

Traveller's Tales built Toy Story 2 for the PlayStation first, then converted it
to PC. They did not rewrite it — they wrote a converter, `pconv.exe`, and then
**shipped the entire PSX source data tree inside the retail PC release**. That
is why `data/` contains a real `psx.exe`, both PSX disc executables
(`SLUS_008.93` North America, `SLES_020.67` Europe), MIPS overlays, and the
developers' own build scripts.

The practical consequence: assume PlayStation conventions everywhere. Signed
16-bit vertex coordinates, 8-bit UVs, CLUT/TPage indirection, and GPU primitive
command bytes (`0x20` flat tri, `0x24` textured tri, `0x2C` textured quad,
`0x30` gouraud tri, `0x34` gouraud textured tri, `0x3C` gouraud textured quad).
PSX quads are four vertices in Z-order — triangulate as (v0,v1,v2) + (v1,v2,v3),
**not** as a fan. PSX hardware is exhaustively documented; PC-only formats
usually are not, so prefer parsing the PSX-side file wherever both exist.

## The build pipeline, in the developers' own words

Each level directory holds a `Pconv.cfg` consumed by `pconv.exe`. Level 1's:

    INPUT_FILE    level.dat     # commented "Define the PSX scene file."
    TEXTURE_FILE  level.raw     # commented "Define the PSX texture file."
    TEXTURE_FILE  ..\gfx\level1a.raw
    BMP_FILE      \pcscreens\loadscreens\level1.bmp 37
    OUTPUT_FILE   level.ngn
    CREATUREFILE  ..\creatures.cfg

So `.ngn` is a **repack**, not a native format: PSX scene + PSX textures + PC
loading screens merged into one file. The trailing integer on `BMP_FILE` is the
engine's **texture slot ID** — it reappears as the tag `tex37` in the output.

### Gotcha: the Pconv.cfg header comments are worthless

`data/dupeconv.btm` copies `level04\pconv.cfg` into every other level directory.
Every level therefore claims to be "Toy2 - Level 1, The House." Level 9's escaped
the copy and still shows the build machine path `e:\PC\TOY2\CD\LEVEL01\level.dat`.
Do not use these comments to identify levels.

## Status by format

| Ext | What it is | Confidence |
|---|---|---|
| `.ngn` | PC container, holds 24bpp Windows BMPs | **Solved** |
| `rtlibs/*.dll` | MPEG-1 system streams (cutscenes), misnamed | **Solved** |
| `.wav` | 267 standard audio files | **Solved** |
| `level.bin` | MIPS R3000 overlay code | **Identified**, not decoded |
| `.all` | 3D models (chars + `TERRAIN.ALL`) | Under investigation |
| `.anm` | Animations | Unknown |
| `.dat` | PSX scene/world | Under investigation |
| `.raw` | PSX textures | Unknown (superseded by `.ngn`) |
| `.vis` | Presumed precomputed visibility (PVS) | Guess |
| `.kep` `.kp2` `.new` `.raws` | Unknown | Unknown |

### `.ngn` — SOLVED

Layout around each image is `[u32 tagLength][tag ASCII][BMP file]`. Parser:
`src/formats/ngn.ts`. It scans for `BM` signatures and validates the DIB header
rather than walking a chunk table, because the container's full record layout is
not mapped — this stays correct even if that layout varies between levels.

Level 1 yields 18 textures: mostly 256x256 24bpp, tagged `tex00`..`tex32`, plus
`bgr36` (192x128) and `tex37`, the 800x600 loading screen. **Slot IDs are
sparse** — a level fills only the slots it uses. Verified by decoding `tex37`,
which is the genuine level 1 loading screen.

Note `pconv` already upconverted everything to 24bpp, resolving the PSX
CLUT/4bpp palette indirection. Texture loading needs no PSX decoding at all.

### `rtlibs/` — SOLVED

25 files with a `.dll` extension that are actually MPEG-1 system streams, 214 MB
total — 39% of the install. Naming: `l NN in` = level intro, `l NN bo` = boss
intro, plus `acti` (Activision), `dlogo` (Disney), `tt` (Traveller's Tales),
`1st trailer`, `end 01`. Browser playback needs an MPEG-1 decoder or local
transcode; the extension is cosmetic and `file(1)` identifies them correctly.

### `level.bin` — MIPS R3000, identified

Confirmed by disassembly, not guesswork. Opens with a textbook prologue
(`addiu sp,sp,-24` / `sw ra,20(sp)` / `sw s0,16(sp)`), zero-words sit exactly
where R3000 load-delay-slot nops belong, and `lui v0,0x800a` is a PSX main-RAM
address. 76% of the file decodes with only ~25 opcodes implemented; the
remainder are unimplemented opcodes, not decode failures. Code starts at offset
4; word 0 is `0x00000004`.

**Call surface (level 1):** 109 call sites hitting **41 distinct functions**.
Only 23% land inside the file — the rest point outward into the engine. Applying
MIPS `jal` semantics (`target = PC & 0xF0000000 | imm << 2`) gives real addresses
`0x8002dffc`..`0x800d2160`. `lui` immediates are dominated by `0x8009`-`0x800d`,
the overlay reaching for engine globals.

All 21 overlays total only 178 KB. These are **per-level logic modules sitting on
the engine**, not the engine itself.

Why this matters: 41 imports per level is a tractable API surface, which makes
high-level emulation viable — interpret the overlay's own MIPS, implement its
imports natively. R3000 is ~60 instructions with no FPU, and the GTE only
matters for code being replaced by WebGL anyway. The heavily-called targets
(`0x80072bd4`, `0x8006da64`, `0x8002ea98`) fall inside `psx.exe`'s `.text`
(`0x80010000` + `0x77000`), so the reference implementation is on disk.

**Unresolved:** there are no symbols — every import is an unnamed address needing
manual identification. Some targets (`0x800d2160`) fall past `psx.exe`'s text
section, unexplained. And `toy2.exe` is x86 and cannot execute MIPS, so the PC
port almost certainly reimplemented this logic natively; these overlays document
the *PlayStation* build. That is still the better reference — it is the original.

### `.all` — models, under investigation

Byte 0 is a `u32` offset landing mid-file in every model tested: `woody.all`
14068 -> `0x1620`; `buzz.all` 17892 -> `0x1ea2`; `army.all` 6752 -> `0x822`;
`hamm.all` 8604 -> `0xd88`. The region at that offset is dense with 4-byte
groups shaped `(n, n, n, code)` — e.g. `50 50 50 07`, `5b 5b 5b 11`,
`30 30 30 3c` — greyscale RGB triplets plus a code byte, consistent with PSX
gouraud vertex colours on textured primitives.

Vertex and index arrays are **not yet located**. An early guess that the whole
file was a flat display list was wrong: only ~9% of 4-byte-aligned words carry a
polygon command byte, so it is not uniformly packed GPU packets.

`TERRAIN.ALL` in level directories is likely the same format used for world or
collision geometry — cracking `.all` probably unlocks both.

### `.anm` — animations, unknown

`buzz.anm` is 156,094 bytes versus `woody.anm` at 2,956 — a 53x gap that
reflects Buzz being the player character. Buzz is therefore the richest test
case, but start with a small one (`hamm.anm` 1,496; `sheep.anm` 1,340).
`woody.anm` opens with small little-endian values that look like counts and
16-bit deltas. PSX-era characters are usually **rigid part hierarchies**, not
skinned meshes — expect per-part transforms, not vertex weights.

### `level.dat` — PSX scene, under investigation

Level 1's is 437,164 bytes, opening `35 00 00 00 46 00 3f 00` and settling into a
repeating 16-byte pattern: three `int32` values then a constant `0x10`. Sample
records `(0x2901, 0x199f, -0xbd5, 0x10)`, `(0x2a3e, 0x1738, -0x203a, 0x10)`.
Reads as 3D positions plus a type/flag field, unconfirmed.

Level directories hold two parallel sets (`level.*` and `level1.*`) whose
relationship is not yet understood.

## Game structure

**5 worlds x 3 levels = 15 levels**, every third one a boss. Established
independently twice: `gfx/` holds texture-set configs `level1a/1b/1c` through
`level5a/5b/5c`, and boss cutscenes exist at exactly `l 03/06/09/12/15 bo`
(level 15 has two). Additional `gfx` sets: `training`, `bonus`, `boss`,
`loading`, `congrats`, `gamewin`.

There are 20 level directories, `level00`..`level19`, for 15 levels — the extras
are unmapped. `level00/level.bin` is 4 bytes (an empty overlay), so `level00` is
likely a hub, menu, or training area.

`data/creatures.cfg` is a plaintext entity table: `CREATURE <id> <name> <dir>`,
mapping type IDs to a `.all` model and `.anm` animation. Buzz is 0, Woody 1.
Character assets are spread across `chars` through `chars6`.

## Prior art

**RibShark's ToyStory2Fix** (github.com/RibShark/ToyStory2Fix) — already present
in this install as `scripts/ToyStory2Fix.asi`. A C++ runtime binary patcher
driven by byte-pattern signatures, so it never needed to understand asset
formats and documents none. It does yield engine facts: ~59 FPS target
(16949 us), native 4:3 with widescreen via `fScaleValue = 1/aspectRatio` and 2D
via `(4/3)/aspectRatio`, and a global speed multiplier clamped to 1-3.

**No published specification for any of these asset formats has been found.**
