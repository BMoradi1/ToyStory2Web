# The front end — DECODED and PORTED 2026-09-07

Where the title, the menus and the level select live in `toy2.exe`, how
the game flow runs them, what each draws, and what the port shows. The
port is `src/front/` (the fonts, the screens, the runner) with the flow
wired in `src/main.ts`; `tools/front-validate.ts` checks the screens'
rules against the executable's own text and tables.

## There is no front-end "level"

The level dispatch has two slots past the fifteen levels, 16 and 17
(docs/LEVELS.md "Dispatch"); both their init and tick are one-byte
returns. The front end is the game-flow state machine `FUN_0049d910`
(1,681 bytes) calling screens through `FUN_004381f0(n)`, each over the
front-end bundle `data/level00` loaded by `FUN_00452fc0(0)`:

| n | routine | screen |
|---|---|---|
| 1 | inline | a fade: 0xa0 ticks of picture 1, ending on any button |
| 2 | `FUN_00437fb0` (574) | the title, then the list menu; the choice comes back in `DAT_00830c88` |
| 4 | `FUN_004398b0` (2,173) | the level summary: the tokens found, the coins, "press jump to exit" |
| 5 | `FUN_00437b20` (275) | game over: picture 1 for 0x4b0 ticks with track 0x11 `over` |
| 6 | inline | a 600-tick hold on picture 0 |
| 8 | inline | returns the last choice |
| 9 | `FUN_004371b0` (2,200) | options (not read) |
| 10 | `FUN_00438520(2)` then `(3)` | the two notice cards, 600 ticks each or 0x18 after jump |
| 11 | `FUN_0043a380` (625) | the credits scroll |

Before each, the flow sets `DAT_0055a114` — 0x43c for the title and
menus, 0x47c for the summary and game over, 0x4bc for options, 0x4fc for
the credits — which picks the bundle: `level.ngn`, `levelt1.ngn`,
`levelt2.ngn`, `levelt3.ngn` in that order, 0x40 apart. The four hold
different art: `level.ngn` the title pictures (below), `levelt1` the
summary's (`token256`, `game_over256`, `levcomp1/2`, `all_pickups`,
by its build config), `levelt2` the options screen's, `levelt3` the
credits' pictures on slots 48..57.

