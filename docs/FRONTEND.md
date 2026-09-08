# The front end — DECODED 2026-09-07; the title cards PLAY

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

## The screens are PICTURES, not a scene

An earlier note here said the front end was blocked on rendering geometry
from the `.ngn`. That was wrong, and the correction is the useful part.
`data/level00`'s four `.ngn` files hold **no geometry at all**: each one's
chunk chain is a 0x104 texture chunk and a 0x106 creature chunk and then
the file ends, with no gobj sets (0x100) and no instances (0x101), where a
level's scene has both. They are texture bundles.

What the screens are is full-screen 800 x 600 pictures shown as the
BACKDROP. `FUN_0048f1b0(n)` adds one to `n`, takes that entry of the table
at `0x500a58` (`36, 40, 41, 42, 43, 44, 45, 46, 47`), falls back to the
one at `0x500a7c` when that slot is not loaded, and raises the backdrop
flag `DAT_005d2a90`. In `level00/level.ngn` those slots are:

| `FUN_00438520` argument | slot | what it is |
|---|---|---|
| 0 | bgr40 | the Disney/Pixar "Toy Story 2" card |
| 1 | bgr41 | the ESRB rating card (320 x 256, and the only 24-bit one) |
| 2 | bgr42 | the Hasbro / Slinky / Etch A Sketch / Little Tikes notices |
| 3 | bgr43 | a second notices card |
| 4 | bgr44 | "Buzz Lightyear to the Rescue" — the title, under the list menu |

**Ported 2026-09-07** (`src/front/title.ts`): the boot plays its three
logo movies and then shows cards 2 and 3 as `FUN_004381f0(10)` does,
landing on the title. Each is up for 600 ticks at the engine's 59 a
second, and Escape, Enter, Space or a click moves on. They are decoded
from the user's own install; the pictures are 8-bit palettised BMPs,
which the browser's own image decoder refuses and `decodeBmp` did not
read either until this pass, since every level texture is 24-bit.

## What is left

1. **The menus' text.** The HUD font is sprite 20 on texture slot 32, and
   `level00`'s bundle has slots 0, 17, 31, 37 and 40-44 — no 32 — so the
   front end does not draw text with it. `FUN_0049d750(string, y, colour)`
   is what the level select prints its names with, and reading that is the
   next step. With it the list menu and the level select follow quickly:
   both are the pause menu's kind of code over a picture that now works.
2. **The level select's diorama.** The routine shows and hides scene
   objects 0..0x16e, and `level00` has no instances for those calls to
   touch, so what it looks like on the PC build is not established. It
   loads through `FUN_00452fc0(0x10)`, directory 16, which this install
   does not have.
