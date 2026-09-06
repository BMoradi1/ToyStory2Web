# The 2D layer: HUD, coins and sprites

Decoded 2026-09-06 from toy2.exe. Everything below is drawn from the
executable's own sprite table over the texture sheets that every level's
`.ngn` carries, so the browser can draw all of it from the user's install.
The parser is `src/formats/sprite-table.ts`; `tools/sprite-table.ts` dumps
and checks it. Nothing from the table is stored in this repo.

## The sprite table

`FUN_00447d40` fills a 128-entry pointer table (`DAT_00557500`) when a level
loads: fifty global headers (`PTR_DAT_004ec0a4`, ten of them null) and then
the level's own list (`PTR_PTR_004f7284[levelId]`, -1 terminated; the
front end is level ID 0 with 34, the levels have 0 to 6). A header is

    i16 texture   the texture SLOT (0..63), looked up by FUN_004ce2c0 in
                  the loaded set; the same sparse slot numbers the .ngn
                  texture sets carry
    u8  w, h      one frame, in texels
    u16 x2        zero
    (u8 u, v) x N top-left texel of frame N

There is no frame count; each draw names its frame. The draw's UVs are the
frame's texel rect over the texture's size, so frames are never scaled by
the table.

**Which sheets.** Every `levelNN/level.ngn` holds slot 31, the HUD and
effects atlas, and slot 32, the font sheet with the power-up icons; the
level's own icons are on a level slot (level 1's sheep on slot 8). The front
end's sprites use slots 0..10 and 17..19, which only `level00/*.ngn` carry.
The atlas contents, by global index (`SPRITE` in the parser names the ones
the HUD uses):

    0,1,24  15x15 puffs (effects)      21,22   grey sphere, splat (effects)
    2       15x15 sparkles x4          23      31x31 empty square frame
    3       16x16 big brown digits,    25      11x11 play-arrow and square
            frames 0..9, '/', '?'      26      40x32 chequered flag
    4       31x31 round shadow         27      32x32 Mr Potato Head
    5       31x31 star burst           28      31x19 grey disc
    6       1x1 solid texel: bars      30      31x39 red signpost
    7       32x32 white ring           31      15x15 small sparkle
    8       31x31 crosshair            32      32x32 Hamm
    9       31x8 laser bolt x3         33      15x16 small brown piece
    10      64x64 Buzz figure (32)     34      31x15 chain link (grapple)
    11      48x64 battery (32)         36      64x62 green hand (32)
    12      7x32 battery glass         37      64x62 green double arrow (32)
    13      31x7 bar frame             38      16x16 pad buttons x2
    14      64x32 wings (32)           16      31x31 coin, 12 frames
    15      64x32 laser arm (32)       20      16x16 font, 56 frames (32)

"(32)" means sheet 32; the rest are sheet 31.

## The draw primitive

Every screen sprite ends in `FUN_004b8cc0(x, y, w, h, uv0, uv1, texture,
colour, blend)`, a quad in **normalised screen coordinates**: the helpers
divide x by 512 or by 320 and y by 256 (the constants at 0x4f7414/8 are
512.0 and 256.0, `_DAT_004dc0f4` is 1/320 and `_DAT_004dc020` is 1.0).
Both spaces stretch to the whole screen, so a 512-space x of 0x1dc and a
320-space x of 0x128 land on the same column (0.93). Sizes are the frame's
texels times a 12-bit scale (0x1000 = one texel per virtual pixel) over the
same divisor.

**The stretch assumes a 4:3 screen.** A unit of the 320 space is 6.7% wider
than a unit of the vertical one there, which is the shape the font was drawn
for. The viewer widens its camera to the window instead of pillarboxing, so
the 2D layer stretches with it and the glyphs come out wider than the
original's on a wide window — about 30% on a 16:10 one. Fixing that means
letterboxing the whole view to 4:3, three-dimensional part included; do that
and this layer comes right on its own, because it is defined in the same
spaces the engine uses.

    FUN_00493f40  x/512  colour and scale given          the box, font, bars
    FUN_004942d0  x/320  colour and scale given          HUD icons
    FUN_00494820  x/512  1:1, screen-fade colour         big digits
    FUN_004946a0  x/320  1:1, screen-fade colour         bar frames
    FUN_00493dc0  x/320  1:1, colour given               icons
    FUN_00493a60  x/512  1:1, blend given                loading screen

**Later calls draw BEHIND earlier ones**, found while building this
(2026-09-06). `FUN_004b8cc0` fills its buffer from the end downward
(`DAT_005086fc` counts down) and the renderer walks it forward, so a frame
lands in the reverse of the order it was submitted. It has to work that way:
every bar is submitted before the frame around it, and the frames are opaque
black inside, so drawing in call order paints over the bar. The port keeps
the engine's call order and flushes its queue backward.