## The flow, `FUN_0049d910`

    boot:      cards 2 and 3 (screen 10); movies tt, dlogo, acti; if none
               was skipped, the trailer (FUN_0049eb20(0, 0, 1))
    title:     screen 2 -> DAT_00830c88:
                 0 timed out       -> the attract demo (a recorded level,
                                      DAT_0052c83c cycling 0, 3, 7, 10, 13
                                      as the select cursor), then boot again
                 1 start/continue  -> the level select
                 2 options         -> screen 9, then the list menu again
                 3 load game       -> FUN_00453f20 (FUN_0049b9e0 over the
                                      select's bundle), then the menu
                 4 movie viewer    -> FUN_00453fa0, then the menu
                 9 exit            -> FUN_00490d00, the program ends
    select:    FUN_00453cf0 -> FUN_00438a50; 0 picked, else the menu again.
               Picked: DAT_00830d58 = 1 ("continue game" from now on); the
               intro movie by play position unless a boss (level 12's own,
               FUN_0049eb20(0x10), before position 12); load; play.
    the level: DAT_0052b7dc says how it ended —
                 1  complete (FUN_0042fc50, FUN_0049fd40, FUN_004a0f80)
                 2  died: FUN_00414110 reloads it
                 3  boot again;  4  the title again  (FUN_0049dfe0)
                 5  the pause menu's "exit level" (FUN_0049f4b0)
               With lives below zero, 5 is game over: screen 5, then boot.
               Otherwise 1 and 5 alike: a boss level marks its byte at
               +0x158 + cursor, plays its boss movie the first time, and
               level 15 plays the ending and the credits; any other level
               shows the summary (screen 4) and tests for the fiftieth
               token. Then the select again.

`DAT_00830ca8` is the token byte the level was entered with
(`FUN_00414720`), read by the select to move the cursor on after a first
clear and by the summary to animate only the tokens new this run.

## The screens are PICTURES, not a scene

An earlier note here said the front end was blocked on rendering geometry
from the `.ngn`. That was wrong. `data/level00`'s four `.ngn` files hold
**no geometry at all**: each one's chunk chain is a 0x104 texture chunk
and a 0x106 creature chunk and then the file ends. They are texture
bundles. The screens are full-screen 800 x 600 pictures shown as the
backdrop: `FUN_0048f1b0(n)` adds one to `n`, takes that entry of the table
at `0x500a58` (`36, 40, 41, 42, 43, 44, 45, 46, 47`), falls back to the
one at `0x500a7c` when that slot is not loaded, and raises the backdrop
flag `DAT_005d2a90`. In `level00/level.ngn`:

| argument | slot | what it is |
|---|---|---|
| 0 | bgr40 | the Disney/Pixar "Toy Story 2" card — the title screen |
| 1 | bgr41 | the ESRB rating card (320 x 256, and the only 24-bit one) |
| 2 | bgr42 | the Hasbro / Slinky / Etch A Sketch / Little Tikes notices |
| 3 | bgr43 | a second notices card |
| 4 | bgr44 | "Buzz Lightyear to the Rescue" — the list menu's background |

They are 8-bit palettised BMPs, which the browser's own image decoder
refuses; `decodeBmp` reads them (checked pixel for pixel against an
independent decoder).

## The fonts (src/front/text.ts)

The HUD's small font is sprite 20 on sheet 32, and the front-end bundle
has slots 0, 17, 31, 37 and 40..44 — no 32. What it draws text with is
**`loadfont.bmp` on slot 31** (every level's build config names it:
`BMP_FILE \pcscreens\txtr\loadfont.bmp 31`), a 256 x 256 sheet of 32-pixel
cells, eight to a row: A..H, I..P, Q..X, Y Z 0..5, 6..9 `. , ; :`,
`\ /` blank `! ? ( ) '`, then the list menu's two cursor halves at row 6.

**`FUN_0049d390(text, y, x, r, g, b)`**, the big text, samples the cells
directly through `FUN_004ce2c0(0x1f)`: each character a quad 16 units
square, sampling 31 x 31 texels at its cell, 13 units apart, the run
centred on `x`; letters of either case go to cells 0..25, digits to
26..35 (`c - 0x16`), eleven punctuation marks to fixed cells, and anything
else, a space included, draws nothing but takes its 13 units. Mode 0xc40.
`FUN_0049d750(text, y, x)` is it in white (0xff, doubled).

**`FUN_0049b580(y, text, brightness)`**, the menu text, is sprite 50 —
level 0's table has it as the same sheet in 32 x 32 frames, 48 of them
row-major — at half scale in the 320 space, 12 apart from
`0xa0 - 6 * length`, so centred on x 160. Lower case only (`c - 0x61`); an
apostrophe is frame 47; a space is skipped. Brightness 0x80 draws the
frames as they are, opaque; any other value draws them white with alpha
`0xff - 2 * brightness` (the mode word `brightness * 0x200 + 0x60`), which
is how "press jump" fades.

**Two widths.** The sprite helpers divide x by `DAT_004f7414` (docs/HUD.md
calls it the 512 space, which it is in play). It is a variable:
`FUN_00453cd0`, which the flow calls before every picture screen, sets it
to 320, and `FUN_00453cf0` sets it back to 512 for the level select. So
the list menu's cursor at x 0x40 and 0xf0 flanks its rows, and the
select's arrows at 0x20 and 0x1c0 sit at the screen's edges. y is always
over 256.

## The title, `FUN_00437fb0`

Picture 0, track 0x14 `titlescr`, a fade up from black at speed 0xc.
"press jump" at y 0xcc with brightness `fold(ticks & 0x3f) * 4` — the
triangle 0..0x1f..0, so a 64-tick fade in and out. Jump (pad bit 0x4000,
on its edge) after 0x1e ticks fades to black and, 0x17 ticks later, opens
the list menu with the select sound; 900 ticks with nothing pressed go to
the attract demo (300 after one, with no prompt shown). Coming back from
the list menu with `DAT_00830c88 == -1` — options, load, movies, or the
select cancelled — re-enters the list menu directly, not the title.

## The list menu, `FUN_00437c40`

Picture 4, track 0x13 `ygafim`. Five rows of menu text at y 0x78, 0x8c,
0xa0, 0xb4, 0xc8: `start game` (`continue game` once `DAT_00830d58` is
set), `options`, `load game`, `movie viewer`, `exit`, all at brightness
0x80. The cursor is sprite 62's two frames (the sheet's `<` and `>`) at x
0x40 and 0xf0 of the 320 space, half scale, colour `(pulse, pulse, 0x80)`
with the same triangle wave, at a y that slides two a tick toward the
chosen row; a press is only read once it has settled. Up and down are pad
bits 0x10 and 0x40 on their edges with the move sound. Jump, after 0x1f
ticks, takes the row: the first four fade out and return `row + 2`, and
`exit` calls `FUN_004cf359(-1)` — the program ends, no fade.

