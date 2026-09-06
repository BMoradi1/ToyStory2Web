# Level scripts, read from toy2.exe

Each level's logic is ordinary C compiled into the executable, not data. This
is what it looks like and where it lives, so the behaviour can be ported
level by level rather than guessed.

Ghidra's first pass never found this code: it is reached only through two
jump-table switches, and those were left undefined. `tools/ghidra/README.md`
explains how the functions were defined; addresses below are in the PC
executable.

## Dispatch

Two switches on the level number, both jump tables:

| function | called from | does |
|---|---|---|
| `FUN_004a1a50(level)` | `FUN_00414720`, level start | jumps to the level's **init** |
| `FUN_004a1b00(level)` | `FUN_0049dfe0`, once per tick | jumps to the level's **tick** |

| level | init | tick | level | init | tick |
|---|---|---|---|---|---|
| 1 | `FUN_004171d0` | `FUN_00417680` | 9 | `FUN_00424390` | `FUN_00424490` |
| 2 | `FUN_00418e50` | `FUN_004190c0` | 10 | `FUN_00425b60` | `FUN_00425f60` |
| 3 | `FUN_0041a8a0` | `FUN_0041aa10` | 11 | `FUN_00429d70` | `FUN_0042a130` |
| 4 | `FUN_0041c190` | `FUN_0041c640` | 12 | `FUN_0042b300` | `FUN_0042b3a0` |
| 5 | `FUN_0041e390` | `FUN_0041e880` | 13 | `FUN_0042c930` | `FUN_0042ca60` |
| 6 | `FUN_0041ffb0` | `FUN_00420060` | 14 | `FUN_0042e600` | `FUN_0042e790` |
| 7 | `FUN_00421090` | `FUN_00421340` | 15 | `FUN_0042faa0` | `FUN_0042fc50` |
| 8 | `FUN_00423020` | `FUN_00423200` | 16, 17 | `FUN_00430930/50` | `FUN_00430940/60` |

Cases 16 and 17 are the front end, not levels. The level number is
`DAT_0088278c`; which scene file a number plays in is in
`src/sim/level-data.ts` (`sceneForLevel`).

A level's tick is written **per visibility zone**: it tests the player's
current zone (`DAT_0054dea0`) and runs that zone's block — the race exists
only while you are in the garage, the sheep hunt only in the garden. Level 1's
tick is 4 KB and every other level's is the same shape.

## What an init does

Level 1's, `FUN_004171d0`, in order:

1. `FUN_004a0c80(tokenList, 0x48)` — hide the five tokens and their spares
   (docs/PLAYER.md, "Tokens start hidden").
2. `FUN_004025c0(table)` — load the level's **hint signs**: up to ten
   records of `{objectId, pathTag, textPtr, playerYaw}` ending at a
   negative id (see "Hint signs and the talk box" below). Seven levels have
   one; level 2's is missing its terminator.
3. `FUN_004a0db0(3, 1)` — **reveal slot 3 quietly**. The puzzle token is
   collectable from the start; the puzzle is getting to it.
4. `FUN_004335d0(table)` — load the level's **push blocks**: triples of
   `(sceneObject, collisionObject, pathTag)`, the crates Buzz shoves along a
   path in `level.dat` (see "Push blocks" below). Eight levels have a table;
   the rest pass 0.
5. Zero the level's own state variables (`DAT_0052f4f4..0052f5d0`), then read
   the start positions of objects 6, 9, 0x11, 0x12, 0xa and 0x10 through
   `FUN_004ccef0(id, &out)` — the same id space as the tokens.
6. `FUN_004ccb20(0x15, 0, 0x1000, 0x1000)` flattens object 0x15 (the cosmic
   shield door?), `FUN_004ccff0(0x16, 0x15)` attaches 0x16 to it, and
   `FUN_004878d0(8)`, `FUN_004878d0(0xe)` detach two creatures.