Colour is (r, g, b) with **0x80 neutral** (0xff doubles). The mode word's
bits 5..6 pick alpha and blend: 0 is alpha 0x80 with normal blending
(0xc40), 0x20 is additive (0x4840) at full alpha, 0x40 subtractive
(0x20840), 0x60 opaque with `0xff - (mode >> 8)` as alpha, so a fade rides
in the high byte.

Sprite 6, the one every bar is drawn from, is a single texel of
**(190, 190, 190)**, not white, so a bar's colour on screen is
`190 * colour / 0x80` clamped: the (0x80, 0x80, 0) spin bar comes out
(190, 190, 0).

World sprites go through `FUN_004b8e60` (camera-facing) or `FUN_004b8a30`
(laid flat) with a position in LEVEL units as floats, a rotation, a width
and height in level units, then the same UVs, texture, colour and blend.

## The HUD (`FUN_0049fd40`)

Ten elements, each with a show timer `DAT_0052c824[n]` and a slide phase
`DAT_0052f2e0[n]` (`FUN_0049fc60`). While the timer is nonzero (and no
dialogue is up) the phase rises 32 a tick to 0x400 and the timer counts
down unless it is 1000 or more, which means permanent; otherwise the phase
falls. The element's offset is `(sin(phase) >> 8) - 0x40` using the
0x4000-scale sine table with 0x400 a quarter turn: an ease from 64 virtual
pixels off screen to 0. Top elements add it to y, bottom ones subtract it,
and the elements that share a row stack leftward by `(offset + 0x40) / 2`
each, so a hidden neighbour takes no room.

Blink and pulse come from the frame dividers: `DAT_0052ad61 < 8` is the on
half of a 16-tick blink; `DAT_0052ad62` (0..31) and `DAT_0052ad63` (0..63)
folded into a triangle give the pulse `0x50 + 4 * tri` (0x50..0x8c).

    n  where            shows                              timer
    0  top-left         lives: Buzz icon (10) at (0x10, 0x10)/320 scale
                        0x800; digit font (20) frame 0x1a+lives at
                        (0x3c, 0x20)/512                   0xb4 on a life,
                                                           level start
    1  top-right        health: battery (11) at (0x110, 0x10)/320 scale
                        0x800; fill = pixel (6) at (0x1dc, 0x2f-h)/512,
                        5 wide, h = 2*health+2 tall, colour
                        (0x80, 6h, 0); glass (12) at (0x128, 0x10)/320.
                        h < 5 blinks. The battery is the LABEL and the
                        glass column beside it is the gauge: the fill
                        sits inside the glass, which is why the glass is
                        submitted last and so lands behind it
                                                           0xb4 on change
    2  bottom-left      coins: coin (16) at (0x1a, 0xe0)/512 scale
                        (0xccd, 0x800), frame = a 0..23 counter / 2;
                        tens and units font at x 0x33 and 0x3f, both at
                        the same y as the coin                0xb4 on a coin
    3  bottom-right     spin charge: wings (14) at (0x110, 0xde)/320
                        scale 0x800; bar pixel at (0x1b6, 0xda)/512,
                        width (charge/2)*0x1838, height 3, yellow
                        (0x80,0x80,0), blinking black when full (>= 0x3c)
                        or recovering (< -0x77, width (c+0x78)/-3);
                        frame (13) at (0x110, 0xd8)/320    0x78 while
                                                           DAT_0053c83c != 0
    4  left of 3        laser arm (15) at (0x110-s, 0xe0)/320. With ammo:
                        two font digits at (0x122, 0x129)-s, y 0xd8+dy,
                        scale 0x800 and the disc (28) or piece (33) icon.
                        Without: bar from the laser charge DAT_0053c840
                        (width c*0x1644/2, colour (0x80, 2c, 0), blinks
                        at 0x40) or the power timer DAT_0053c824 (width
                        t*0x98, green (0, t/16+0x40, 0)); frame (13)
                                                           0x3c while any
    5  left of 1        find-five: level icon 50 at (0x110-s, 0x10)/320,
                        digit font at (0x1da - s*512/320, 0x20)/512;
                        pulses and blinks its digit at five, and plays
                        event -5 once                      5 while count > 0
    6  top, x 0x8c      timed run: flag (26) at (0x8c+dx, 0x10)/320.
                        Clock < 100 (a race): big digit (3) frame
                        3-laps at (0xfa, 0x18)/512, pulsing on the last
                        lap. Else the countdown, tens at 0xf3+dx and units
                        at 0x101+dx as big digits, tick event 0x5e each
                        frame; with a collect count (DAT_00830d4c >= 0)
                        dx = -0x20, icon 51 at (0xa0, 0x10)/320 and the
                        count as a big digit at (0x12e, 0x20)
                                                           5 while the run
                                                           state is 1 or 2
    7  top centre       boss: bar pixel at (0xe4, 0x14)/512, width
                        DAT_0052b7e0 (0..0x36) texels, height 4, colour
                        (0x80, 2v, 0), blinking below 0xb; frame (13) at
                        (0xe0, 0x10)/512 scale 0x2000. The value is the
                        boss creature's health mapped (health-9)*0x36/11
                                                           0x5a, set each
                                                           tick by the boss
    8  left of 5        Mr Potato Head (27), pulsing        5 while his part
                                                           is carried
    9  left of 8        Hamm (32), pulsing                  5 while coins >=
                                                           50 and slot 0 is
                                                           not yet taken