## The level select, `FUN_00438a50` (3,598 bytes)

`FUN_00453cf0` loads directory 16 (`FUN_00452fc0(0x10)`), sets the width
to 512, the tick step `DAT_0052f2d4` to 2, the backdrop flag off and the
ambient to 0x8c, and runs it; on return the cursor `DAT_0052ad8a` is the
position picked less one and `DAT_0055a0e4` the camera's node.

**What is open** (`FUN_0049eb50`): walk the select order counting levels
whose token byte is non-zero, stopping at the first zero, and count the
token bits on the way; return `tokens << 16 | wanted << 8 | count`, where
`wanted` is the i16 at `0x503840 + 2 * count`: `0 0 3 0 0 10 0 0 18 0 0
28 0 0 40 0` — the boss of each world wants 3, 10, 18, 28 and 40. So a
level is open once VISITED — bit 7 of its token byte, which the levels'
own init writes (`tokens[level] = 0x80` in five level routines) and the
save decode had down as unread — and the select offers `min(count, 14) +
1` positions.

**The cursor**: position `DAT_0052ad8a + 1`, clamped to the last open;
then, if not the last and `DAT_00830ca8` (the entry byte) was zero and the
level now has tokens, one more — a first clear moves you on. Right and
left are bits 0x20 and 0x80 on their edges, with a repeat: after 0x20
ticks of an unchanged pad the previous word is cleared whenever `(t & 0xf)
< 3`, so a held direction fires again at 0x21 and then every sixteen.
Jump and cancel (0x1000, held, not an edge) are ignored for 0x3c ticks.
Jump on the last position with fewer tokens than wanted plays the select
sound and starts a 0xc0-tick flash; otherwise it fades to black at speed
6 and, once the counter passes 0x1b, returns 0. Cancel fades the same way
with sound 2 and returns 1.

**The sprite layer**, in this order (later calls land behind):