Every non-boss init has steps 1 and 3 except level 4's, whose slot 3 is
revealed by its tick instead (the paint-mixing puzzle). Boss levels call
`FUN_004a0c80(0, 0)`.

## The five token slots mean the same thing on every level

The slot order is the order of each level's list in the executable, and the
hint NPC (`FUN_004a1e60`) reads a five-string table in that same order to
tell you what is left. Reading those tables for all ten non-boss levels, and
the code that reveals each slot:

| slot | task | revealed by |
|---|---|---|
| 0 | **Hamm's coins** — talk to Hamm holding 50 or more | `FUN_004a1ce0(hamm, …, slot 0)` → dialogue → `FUN_00402a10` |
| 1 | **Find five** — return five lost things to their owner | the owner's dialogue with slot 1 as its last argument |
| 2 | **Challenge** — a race or timed course set by a character | the level tick, `FUN_004a0db0(2, 0)` |
| 3 | **Puzzle token** — reach a token placed behind an obstacle | the init, quietly, or the puzzle's own code |
| 4 | **Boss** | the boss creature's code, `FUN_004a0db0(4, 0)` |

Per level, in slot order (object ids from `TOKEN_LISTS`; tasks paraphrased
from the hint text):

| level | 0 Hamm | 1 find five | 2 challenge | 3 puzzle | 4 boss |
|---|---|---|---|---|---|
| 1 Andy's house | 0x39, living-room sofa | 0x3a, Bo Peep's sheep | 0x3b, R.C. race in the garage, 3 laps | 0x3c, behind boxes on the basement shelf | 0x30, tin robot in the attic |
| 2 Andy's garden | 0x33, first branch of the tree | 0x31, Sarge's troops | 0x32, R.C. race round the garden | 0x30, over the pool via the rubber duck | 0x34, kite boss up the tree |
| 4 Construction yard | 0x60, wheelbarrow | 0x62, foreman's workers | 0x64, Slinky's challenge | 0x61, paint-mixing puzzle in the trailer | 0x63, jackhammer boss |
| 5 Alleys and gullies | 0x59, market umbrella | 0x57, mother duck's ducklings | 0x56, Slinky, gully island | 0x58, market table by balloon | 0x55, clown-top boss on the roof |
| 7 Al's Toy Barn | 0x31, office table | 0x33, chicken's chicks | 0x34, rooster's challenges | 0x32, office cabinets, locked drawers | 0x30, dinosaur boss |
| 8 Al's Space Land | 0x31, laser battle zone | 0x33, mothership's aliens | 0x32, flying-saucer race on the zipline course | 0x35, claw machine | 0x34, Buzz buggy boss |
| 10 Elevator hop | 0x6b, electrical room | 0x6c, mother mouse's mice | 0x6e, father mouse's challenge | 0x6a, wire puzzle activates the elevators | 0x6d, spider boss |
| 11 Al's penthouse | 0x60, bathroom via a vent | 0x62, Jessie's critters | 0x63, Bullseye's challenge | 0x64, train puzzle | 0x61, gunslinger boss |
| 13 Airport infiltration | 0x31, x-ray room shelf | 0x32, pilot's passengers | 0x34, Rocky Gibraltar's challenge | 0x30, broken plane, needs hover boots | 0x33, prospector boss |
| 14 Tarmac trouble | 0x77, zone 5 | 0x76, airport tike's luggage | 0x75, Slinky, central pole | 0x74, helicopter, lights puzzle | 0x73, blacksmith boss |

Levels 3, 6, 9, 12 and 15 are boss arenas with no tokens of their own.

## Shared task helpers

The tasks are built from a handful of engine routines the level ticks call
with a creature index (`DAT_0052c840 + i * 0x9c`, the entity array) and a
token slot:

- `FUN_004a1ce0(creature, anim, x, y, slot)` — **Hamm**. When the player
  talks to him (entity flag `0x200`), if `coins > 0x31` play the "here is
  your token" line and mark slot 0 done; otherwise the "bring me fifty" line.
  Idle chatter every `0xf0 + 2·rand` ticks while he is near (flag 2).
- `FUN_004a1e60(creature, anim, hints)` — the **hint NPC**. On talk, picks the
  next slot whose bit in `(&DAT_0052f0d7)[level]` is clear and says
  `hints[slot]`; with all five bits set says the "you have all the tokens"
  line.
- `FUN_004a2480(creature, anim, askText, thanksText, explainText, x, y)` —
  **Mr Potato Head**. `DAT_00830d48` counts his found part (negative while
  carried): on talk with it he hands over the power-up for this level
  (`(&DAT_00503a23)[level * 2]`, ORed into `DAT_0052f2d8`) and re-shows the
  category-9 objects with `FUN_0044f840(9, …)`.
- `FUN_004027f0(creature, pathTag, text, playerYaw, creatureYaw, slot)` —
  **dialogue**. Puts Buzz on node 0 of the path and the creature on node 1,
  faces them (yaw -1 means "at each other", computed from the two nodes),
  flies the camera along the rest of the path and opens the text box — the
  whole mechanism is "Hint signs and the talk box" below. The last argument
  is the slot to reveal when the box closes (`FUN_00402a10` calls
  `FUN_004a0db0(slot, 0)`), or -1. This is how the find-five owners award
  slot 1: level 1's Bo Peep line runs with slot 1 once `DAT_0052b7d8`, the
  sheep count, reaches five.
- `FUN_004020f0(pos, ticks, distance)` and `FUN_00402290(ticks)` — **camera
  cut**. Freeze Buzz (`DAT_0052b816 |= 1`, pad masked to `0x309`), hand the
  camera to the cutscene system (`DAT_0052f340 |= 4`) and hold it for
  `ticks` looking at `pos` (an entity, usually) from `distance` back along
  the line to Buzz, or at Buzz from where the camera already is. Eighteen
  calls, all from level ticks: doors opening, a boss appearing.
- `FUN_0049fab0(n, scripted)` — put out a **sparkle**. The reserved path
  tag 58 lists points that glitter until something happens there (see
  "Reserved path tags"); this consumes point `n` — counted after the push
  block points when `scripted` is 1 — by ending its live effect and marking
  the point spent.
- `FUN_004a26f0(creature, event)` — idle chatter through the sound event
  table.
- `FUN_0049f400(p, q, r)` — the level code's proximity test: true when the
  points are within `r` in 256-game-unit steps. `0x280` (= 640 × 256) is the
  usual trigger reach.

Level 1's race: entering the garage zone with the R.C. car flag `0x200`
opens the challenge dialogue; state `DAT_0052f2f8` steps 1 → 2 → 3 through a
four-quadrant lap counter (`DAT_0052f584`, bits for the garage's x/z
halves), `DAT_0052ad64` counts laps, and at three `FUN_004a0db0(2, 0)`
reveals slot 2 with the camera cut. The car itself is a creature driven by
the shared creature code, so the race is not portable until creatures are.

## Hint signs and the talk box

The six-polygon pickup category (4, "camera trigger" in an earlier pass) is
the **hint sign**: a signpost prop that, when touched, freezes Buzz, flies
the camera along a path and shows a tutorial line in a text box. Level 1 has
nine of them and its table (loaded by init step 2, at `0x4f0ee8`) has nine
records; `tools/level-objects.ts` checks that every level's table ids are
signs.

    record   i32 objectId      the sign's object id (`DatLevel.objectIds`)
             i32 pathTag       path in level.dat: node 0 is where Buzz is
                               stood, nodes 2.. are the camera's flight
             char *text        the hint, a C string in the executable
             i32 playerYaw     Buzz faces this while the box is up