Level start sets timers 0..2 to 0xb4 and the lives phase to 0x400; a pad
bit (`DAT_0052ad88 & 0x800`) shows the three counters for 0x5a. The ammo
counters come from the pickup switch: category 6 adds 5 to `DAT_00882938`
(cap 10, icon 33) and zeroes the other; category 7 adds 10 to
`DAT_00882964` (cap 30, the disc); category 10 starts the 0x4b0-tick power
timer. The same function draws the pause menu (`DAT_0052adb0` pages,
`FUN_00401fb0` text at x centred by `0xa0 - 4 * len` in the 320 space,
box `FUN_00401b60`) and the "you have collected a token" screen; they are
not laid out here.

## The talk box (`FUN_00401c30`)

The box is `FUN_00401b60(0x101 - (w >> 13), 0x2c - (h >> 13), w, h, 0x80, 0, 0)`
where `w = scale * 0x1da` floored at 0x4000 and `h = scale << 5` floored at
0x2000, so it scales open about (257, 44) to a full 474 x 32 in the 512
space. That helper is five quads of sprite 6, frame 1: a two-pixel black
left and right edge, a one-pixel black top and bottom, and the fill inset by
(2, 1) at mode 0, which is half alpha — a dark red panel with a black frame.

The text runs only while the box is fully open. It is the small font at half
scale in the 320 space: thirty-six columns eight apart from x = 16, two rows
at y = 32 and y = 40, colour (0x80, 0x80, 0), which is the sheet's own
yellow. A highlighted word (the `^...^` pairs in the strings) drops the red
channel to 0 and comes out green. "press jump to continue" (0x4df684) is
centred at `x = (0x28 - len) * 4`, y = 48, in white, and blinks on the
32-tick divider's first half while a page is waiting.

`FUN_0049b630` maps a character to a glyph: lower case a..z are frames
0..25 and the digits follow at `c - 0x16`, with `!`, `'`, `*`, `,`, `-`,
`.`, `>` and `?` by table, a space drawing nothing, and `~` and `@` drawing
the two frames of icon sprite 38 two pixels higher. Upper case has no
glyphs, which is why every string in the executable is lower case.

## Coins and pickups in the world (`FUN_00440f70`)

The pickup list (`DAT_00559d6c`, src/sim/pickups.ts) is walked each frame
for records within the draw distance `(DAT_0054bef0 / 4)^2` in 16-unit
steps. A record whose id is below 0x30 is a **sprite**: coins are id 0x10,
which is sprite 16. It is drawn camera-facing at its position, **100 x 100
level units**, frame `counter >> 1` where the counter runs 0..19 over 20
ticks, and each successive record in the list starts two frames later
(wrapping at ten), so neighbouring coins spin out of phase. Alpha fades
with distance: `((R^2 - d^2 + 100) >> 6)` capped at 0xff, measured from the
CAMERA in 16-unit steps with `R = DAT_0054bef0 / 4 = 0x680 / 4 = 416`, so a
coin is dropped past about 6,656 level units and fades over the last 300 of
them. Under it the shadow: sprite 4, the 31 x 31 rect at (96, 96) of slot
31, laid flat 10 level units above the record's floor, 80 x 80 level units.

The engine has two paths for it and the art settles which is meant. The
sprite is a **light disc fading to a black rim**, which only makes sense
subtracted: the bright middle takes the most light out of the floor and the
rim takes none. That is the `0xffaaaaaa` subtractive path, taken when render
flag `DAT_00e4d96c & 4` is set; the other draws it as a flat black disc at
alpha 0x88. The port uses the subtractive one. The floor height is `+0xe`
of the record, a ground ray at load, and the engine stores 0x7fff when the
floor is more than 0x1800 level units down.