| what | sprite (level 16's table) | where |
|---|---|---|
| a spinning token per token held HERE | 54, frame `(4i + 4 + t/2) & 0x1f`, scale 0xccc x 0x800 | `(2i - n) * 0x13 + 0x100`, y 0x32 |
| the token icon and the count held | 54 at (0xe, 0xc0) of the 320 space; 58 (digits) at 0x66 and 0x73, y 0xd0 | red `(0x80, 0x20, 0x20)` for 39 of every 64 ticks of the flash |
| tokens wanted, when short on the last | 58 at 1.5x: one digit at 0xf4 or two at 0xe8 and 0x100, y 0x6d, blinking 48 of 64 ticks; the sign 55 at (0x70, 0x58) of the 320 space | |
| the arrows | 57 frame 0 at (0x20, 0x70) when not first, frame 1 at (0x1c0, 0x70) when not last, same blink | |
| the text | `you need more tokens` at (0x100, 0x9a) while the flash's `& 0x3f > 0x18`; the level name at (0x100, 0x20); `jump to select` at y 0xbe and `cancel to go back` at y 0xd0 | |

Two of the engine's own quirks, kept: the tokens shown for the level are
`DAT_0052f0d7[position]` — by PLAY POSITION, where every other reader
goes through the select order, so the third and sixth positions show each
other's; and the prompts are centred on `13 * length - 0x1db` with the
length of `jump to select` for both, which is -293: **the PC build draws
them off the left of the screen and never shows them.** The names are
fifteen pointers at `0x4f6be4`, by position.

**The diorama.** Everything else the routine does is 3D: the first hundred
scene objects shown and 100..0x16e hidden (`FUN_004ccb20`), per open level
a pair of -1-terminated object lists at `0x4f6dc8` hidden and shown, a
camera riding two paths from the picked level's node toward the next with
a wobble off the sine table, objects 0x57..0x63 animated through
`FUN_00438910`, and a sound event per level (`position + 6`) at its node.
**This install has no level 16 data**: `data/level16` holds only the build
configs, which name what it was — `etch_lh.bmp` and `etch_rh.bmp` on slots
32, 33 and 14, an Etch A Sketch — and level 16's sprite table says the
rest: the token spinner on its slot 0, the "tokens" sign on its slot 4,
and on slot 17 the arrows and digits, which turn out to be the SAME sheet
as `level00/level.ngn`'s slot 17 (checked frame by frame against the
headers). Whether the retail CD carries `level16/level.ngn` and `.dat` is
not established; without them the PC game would have nothing to load here
either.

## The summary, `FUN_004398b0` (decoded, not ported)

Picture 0 of `levelt1` (`token256`), track 0x15 `levcomp`, over the 320
space. The five token slots at `0x24 + 0x34 i`, y 0x20 as sprite 76
(level 0's table, `levelt1`'s slot 0: the spinner, frame `(t/2 + 4i) &
0x1f`), those held drawn full and the rest black; the ones new this run
(held now, not at entry) light up one at a time every 0x1e ticks with
sound 1, each throwing fifteen sparks from the random table
(`FUN_00493a60`, sprite 0x50). Level number and name pieces as sprites
0x52 and 0x53 (`levcomp1/2`, slots 18 and 19) at y 0x3c; the five
power-up icons of sprite 0x51 (`all_pickups`, slot 3) at `0x44 + 0x28 i`,
y 0xad, white where `DAT_0052f2d8` has the bit; the coin count
`DAT_0052f39e` counted up three a tick from 0x10 at y 0x7a with sprite 0x4f.
"press jump to exit" at (0xa0, 0xdc) blinks while the clock is between
0x78 and 0xf0; jump then either skips the count (first press) or fades
out. 0x168 ticks in all.

## In the port (src/front/)

- `text.ts` — the two fonts as pure layout.
- `screens.ts` — the title, the list menu and the level select as
  states stepped once a tick with the pad's 16-bit word, each returning
  what it drew (a picture, sprite quads, glyph runs, the fade's grey) and
  the effects to play. The strings and the wanted table are read from the
  user's `toy2.exe` (`readFrontStrings`).
- `run.ts` — the flow: a full-page 4:3 overlay ticked at 59 a second,
  the screens in the engine's order, the level handed to `main.ts`
  (`playLevelFromFront`: the intro by the engine's rule, then the scene
  and Buzz) and the select again when the pause menu's "exit level" or
  the boss movie ends it. `HudPainter.paintFront` draws a frame with the
  HUD's own blitter over the picture.
- What the install does not carry is skipped rather than stood in for:
  the select runs on black with its name, its arrows and digits (slot 17)
  and its text, and without the token spinner and the sign (level 16's
  slots 0 and 4). Options, load game and the movie viewer close at once.
  The attract demo replays the boot chain. `exit` closes the front end.
- Checked headlessly with `tools/browser-shot.ts`: title -> menu -> select
  -> level 2 -> pause menu "exit level" -> select, with the cursor, the
  repeat and the flash's timing under `tools/front-validate.ts`.

## What is left

1. **The summary screen** (above): `levelt1.ngn` has every sheet it
   needs; it goes between a level and the select on the way back.
2. **Game over, options, load game, the movie viewer, the credits** —
   options and load are unread; game over and the credits are small.
3. **The diorama** — needs level 16's scene, which the install lacks.