Touching the sign (`FUN_004a0f80` case 4, the record stays live so it can be
read again) calls `FUN_00402610(id)`, which finds the record, then starts a
**talk** with the hint script. The same talk machinery serves the
characters' dialogue (`FUN_004027f0`, the helper above), so both are here.

**The talk state.** `DAT_0050a1f8` is the talk in progress: 1, or `slot + 10`
when a token slot is to be revealed at the end. Starting one sets
`DAT_0052b816 |= 1` (Buzz frozen; `FUN_004011d0` forces his animation to 1,
the controller `FUN_00405860` and the hit reaction skip him), `DAT_0052f340
|= 4` (the camera is driven from here, not the follow camera), masks the
pad to `0x309`, and sets `DAT_0050a140 = 0x40`. It also resets the pushing /
climbing state (`FUN_00433ed0`) when the player is teleported. Then, every
tick before the player update, `FUN_00402a10` runs the script.

**The script.** A list of `i32` words at `DAT_0050a294`; each opcode reads
its operands and continues in the same tick until a wait. Paths are the
level's `DAT_00559c70[tag]` (`u16 count, u16 id, count x {i32 x, y, z}` in
level units; multiplied by 32 here). "Node n" below is `points[n]`.

| word | operands | does |
|---|---|---|
| 0 | tag | select path `tag` (`DAT_0050a0c8`) |
| 1 | who, n | teleport: `who` -1 is Buzz (position = node n, ground ray, velocity and jump state cleared, `FUN_00433ed0`), else creature `who` (entity `DAT_0052c840 + who * 0x9c`, its velocity cleared) |
| 2 | who, yaw | face: Buzz's heading and the follow camera's yaw (`DAT_0052f30e`, `DAT_0052f348`, `DAT_0052f3c8`), or creature `who`'s heading, wanted yaw and placement facing (`yaw >> 4`) |
| 3 | n | the camera's **target node** (`DAT_0050a514`); n < 0 means half way between the eye node and the last node |
| 4 | n | the camera's **eye node** (`DAT_0050a4bc`) |
| 7 | ticks | wait; -1 waits for the flight. When the wait ends the pc skips one extra word, so every 7 in the data is followed by a spare word (8) that is never executed |
| 10 | — | cut the camera to the eye node looking at the target node and start the flight |
| -1 | — | hold: re-executed every tick until the text box closes |

Any other word (5, 6, 8, 9) is not in the jump table and would loop
forever; none occurs. The two scripts in the executable:

    hint (0x4df69c):      1 -1 0   4 2   3 -1   10   7 -1   8 -1
    dialogue (0x4df6cc):  0 tag   1 -1 0   1 who 1   2 -1 yaw   2 who yaw2
                          4 2   3 -1   10   7 -1   8 -1

`FUN_004027f0` writes its arguments into the dialogue script in place
(`tag`, `who`, `yaw`, `yaw2` at `0x4df6d0/e4/f4/700`); `FUN_00402610` uses
the hint script and sets Buzz's yaw itself from the record. So a hint
stands Buzz on node 0 and flies from node 2; a dialogue also stands the
creature on node 1, and with `playerYaw` -1 both yaws come from the nodes:
the creature faces `atan2(node0 - node1)`, Buzz that plus a half turn.

**The flight** (word 10 and the wait). The camera has two cursors on the
same path, the eye on segment `e` and the target on segment `t`, both at
the same fraction of their segments; `DAT_0050a53c` is the distance run
along the target segment in level units and `DAT_0050a1f0` that segment's
length. Speed `DAT_0050a144` starts at 0 and eases toward the length of the
*next* target segment (`DAT_0050a0cc`, 0 on the last), so a segment takes
about 32 ticks whatever its length and the camera slows to a crawl at the
end:

    speed  -= (speed - nextLen) * dt / 16;   speed = max(speed, 0x80)
    run    += speed * dt / 32
    eye    = lerp(node[e], node[e+1], run / len) * 32   (target likewise)