A record with an id of 0x30 or more is a **mesh**, the level object itself,
and tumbles: its three rotation angles advance by `10`, `((i >> 2 & 3) * 3
+ 7) * 2` and `((i & 7) + 4) * 2` per tick, with `i` the record's index,
so every token turns at its own rate. Taking a power-up scales its object
to nothing (`FUN_004ccb20(id, 0, 0, 0)`) and restores the previous one.

A second list, `DAT_00559d5c` (twelve-byte x, y, z records snapped to the
floor at load), is drawn with sprite 30, the red signpost, camera-facing,
150 x 250 level units with its base 250 above the point; near, unoccluded
ones are collected into `DAT_005d2a94`. What these points mark is not
settled; level.dat's markers all carry kind 16 and are the coins, so this
list comes from elsewhere.

## The effects' draw side (`FUN_00445980`)

For the effect port (NEXT_SESSION.txt): each live 0x3c-byte effect record
(live: the i16 at +0x24 and the sprite byte at +0x2c both nonzero) draws its
sprite `+0x2c` at frame `+0x31`, at its position (+0, +4, +8, game units
times 1/32), width and height the i16s at +0x26 and +0x28, rotation the
i16 at +0x34 times 16, colour the bytes at +0x38. The u16 at +0x32 is its
mode word: bits 5..6 the blend as above (alpha 0x40 for mode 0), bit 4
lays it flat instead of camera-facing, and its high byte is the fade, which
the draw raises by 2 every frame. That is the whole draw; the thirteen
template bytes are what is still open.

## The level's sprite records

`DatSprite` (docs/FORMATS.md) is decoded with its draw semantics from the
PSX build: each node's cards are camera-facing when the placement's flag
bit 0 is clear (x stretched by 1.6) and yaw-only upright when set; the
card's mode gives texture slot and blend. They are chandelier flames and
the like. The PC build never draws them, because pconv baked them into the
`.ngn`, so drawing them in the browser is a choice: they are the PSX look.

## What is built

**Coins and the HUD are in** (2026-09-06). `src/formats/sprite-table.ts`
reads the table, `src/render/world-sprites.ts` draws camera-facing and flat
cards, `src/render/hud-draw.ts` paints the overlay and `src/sim/hud.ts`
holds the timers and slide phases. Checked in the browser: the coin spins
and fades with its shadow on the floor under it, and the lives, health,
coin, spin-charge and laser elements slide in, count and blink.

Two things about the port worth knowing. Buzz's spin counter runs -240..0
over the whole charged spin where the engine's runs -120..0 over the dizzy
tail, so the bar's recovery sliver only appears over the last 120 ticks.
And the ammo counters are wired to pickup categories 6, 7 and 10, which no
level 1 object uses, so those two elements have not been seen on screen.

**The talk box is in too**, panel and font, replacing the HTML overlay it
used to be. The colour modulate is exact: each sheet is multiplied by a
draw's colour once and the result kept, because a canvas cannot multiply per
channel while blitting and the highlight is exactly a channel being killed.

**Pickups other than coins are the level's own objects**, and the level
mesh always drew them — including the ones that should not be there. A
collected battery stayed on its shelf and all ten token objects, the five
real ones and the five spares, were visible from the moment a level loaded.
The geometry builder now takes a set of object indices to keep in draw
groups of their own instead of merging them into their material's bucket
(`GeometryOptions.separate`), and the viewer hides a group whose object is
hidden. The reflection overlay is filtered the same way, by rebuilding its
draw ranges, since it shares one material across every reflective group and
cannot be hidden a group at a time. The stand-in octahedra are gone: there
was never anything to stand in for.

**They tumble too.** An uncollected class object turns on all three axes
while it is near enough to draw, its angles advancing by 10,
`((i >> 2 & 3) * 3 + 7) * 2` and `((i & 7) + 4) * 2` a tick with `i` the
record's index, so no two turn together. The level is one shared vertex
buffer with no per-object transform, so a turn rewrites the object's own
vertices: the rotation already baked into them is undone and the new one put
in its place, about the object's origin, which is why the group carries both
its origin and the angles it was built at. `tools/object-turn.ts` measures
that against the alternative — rebuilding the whole level with the object
placed at the new angle — over every level and a spread of angles, and the
two agree to within 7e-6 renderer units. Only the ranges that moved are
uploaded, so a spinning token does not cost a hundred thousand vertices a
frame.

Left to build:

1. **The pause menu and the token screen**, which the HUD function also
   draws and which are not written up here.
2. The level's sprite records, if the PSX look is wanted.
3. Letterboxing the view to 4:3, which is the aspect note above.
