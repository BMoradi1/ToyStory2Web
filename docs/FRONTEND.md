# The front end — DECODED and PORTED 2026-09-07/08

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

`FUN_00453cf0` loads "level 16" (`FUN_00452fc0(0x10)`), sets the width to
512, the tick step `DAT_0052f2d4` to 2, the backdrop flag off and the
ambient to 0x8c, and runs it; on return the cursor `DAT_0052ad8a` is the
position picked less one and `DAT_0055a0e4` the camera's node.

**"Level 16" is `data/level06/level1`** (found 2026-09-08 after a wrong
note here that the install lacked it): `FUN_00452fc0` takes ten off any
level number above ten, sets bit 8 of `DAT_0055a114` — the directory's
`level1` scene — and, with no texture set asked for, set 1. So the file
names are `level06\level1.dat`, `level06\level1.raw` and
`level06\level1t1.ngn`, which is just what `data/level16/levelt1.cfg`
says it was built from (`INPUT_FILE ..\level06\level1.dat`). The same
scene serves the load-game screen with set 3 (`FUN_00453f20`, 0xf8) and
the movie viewer with set 2 (`FUN_00453fa0`, 0xb8). Its `.dat` opens with
paths 1, 2, 3, 4, 6, 7, 8 and 9 and no markers, which the port's old
shape-scan read as one 504-point path; it walks the records by tag now
(docs/FORMATS.md).

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

**The diorama** (src/front/diorama.ts, PORTED 2026-09-08): a model
neighbourhood with each level's setting along it, the paths of the scene
reached by tag.

- *Objects.* Ids 0..99 are shown and 100..0x16e hidden (`FUN_004ccb20` at
  scale 0x1000 or 0), then for every open position a pair of
  -1-terminated i16 lists at `0x4f6dc8` (the hide pointer four bytes
  before, the show pointer at it, eight bytes a level) hides that level's
  closed dressing and shows its open one — with fifteen open, 80 of the
  scene's 167 objects are hidden. Ids are the loader's object-id space,
  not list indices.
- *Vehicles.* Ids 0x57..0x58 ride path 7, 0x59..0x5f path 8 and
  0x60..0x63 path 9 (`FUN_00438910`), from the phases `0x3200, 0x6400,
  0x9000, 0x5d00, 0x4d00, 0x4400, 0x2c00, 0x1000, 0xa00, 0x8b00, 0x6e00,
  0x3800, 0x1000` in 256ths of a node, 0x40 a tick, wrapping when the
  node passes `count - 5`; each sits at the lerp between two nodes and
  turns a quarter of the remaining angle toward its heading a tick.
- *Camera.* Path 2 holds three nodes per position and path 1 the three
  points they look at; `DAT_0055a0e4` is the node the last visit left.
  Each tick the target is the node (plus `push / 1024` of the eased look
  direction) less the camera; once within 0x2000 of it the camera settles
  — picking one of the three at random from `rand.dat` every 256 ticks,
  wobbling on `sin(t * 0x13) >> 5, sin(t * 0x17) >> 4, sin(t * 0x1d) >>
  5`, its velocity a sixteenth of the offset — else the offset is
  normalised to 0x1000 and the velocity eased toward half of it (`>> 5`
  on x and z, `>> 4` on y). `FUN_00438790` then pushes the velocity out of
  any box of path 3 (pairs of points: a centre and a corner; inside when
  between the two heights and within the corner's radius, by up to 0x180
  a tick). `push` climbs 0x60 a tick to 14000 while settled and falls
  0x100 otherwise. `FUN_00438650` turns the yaw toward the node's look
  direction and the pitch toward an atan2 of its SQUARED rise over its
  squared reach, an eighth of the gap a tick capped at `0x2000 /
  (distance / 128 + 0x100)`; the eye the renderer gets eases halfway to
  the camera each tick.
- *Sound.* A 3D event `position + 6` every tick at the level's look
  point (`FUN_004a3b90`) — not ported.