When `run` passes the length: if `t` is the last segment the flight ends
(`DAT_0050a134 = 0`, script continues), else both cursors advance one
segment and the remainder carries over. The camera's own yaw is
`atan2(target - eye)` and its pitch is `-atan2(±dy^2, dx^2 + dz^2)` with
the sign of `dy` — the squares are what the code does (`FUN_00402030`
computes the same pair for the camera cut), so the pitch is flatter than
the true angle. The camera globals it writes are `DAT_0052b7f4/f8/fc` (the
point looked at) and `DAT_0052b800/04/08` (the eye), yaw `DAT_0052b80e`,
pitch `DAT_0052b80c`; the follow camera reads those back when `DAT_0052f340
& 4` clears.

**The text box** (`FUN_00401c30`, ticked from the script tick while
`DAT_0050a518` is set). Opening: `FUN_00401a00` word-wraps the string into
a 15 x 36 buffer at `DAT_0050a298`, breaking at spaces and not counting the
`^` characters, which toggle the highlight — `^stomp^` in a line draws that
word in the second colour. Plays event 0x1d (`TEXTBOX1`). The box scales
open from its centre over 16 ticks (`DAT_0050a4ec` 0 → 0x1000 by `0x100 *
dt`), then reveals one character every two ticks into a two-row, 36-column
window (`DAT_0050a1fc`, 72 x u16: the glyph plus 0x100 while highlighted).
When a row fills, the window scrolls; when both rows have been used the
page is full (`DAT_0050a4c0 = 1`) and waits. Keys, on the pad's
new-press word `DAT_0088279c` against the held word `DAT_00882794`:

    jump  (0x4000)  while revealing: reveal the rest of the page at once
                    page full: clear and continue, event 0x3d (PICKUP1)
                    text done (DAT_0050a4c0 = 2): close, event 0x3e (PICKUP5)
    fire  (0x8000)  close at any time, event 0x3e

Closing scales the box shut the same way (`DAT_0050a4ec = -0x1000`, up to
0), then `DAT_0050a518 = 0` and the next script tick ends the talk: clears
`DAT_0052b816 & 1` and `DAT_0052f340 & 4`, `DAT_0050a140 = 0x40`, event
0x1e (`TEXTBOX2`), sets the jump state to 5 if it was 0 and clears
on-ground (so the jump press that dismissed the box does not launch a
jump), and reveals the token slot if one was given.

Drawing, as the code lays it out and not checked against the real game:
the box `FUN_00401b60(x, y, w, h, 0x80, 0, 0)` is a 2-pixel black frame
around a half-transparent red fill, in the sprite layer's 512 x 256 space,
centred on (257, 44): full size is 474 x 32 at (20, 28), and while opening
`w = 0x1da * t >> 12`, `h = 32 * t >> 12`, min 4 x 2. Text glyphs
(`FUN_0049b630`, font sprite 0x14 at half scale) are in a 320 x 240 space:
36 columns 8 apart from x = 16, rows at y = 32 and 40, colour (0x80, 0x80,
0) or (0, 0x80, 0) for highlighted words with 0x80 the neutral modulate;
"press jump to continue" is centred at y = 48 in white while a page waits.
The lower-case font maps `a..z` to frames 0..25, digits to `c - 0x16`, and
a few punctuation marks by table; `~` and `@` draw icon sprite 0x26.

## Push blocks

`FUN_004335d0(table)` (init step 4) loads up to ten push blocks; each is a
prop Buzz can shove along a path, with a drop at the end of the path in
most of them. Levels 1 (seven blocks), 2, 4, 5, 7, 8, 11 and 13 have
tables, in `src/sim/level-data.ts` as `PUSH_BLOCKS`. Level 1's paths are
straight two-node pushes, an L (tag 0) and two edge drops (tags 3, 4).

    table entry   i16 sceneObject      .ngn scene object moved with the block
                                       (`FUN_004cce30`), -2 for none
                  i16 collisionObject  the dynamic collision group in
                                       TERRAIN.ALL whose entry carries this
                                       number + 1 at +0x1a (docs/FORMATS.md);
                                       moved with the block (`FUN_00488510`)
                  i16 pathTag          the rail; segment 0 runs node 0 -> 1
                  ended by -1

