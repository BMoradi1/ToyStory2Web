# The front end — DECODED 2026-09-07, not ported

Where the title, the menus and the level select live in `toy2.exe`, what
each needs, and why the port draws none of them yet.

## There is no front-end "level"

The level dispatch has two slots past the fifteen levels, 16 and 17
(docs/LEVELS.md "Dispatch"); both their init and tick are one-byte
returns. The front end is the game-flow state machine `FUN_0049d910`
(1,681 bytes, states in `DAT_0052b7dc`) calling screens through
`FUN_004381f0(n)`:

| n | routine | screen |
|---|---|---|
| 1 | inline | a fade: 0xa0 ticks of the last picture, ending on any button |
| 2 | `FUN_00437fb0` (574) | the "press jump" title menu; returns the choice into `DAT_00830c88` |
| 4 | `FUN_004398b0` (2,173) | a menu screen, not read |
| 5 | `FUN_00437b20` (275) | a short screen, not read |
| 6 | inline | a 600-tick hold |
| 8, 9 | `FUN_004371b0` (2,200) | not read |
| 10 | `FUN_00438520(2)` then `(3)` | the two title cards: `FUN_0048f1b0(n)` shows full-screen picture `n` for 600 ticks, or 0x18 after jump |
| 11 | `FUN_0043a380` | the credits scroll (`Congratulations!` text in the executable) |

The boot: `FUN_0049d910` plays movies tt, dlogo and acti (docs/FORMATS.md
"The cutscenes"), shows screen 10, then screen 2. `FUN_00437c40` (871
bytes) is the list menu with `start game`, `continue game`, `load game`
and `options`, drawn like the pause menu (docs/HUD.md) with music track
0x13 `ygafim`; `FUN_00437fb0` draws `press jump` at y 0xcc with
`FUN_0049b580`.

## The level select, `FUN_00438a50` (3,598 bytes)

A 3D diorama, not a list. It runs over a front-end scene: the first
hundred scene objects are shown and objects 100..0x16e hidden
(`FUN_004ccb20`, the scene-object scale call), then per unlocked level a
table at `0x4f6dc8` — pairs of pointers to -1-terminated lists of scene
object numbers — hides one list and shows the other, so the diorama grows
a level at a time. The camera rides two paths, slots 1 and 2 of the
loaded `.dat` (`DAT_00559c74`, `DAT_00559c78`), 0x24 bytes a node with
the position at +0x10, from the node of the current level toward the
next.

**How many levels are open** (`FUN_0049eb50`): walk the select order
counting levels whose token byte is non-zero, stopping at the first zero,
and count the token bits; the return packs `table[0x503840][count] <<
16 | tokens << 8 | count`, the word at 0x503840 being how many tokens the
next level wants. The select shows `count + 1` levels, at most fifteen,
and prints `you need more tokens` (`0x4f5c84`) when the tokens held are
short of that word. Level names come from fifteen string pointers at
`0x4f6be4`; the prompts are `jump to select` (`0x4f6878`) and `cancel to
go back` (`0x4f6888`). Left and right are pad bits 0x20 and 0x80, jump
0x4000, cancel 0x1000. Picking sets the select cursor `DAT_0052ad8a` to
the level's position and returns; the game flow then plays the level's
intro through `FUN_0049eb20` and loads it.

## The cutscene theatre, `FUN_00453fa0` / `FUN_0043a600`

Loads directory 16 with mode 0xb8 and loops: `FUN_0043a600(cursor)`
picks a movie index and `FUN_0049ab90(index + 10)` plays it, -1 leaving.
Directory 16 is empty in the install examined, so this screen may be
unreachable in the shipped build.

## Why none of this is ported

1. **The scenes exist only as `.ngn`.** `level00` holds `level.ngn` and
   three `levelt*.ngn` (the diorama and the menu rooms) with no
   `level.dat` — its `level.bin` is four bytes, a record count of 4 and
   nothing after — so the port's geometry path, which reads `level.dat`,
   has nothing to draw. Rendering from the `.ngn` scene is the open item
   that unblocks all of this at once; the scene parser already reads its
   instance and primitive tables. Where the diorama's camera paths come
   from without a `.dat` is not settled.
2. **Full-screen pictures.** `FUN_0048f1b0(n)` shows a picture by number;
   which file it reads has not been traced (candidates: `data/BITS`,
   `data/pcbits`, the `gfx/` sets).
3. The menus themselves are the pause menu's kind of code and would port
   in an afternoon once there is something to draw them over. A first cut
   over a plain colour is possible today.