The level select's sprite table (level 16's) names its art on this
bundle: the token spinner on slot 0, the "tokens" sign on 4, the arrows
and digits on 17 (the same sheet as `level00`'s 17) and the font on 31.

## The summary, `FUN_004398b0` (ported 2026-09-12)

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
`DAT_0052f39e` appears at y 0x7a with sprite 0x4f.

Machine-code verification on 2026-09-12 corrected the initial timing notes:
coins start at zero and advance ONE every THREE ticks; `coins * 3 + 0x10`
is their timer, not their starting value. New-token counting has a
`60 * newTokens + 60` timer, with the first reveal after 60 counting ticks
and later reveals 30 ticks apart. Counting starts once the main clock is
below 300. The clock starts at 0x168 and HOLDS at 180 until Jump; it does
not automatically expire. The prompt blinks while the clock is strictly
between 120 and 240. Jump with counts unfinished reveals everything and
starts a 120-tick exit; with counts finished it starts a 24-tick exit.
The final 23 ticks fade to black. Evidence: 0x439a4b..0x439a8d,
0x439dac..0x439eac, 0x43a002..0x43a110.

`summary.ts` implements that state machine and the 64-slot spark pool.
`run.ts` shows it after ordinary levels, including pause-menu exits; boss
levels keep their movie/selector path. Results are copied before the level
is discarded. Its `levelt1.ngn` sheets and picture are loaded separately
from the title art and never replace the selector's textures. Power-up
icons use bits 1, 2, 4, 16, 8 (grapple before hover boots).

`tools/summary-probe.ts` checks the tally, input gates, fades, new versus
retained tokens, power-up mapping, spark capacity, and each sprite frame's
bounds against the supplied install. `tools/front-flow-check.js`, passed to
`tools/browser-shot.ts --eval-file`, exercises boot -> select -> Andy's
House -> pause exit -> summary -> select. The summary and selector were
captured and visually inspected in Chromium. The returned selector has no
player, creatures or effects, and gameplay ticks remain disabled.

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
- `summary.ts` — the post-level tally, with the original sprite art,
  token sparks, coin counting, power-up icons and Jump-to-exit timing.
- `diorama.ts` — the select's scene: `main.ts` loads `level06/level1`
  with the `t1` textures into the viewer, every used object kept
  separate, and the runner lays the sprite layer over the viewer's own
  picture (the page's chrome steps aside); the objects are shown, hidden
  and moved by id and the camera placed each tick. Options and load game
  and movie viewer open browser dialogs. The attract demo replays the boot
  chain. `exit` closes the front end.
- Checked headlessly with `tools/browser-shot.ts`: title -> menu -> select
  -> level 2 -> pause menu "exit level" -> select, the diorama drawn with
  its 80 hidden objects, the token, the arrows and the name over it; the
  cursor, the repeat and the flash's timing under
  `tools/front-validate.ts`.

## Game over and credits (ported 2026-09-12)

`src/front/endings.ts` implements both routines as pure engine ticks.
Game over uses picture 1 from `levelt1.ngn` and plays track 17 once.
Its 1200-tick clock accepts a fresh face-button press only below 1140
and above 23, reducing the clock to 24. Music ending reduces it to 23;
the final 23 ticks fade to black at speed 12. Muted, unavailable or
loading browser audio uses the clock instead of ending the screen early.
Final-life death now resolves the running level as `gameOver`, skips the
summary, and returns through the boot chain to title. The browser port
restores five lives and full health for continuing, preserving collected
progress; it keeps the exhausted-life flag separate so no negative value
can wrap to 255 in the save's unsigned lives byte.

Credits read the string at `0x4f5f54` from the selected executable, split
on `~`, into the original 40-row ring. The scroll advances eight units
per tick, feeds one row every 16 ticks, and places rows eight units apart
with y wrapping at 320. Text uses the existing 320-wide big-font routine.
The 600-tick backdrop clock cycles slots 48..57 from `levelt3.ngn`,
with 25-tick black fades beneath the text. The routine initially requests
picture 0; the first timed change selects slot 49. A fresh face-button
press after the initial fade, or reaching the text terminator, starts a
53-tick exit with fade speed 6. Track 18 loops. A final-level win plays
the ending movie, records `gameBeaten`, then opens credits and returns
to the selector. Title and summary tracks also now play once, as decoded.

`tools/endings-probe.ts` verifies input gates, held input, fades, timeout,
music completion, the full scroll (7606 ticks for this executable), and
all ten picture assets. Chromium's `tools/game-over-flow-check.js` loses
all six attempts through the real damage/death path and checks the return
to title and retained progress. `tools/credits-flow-check.js` runs the
final-win/ending/credits/selector flow with an isolated host and real local
art/text; it does not claim a complete final boss playthrough. Credits
were also visually inspected in Chromium.

## Retail options and load/save screens (2026-09-12)

The replacement HTML dialogs have been removed. `src/front/options.ts`
uses the original Etch A Sketch background and sprite table from
`level00/levelt2.ngn`: controller/music/SFX/GFX rows, moving alien cursors,
animated music and SFX pictures, volume bars and arrows. Row y coordinates
65/85/105/125 and the 32-tick cursor movement come from `FUN_004371b0`.
Text uses sprite 67 from slot 10, at half scale for labels and 3/8 scale
for prompts. Volume changes preview immediately; Cancel restores the
subpage snapshot, Jump accepts, and leaving options commits the result.

Controller and graphics subpages retain the original font/background but
are adaptations to the current engine. Controller supports physical-key
rebinding, duplicate-key swapping, active/passive camera and acceptance
through Enter or the final row. Escape cancels capture or restores the
subpage snapshot. The GFX page exposes the implemented three detail levels.
Original lens flare, animated-texture and gamma controls are not exposed
because those rendering features/settings remain unported. Bindings and
detail use browser preference keys `ts2.controls` and `ts2.detail`;
volume/camera remain in the game's save block. This is not a claim of
complete parity for the controller/GFX helper routines.

`src/front/load-screen.ts` restores the PC load/save root and eight-slot
pages from `FUN_0049b9e0`, using `level06/level1t3.ngn`'s Slinky picture
and the original font in 512-wide space. Root rows are load game, save
game, main menu; slot rows start at y33, spaced23, and selection blinks.
Saves go to browser slots `ts2.slot.0` through `.7`, never to the install.
An unused first slot offers current progress and an unused second slot
can offer the install's save. Loading applies the selected record; saving
snapshots current progress. The only DOM control is a small Import save
file button, needed to open the native picker in a trusted click. Its
validated result fills slot eight for explicit selection; it does not
replace progress until Jump loads it. `browser-menu.ts` now contains only
that file-picker bridge. Original slot transition timing is not fully ported.

All three front screens now use the normal keyboard/gamepad pad word.
Triangle (standard gamepad button3) cancels; the existing directions and
Jump navigate/select. File selection and physical-key capture still use
browser/keyboard input.

## Retail movie viewer (2026-09-12)

`src/front/movies.ts` reads the original order table at `0x4f6e8c`:
flags 0..11, 16, 12..15, 17, 18, terminated by255. `FUN_0043a600`
always offers flag zero (the trailer), filtering other entries by shown
flags; the wrapper plays movie `flag + 10` and reopens the same selection.

The retail binocular screen uses sprite table16 and `level1t2.ngn`.
The thumbnail sprite/frame pairs come from `0x4f6e3c`. Sprites60/61 form
the binocular body, 62/63 the scrolling layer, 57 the arrows, and 64 the
blank frame. `FUN_004949b0` takes horizontal clipping bounds, not scaled
width/height: the two thumbnail windows clip to x56..112 and208..264.
`HudPainter` now supports per-sprite clipping, preserving the engine's
reverse draw order. Selection uses the original fixed-point scroll,
velocity limit128, acceleration16 and damping8, with a53-tick exit fade.
Replays leave progress unchanged; missing files cannot be selected.
Earlier notes calling the movie/load artwork a 3D diorama were imprecise:
the loader uses the level16 texture variants, but these screens draw
pictures/sprites, not the selector's scene camera.

Validation: `tools/retail-menu-probe.ts` checks every movie thumbnail and
options sprite against the real texture bounds, volume clamping/rollback,
navigation and exit timing. Chromium checks cover movie decoding/replay,
options rollback/accept, physical-key rebinding and persistence, native
save import without premature replacement, slot save/load and return to
menus. Options, load/save and movie screens were visually inspected.

## What is left

1. Complete controller/GFX helper parity and load/save transition timing;
   lens flare, texture animation and gamma need engine support first.
2. The level selector's per-level ambience and camera-flight comparison.