`tools/level-objects.ts` checks every table entry against its scene: the
path exists and the numbered group exists, on all eight levels.

    block state   (40 bytes each at DAT_0053c680, count DAT_0053c65c)
      +0x00 i32 x, y, z     game units
      +0x0c i32 dirX, dirZ  unit vector of the segment, 0x1000 = 1
      +0x14 i16 fallSpeed   nonzero while dropping
      +0x16 i16 tipPoint    distance along the segment at which the block
                            tips over an edge: half the segment length when
                            the segment after next is vertical, else 0;
                            -1 while tipping
      +0x18 i16 run         distance pushed along the segment, level units
      +0x1a i16 segLen      the segment's length, level units
      +0x1c i16 segYaw      atan2 of the segment
      +0x1e i16 seg         current segment
      +0x20 i16 floorSeg    lowest segment it can be pulled back to
      +0x22 i16 pathTag, +0x24 collisionObject, +0x26 sceneObject

`FUN_004334d0(tag, block)` fills the segment fields from `seg`. Init places
each block at node 0 of segment 0 — except that on level 12 (index 0xb) a
block on tag 0x1d starts on segment 2.

**Pushing** (`FUN_00433700(player)`, ticked from the controller). While
Buzz holds a direction (`DAT_0052ad88 & 0xf0`) with no other move active
(`DAT_0053c828 & 0xffdfe == 0`), is on the ground, and no block is held,
every resting block is tested: its collision object's contact flags
(`FUN_00488580(id) & 3 == 1`, Buzz touching its side) give a contact
normal (`FUN_004885a0`), and if Buzz faces within ±0x180 of straight into
it the push starts: `DAT_0053c648 = index + 1`, the push direction
`DAT_0053c624` = normal + half turn, the offset from block to Buzz is
remembered (`DAT_0053c81c/20`, level units), event 0x2d (`BUZPUSH1`) with a
0x28-tick cooldown, and the first forward push spends the block's sparkle
(`FUN_0049fab0(index, 0)`). The push ends when the direction is released
or any other state bit appears (the test at the top clears `DAT_0053c648`).

Each tick while held, if the push direction is within ±8 of `segYaw` the
block runs forward 12 level units per tick, if within ±8 of the reverse it
runs back 12; anything else holds it still. Forward past `segLen` steps to
the next segment (not past the last); back past 0 steps to the previous,
never below `floorSeg`. Level 12's block 0 cannot go forward while its
script variable `DAT_0052fd24` is positive. Buzz is dragged along: his
velocity is set so he keeps the remembered offset, and event 0x2e (a
looping level effect) plays with a puff of dust (`FUN_0040fdf0`, kind 2)
whenever the block moves.

**Tipping.** When `run` passes `tipPoint`, the push ends (`DAT_0053c648 =
0`, Buzz's velocity zeroed and held at zero for 10 ticks by
`DAT_0053c5dc`), event 0x31 (`BUZCLIMB`, reused) plays, and the block
slides the rest of its segment on its own at 24 units per tick. At the end
it skips the vertical segment (`seg += 2`), starts falling (`fallSpeed =
2`), and falls at 64 game units per tick squared, capped at 0x800 per tick,
until `y` reaches the new segment's start node; then it lands there, event
0x2f (`BOXFALL`), `floorSeg = seg`, and can be pushed on. A path that ends
with its drop (tag 4 on level 1: edge, then the floor below) leaves the
block at rest on its last node.

Positions: `x = node[seg].x * 32 + (dirX * run >> 7) & ~0x1f` and z
likewise, so the block moves in 32-unit steps; y is the segment's start
node while pushing. Both the scene object and the collision object are
moved every tick the block moves.

## Reserved path tags

Paths in `level.dat` with tags 58..63 are lists, not rails; the loader
stores their pointers at `DAT_00559c70[tag]` like any other path and
`FUN_00414550` scales them by 32 at level start.

- **58 — sparkle points**, decoded. `[push points ...] (0,0,0) [scripted
  points ...]`: a point above the start of push block `i` at index `i`, a
  zero separator, then the points the level script consumes with
  `FUN_0049fab0(n, 1)`. The zero is compacted out and its index kept as the
  split (`DAT_00830e28`). Every tick `FUN_0049fb40` spawns effect kind 0x71
  (before the split) or 0x73 (after) with emitter template 2 at every
  unspent point within 600 x 256 game units of the camera, staggered four
  points per tick — the glitter that marks a secret. The push code indexes
  the list by block number without checking the split: levels 1, 2, 4, 5,
  7, 11 and 13 have exactly one point per block, but level 8 has two for
  three blocks, so its third block's first push spends scripted point 0
  (the kind test fails to find a live effect, and the point is marked spent
  regardless).
- **59** is read by `FUN_004038e0`, the laser-targeting view (`DAT_0050a13c`
  states 3..5, `GENBEEP2` on entry) — not decoded.
- **60** is triples of points; **61** pairs of vertically aligned points
  with sentinel nodes like `(50, -50, -50)` that set a group value
  (`|x| == |y| == |z|`, value `|x| / 50`); level scripts move nodes of 61
  (level 1 init reads and writes one). Poles and zip lines are the obvious
  candidates, by shape only. **62** and **63** are read by level inits.

## Creatures

Decoded in full on 2026-09-05: see **docs/CREATURES.md** for the placement
record (from the level's `.raw` packet), the entity, the shared update, the
script interpreter, damage and respawn. The level scripts meet creatures in
three places: the helpers above take a creature index into the entity array
at `DAT_0052c840`; the token-task counters (sheep, laps, the tin robot's
death) are written by the per-type C handlers listed in `CREATURE_TYPES`;
and each level's init rebuilds a few entities with the constructor
`FUN_00406cd0(entity, 0)` after setting their placement up by hand.

## Sound events, resolved

`FUN_0049e660(event, pos)` and `FUN_0049ea60(event, pos)` look up the
16-byte record at `0x502950 + event * 16` and call `FUN_004a3c80(pos,
effect - 1, pitch, volume, pos, 0)`, which adds the one back before
`FUN_0047de50(effect, …)`. So the effect field is **1-based**, and the earlier
"off by one" was the caller's own `- 1`:

    i16 effect     1..61: the global name table at 0x4fcdc4
                   87..:  this level's own table, PTR_PTR_004fd140[level * 2],
                          whose base index is DAT_004fd144[level * 2] = 87
    i16 pitch      5120 on most records; scale unknown
    i16 volume     0..150 after clamping; distance-attenuated when the play
                   call asks for it: (0xc0 - dist) * 16 / 24
    i16 volume2    a second channel level, usually 0
    i16 priority   2, 3, 4 or -1
    i16 x 3        falloff parameters, e.g. (10, 10, 120)

Per-level names come from `data/sfx/<name>.wav` too, and `FUN_0047ec20`
loads the global table then the level's at `level` start. Examples: event
0x1c is `SPRNGJMP`, 0x33 `PZZATOKN`, 0x4f `50COINS`, 0x12 `BUZSKID`, and in
level 1 events 0x24/0x25 are `ELECDRIL`/`ELECSAW` and 0x21 `SPADEFAL`. Events
0xb2..0xb5 name effects 78..81, which no table supplies — the characters'
speech, absent on PC.
