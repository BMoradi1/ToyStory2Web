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

A level's tick is written **per visibility zone**: it tests the zone Buzz is
in (`DAT_0054dea0`, the camera's zone — see "Zones" below, and note that five
levels test the player's own `DAT_005d2a8c` as well) and runs that zone's
block — the race exists only while you are in the garage, the sheep hunt
only in the garden. Level 1's tick is 4 KB and every other level's is the
same shape.

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

**The bosses** award slot 4 the same way on every level but the first: the
level's tick watches for the boss creature to be gone — its type is zeroed
when it is removed and does not respawn — then runs a counter from 3 to 0x78
and hands the token over, latching at 200. That condition was read from level
5, whose test is literally "entity 3's type field is zero", and matched on
13. Level 1 is the exception: its tin robot's own handler awards the token
partway through its death animation instead.

Each level's boss is the creature its taunt line names, and all nine resolve
to the creature the table above says: the kite, the jackhammer, the clown,
the dinosaur, the gunslinger, the prospector and the blacksmith.

## Shared task helpers

Ported 2026-09-05 in `src/sim/tasks.ts`, with the per-level table in
`src/sim/level-data.ts` (`LEVEL_TASKS`, level 1 read out of its tick) and the
dialogue itself in `src/sim/talk.ts`. Hamm's coin gate, the find-five owner
and the hint NPC all work: touching one of them opens the right line, and a
line with a slot marks it earned and puts its token in the world.

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

**Races come in two shapes**, and both are ported (2026-09-05,
`src/sim/tasks.ts`). Level 1's is a lap box, below. Level 2's is eight
checkpoints that have to be passed in order, each a two-bit quadrant code
from a table in the executable, the first four measured against one pair of
thresholds and the last four against another, with the lap landing when the
eighth is passed beyond a finish line. Levels 4, 5, 11 and 13 have no race at
all: their slot 2 is a collect-five-objects challenge instead.

**The race is ported** (2026-09-05, `src/sim/tasks.ts`). The laps are
counted on BUZZ's position, not the car's, so it works without the car
driving its route: four bits, one per side of a box, and a lap each time he
leaves across the first bit's edge. The flag starts blocked so the lap in
progress when the challenge is accepted does not count, and coming back in
over the same edge blocks it again, which is what stops laps being scored by
stepping over the line and back. Only level 1's box is read out.

Level 1's race: entering the garage zone with the R.C. car flag `0x200`
opens the challenge dialogue; state `DAT_0052f2f8` steps 1 → 2 → 3 through a
four-quadrant lap counter (`DAT_0052f584`, bits for the garage's x/z
halves), `DAT_0052ad64` counts laps, and at three `FUN_004a0db0(2, 0)`
reveals slot 2 with the camera cut.

**How the car drives** (decoded and ported 2026-09-07, `driveCar` in
src/sim/tasks.ts; walked on level 1: three laps of 45 nodes in about 900
ticks each, and a race left standing is lost when the car finishes; and
on level 2: three laps of 65 nodes in about 70 seconds to the same end). The car's handler (`FUN_00406a60` → level 1
`FUN_00416f30`, level 2 `FUN_00418720`, the same function twice) only
picks its animation from speed and steering, spins the wheel bones and
spawns skid dust; it does not move it. That handler is ported too
(`raceCar` in src/sim/creatures.ts, 2026-09-07; docs/CREATURES.md). The LEVEL TICK does, through the car's own creature entity — slot
0x1d on both levels, at `0x52c840 + 0x1d * 0x9c` = `0x52d9ec` — using the
fields every creature has (docs/CREATURES.md): +0x40 flags, +0x50 HOME,
+0x5c TARGET, +0x7e health.

At the challenge (state 1): `flags |= 4` (script velocity, which is what
lets the mover steer) and `health = 0xca` (always awake), node = 0, car
laps = 0. Every tick while the race is 1 or 2:

    node   = path[tag].points[n]                    level units
    if (car.x/32 - node.x)^2 + (car.z/32 - node.z)^2 < 360000   (600 units)
        home = node                                 +0x50/+0x58, game units
        if carLaps < 3:  n += 1; past the last node: carLaps += 1, n = 0
        else if car.z > finish:  the car has WON — race 2 becomes 3 (lost)
                                 unless Buzz already has three laps; health = 1
    target = path[tag].points[n]                    +0x5c/+0x64, game units

The creature mover then drives it toward `target` at its own accel table.
Level 1: path tag 0x1e, 45 nodes (`n > 0x2c` wraps), finish `z > -0x1a000`.
Level 2: path tag 1, 65 nodes (`n > 0x40` wraps), finish `z > -0x24269`,
and the car is held at `y <= 0x2000` with a dust puff (effect 0x35 in
spawn mode 4, ±0x1000 in x/z) whenever it is pushed back up. Both node
counts match the paths in the two `level.dat`s exactly, which is the
check that this is the right path and the right wrap.

**Timed runs, and the clock they share** (2026-09-05, `src/sim/tasks.ts`).
Several levels' slot 2 is a run against a clock, and they all use the same
three globals. `DAT_0052f2f8` is the run: 0 idle, 1 offered, 2 going, with
the step from 1 to 2 waiting on the talk box to close (`DAT_0050a1f8`).
`DAT_0052ad64` is the clock, and it counts DOWN TO A FLOOR OF 100, which is
what failure is — so a start value of 0x96 leaves 50 to spend, not 150. It
is stepped by `DAT_0052f1cb`, and that is the engine's 1-in-64 frame
divider: `DAT_0052ad63` accumulates the frame step and sets the flag every
time it passes 0x40. At 59 FPS a clock unit is therefore about a second.
`DAT_00830cf0 == 2` is how a run ends in success on most levels; it is a
field of the progress block reached through the pointer at 0x830cf4, it is
never written directly in the listing, and every level that tests it is
asking the same question — has the challenge's token been taken.

**Level 7's egg is the one offered twice.** Talking to the rooster (entity
0x0d, path 8) starts a 0x96 run; talking again while it runs gets the hurry
line and nothing else. The first run ends when the chick (entity 6) is gone,
which the tick reads straight off that entity's type field, and NO reward is
handed over at that moment. It arrives the next time Buzz speaks to him, on
the line that offers a second, quicker 0x7e run — and that line is the one
carrying slot 2. Standing in zone 4 (the camera's zone, `DAT_0054dea0`)
slams the clock to 99, failing the run on the spot; the zone is decoded
below and the rule sits behind `failZone` in `src/sim/level-data.ts`.
While a run is going the chick's flag word gets bits 0x81 (awake and drawn)
forced on, and they are cleared the moment it is not.

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
    i16 pitch      5120 on most records. UNUSED on PC: `FUN_004a3c80` never
                   reads its pitch argument, and the buffer plays at the
                   WAV's own rate (`DAT_00726234`, stored at load). A PSX
                   SPU pitch, most likely, left behind by the port
    i16 volume     0..150 after clamping; distance-attenuated when the play
                   call asks for it (below)
    i16 volume2    a second channel level, usually 0
    i16 priority   2, 3, 4 or -1
    i16 x 3        falloff parameters, e.g. (10, 10, 120)

**The effect word carries two flags**, found while porting this on
2026-09-06 (`FUN_0049e660`, and `src/audio/events.ts`):

- **0x4000: the effect depends on the level.** The low bits are an index into
  a list of `(level, effect)` pairs at 0x5028e8, walked four bytes at a time
  until the level matches. That is how one event number is `ELECDRIL` on one
  level and `Cockerel` on another. The lists do not cover every level — event
  0x6b lists 3, 4, 13, 14 and 15 and not 1 — so the engine's own walk runs
  off the end if a level raises an event it has no entry for. The port stops
  and plays nothing.
- **0x8000: the engine's second play path** (`FUN_004a3810` rather than
  `FUN_004a3b90`), which also passes `volume2` and a falloff number. Forty of
  the 218 records carry it and they are the sustained sounds — the hover
  bot's rotor, the lift loops, the wind. The port keeps one voice per such
  effect rather than starting another each time it is raised.

The index is what is left after masking both flags off, and the table is
**218 records**, not 200: past 0xd9 the bytes belong to a different table
whose records are eight bytes, which reads as plausible rubbish with pitch
values where the effect should be.

Checked across all seventeen tables by `tools/sound-events.ts`: every event
either resolves to a `.wav` the install actually holds, names the dropped
speech block (effects 62..86), or names an effect its own level does not
carry, which is an event that level never raises.

**Attenuation, pan and the slider** (`FUN_004a3c80` → `FUN_0047de50`).
Two point sources, one per ear, rather than a level and a pan — so a sound a
little way to one side is louder than the same sound at the camera, since it
is nearer that ear than either ear is to the middle. Which of the two values
is the LEFT ear was not established: the sideways axis comes from row 0 of
the render camera's matrix and nothing here says which way that points. The
port picks the assignment that puts a sound on the player's left into the
left speaker.
A positional play computes two levels, one per ear, from the sound's
offset to the render camera (`DAT_00555314/18/1c`) in 512-game-unit steps,
turned into camera space by the camera's rotation rows (`DAT_00555334`,
row 0, and `DAT_00555340`, row 2; 12-bit):

    x = row0 . d >> 12            sideways
    z = (row2 . d >> 12) / 2      depth, halved
    L = (0xc0 - sqrt(z^2 + (x + 0x40)^2)) * 16 / 24
    R = (0xc0 - sqrt(z^2 + (x - 0x40)^2)) * 16 / 24     each clamped 0..150

so a sound fades out 192 steps (3072 level units) from the camera and the
ears sit 64 steps apart. A non-positional play uses the record's volume
for both. The DirectSound buffer then gets `SetPan((L - R) * 10000 / 128)`
clamped to ±10000, and `SetVolume(curve[(slider * max(L, R)) >> 8])` where
the slider `DAT_004fcdb0` is the options byte times two and `curve` is the
151-entry 1/100 dB table at `0x4fd668` that the music volume uses too
(NEXT_SESSION.txt, MUSIC). The call returns `(L + R) / 2`, which the
creature code keeps as the event's loudness.

Per-level names come from `data/sfx/<name>.wav` too, and `FUN_0047ec20`
loads the global table then the level's at `level` start. Examples: event
0x1c is `SPRNGJMP`, 0x33 `PZZATOKN`, 0x4f `50COINS`, 0x12 `BUZSKID`, and in
level 1 events 0x24/0x25 are `ELECDRIL`/`ELECSAW` and 0x21 `SPADEFAL`. Events
0xb2..0xb5 name effects 78..81, which no table supplies — the characters'
speech, absent on PC.

## Zones: which room Buzz is in

Decoded 2026-09-06. The renderer's zones — every object's zone from the
`.ngn` scene, the portal quads in `level.dat` — are not what the level
scripts read. They read two globals that the render pass and the camera code
set every frame:

| global | meaning | who tests it |
|---|---|---|
| `DAT_005d2a8c` | the player's zone | levels 7 (helper), 8, 10, 11, 13 |
| `DAT_0054dea0` | the camera's zone, held to the player's neighbourhood | levels 1, 2, 4, 5, 6, 7, 10, 11; the portal walk starts here |

Both come from one lookup over a third set of geometry.

**Zone floors.** In `TERRAIN.ALL` / `TERR1.ALL`, a collision group whose entry
word at +0x28 has bit 0x400 is a zone floor, and the word's low byte is its
zone. They follow the ordinary collision in the group table in ascending
zone order, one or more per zone (91 across the nine scenes that have
portals; boss levels have none), and they are authored at a **quarter of the
level's scale**: level 1's real collision spans about ±23,000 level units, its
zone floors ±6,000. The loader (`FUN_00489980`) copies the word into the
runtime record at +0x2e; `FUN_00489c30` then keeps every flagged group out of
the spatial index and the wall list and puts them in their own list
(`DAT_0072d2b0` from index `DAT_0072848c`, count `DAT_0072848e`), after the
dynamic groups. Nothing ever collides with a zone floor. The port drops them
from `buildCollisionWorld` for the same reason (`CollisionGroup.zone`).

**The lookup**, `FUN_004885c0(point)`, point in game units: divide by four
(that is the quarter scale), then over every zone floor whose x/z bounds
contain the point (0x1000 slack) and every polygon of it whose footprint
does (cell bounds with 0x100 slack, then the exact edge tests, two triangles
for a quad), take the plane's height at the point's x/z and keep the nearest
one **at or below** the point — +Y is down, so the smallest y that is not
less than the point's. Return that floor's zone; -1 when nothing is below.
Ported as `zoneAt` in `src/formats/collision.ts`.

**Every frame**, in this order:

1. The render pass (`FUN_00440f70`) sets BOTH globals to
   `zoneAt(render camera)`, the camera at `DAT_00555314`.
2. `FUN_004402b0`: if that gave -1 — or always on level 2 — the player's
   zone is `zoneAt(player position raised by 0x2000 game units)`, 256 level
   units up his body. Otherwise `FUN_0043fef0` applies the **portal-crossing
   correction**: for each portal out of the player's zone (the adjacency
   table `DAT_0054f39c + zone * 0x20`, pairs of (portal slot, zone it leads
   to) ending in 0xff, filled by the `level.dat` loader `FUN_0043e6e0` from
   the zone quads with their corners `>> 2`), if the player is within 0x4000
   of the quad's first or third corner on every axis (positions `>> 7`, so
   both are in quarter level units), and his position moved from the front of
   the quad's plane (dot with its normal >= 0) to behind it this tick, and the
   crossing point lies in either of the quad's two triangles with 400 units
   of slack (`FUN_00480ae0`), the player's zone becomes the portal's `to`.
   A portal to zone 15 is skipped while `DAT_005d2a90` is set, which
   `FUN_0044ff50` does when the level has a backdrop sheet (sprite sheets
   0x24, 0x28-0x2f or 0x58 up): 15 is "outside" everywhere but level 10,
   where it is a room. The previous position for the test is last tick's
   raised position (`DAT_0054d920/24/28`).
   In effect the player's zone is the camera floor's zone, corrected on the
   one tick Buzz walks through a doorway.
3. The camera's zone: `c = zoneAt(camera)` again; it becomes `c` if `c` is
   the player's zone or the camera-blend counter `DAT_0050a148` is running;
   the player's zone if `c` is -1, the player's zone is -1, or the player's
   zone has no portals; otherwise `c` if a portal out of the player's zone
   leads to `c`, else the player's zone. A result of 0xff becomes 1. This is
   the zone the portal walk starts from.
4. Per-level overrides in the render pass, on the level number
   `DAT_0088278c`, with the Direct3D camera in level units (game / 32,
   `_DAT_00e4d980/84/88`): level 4 — player zone 2 with the camera above
   -7,900 makes all of them zone 1; level 10 — camera zone 4 with the camera
   inside x in (-800, 800), y below -40,800, z in (-5,500, -3,900) makes the
   camera's zone 5. Ported 2026-09-07 (`overrideZones`, src/sim/zones.ts;
   the floats are at 0x4dc03c). Level 2's height bands only touch the
   portal walk's start; levels 3, 9, 4 and 11 lifting the draw distance are
   the detail-row forcing in docs/FORMATS.md.

**Validation** (`tools/zone-validate.ts`, every scene with portals): the set
of zones the floors name equals the set the portals join on all nine scenes;
and probing `zoneAt` 150 level units either side of each of the 204 portal
quads finds the two joined zones on both sides of 173, one of them or a
neighbouring room on 26 (the slabs are hand-laid and overlap or stop short
at some doorways), nothing below on 5, and a room the doorway does not
connect to on none. Level 1's interior has zone 2's slab ending 230 units
before a doorway zone 6's slab covers, so the engine calls that strip zone
6; the validator accepts neighbours for that reason.

**What each level's tick tests**, for the port (`DAT_0054dea0` = camera
zone, `DAT_005d2a8c` = player zone):

| level | camera zone | player zone |
|---|---|---|
| 1 `FUN_00417680` | blocks for 1, 2, 3, 4, 5, 6; the race wants not 2 | |
| 2 `FUN_004190c0` | 1 | |
| 4 helper `FUN_0041ddb0` | 2 | |
| 5 `FUN_0041e880` | 2, twice (the second beside `DAT_0052f38e`) | |
| 6 helpers `FUN_00420a30/af0` | 1, 6, 7 or 8; 4 three times | |
| 7 `FUN_00421340` | 4 (the egg run's fail, and the test beside `DAT_0052f38e` and `y < -0x63b`) | helper `FUN_00422660`: 5 |
| 8 `FUN_00423200` | | 4; 2 with `x < 0x1b467`; 5 with `y >= -0x27a7f` |
| 10 `FUN_00425f60` | helper `FUN_004282d0`: 2 | 7 or 12; helper `FUN_004295b0(zone)` compares its argument |
| 11 `FUN_0042a130` | not 1, 4 or 8; 2 (a countdown); not 4 | 1; 5; 4 (a countdown) |
| 13 `FUN_0042ca60` | | 2, 4 or 5; 4; 3 twice |

The port's `stepTasks` currently takes one `zone`; it should take both, and
the boss taunts that were gated by level 1's height band should move to
their level's zone test above.

## What starts a boss fight

Decoded 2026-09-06. Nine of the ten non-boss levels carry a mini-boss in
slot 4 (level 8 has none). Each idles in a closed script loop until its
taunt has been seen; the level's tick opens that taunt through the same
`FUN_004027f0(creature, pathTag, text, playerYaw, creatureYaw, slot)` the
hint NPCs use, and once the box closes it kicks the script to `wakeWord`
and sets the chase flag. Every taunt's text begins "ha ha ha ha, defeat
the...", which is what makes them findable in the ticks.

What differs is only the trigger, and no two levels use the same set. All
are in `src/sim/level-data.ts` under `boss.taunt`:

| level | boss | tag | trigger |
|---|---|---|---|
| 1 | 8 tin robot | 0x1a | grounded, height band |
| 2 | 0x1a Zurg | 9 | grounded, `y < -0x72000`, x/z box |
| 4 | 0x18 jack | 0x22 | grounded, `y < -0x9bfc5`, within 300 of a point |
| 5 | 3 clown | 0xd | grounded, camera zone 2 |
| 7 | 0 dino | 5 | grounded, `y >= -0x63b`, camera zone 4 |
| 10 | 8 spider | 0x1f | grounded, height band |
| 11 | 0xb gunslinger | 0x10 | `y < 0x1f448`, x/z box |
| 13 | 0x20 prospector | 0x20 | grounded, `y < -0x3660e`, within 300 of a point |
| 14 | 0x2e blacksmith | 1 | within 300 of a point |

`FUN_0049f400(a, b, r)` is a distance test in steps of 256 game units, so
a radius of 300 is 2,400 level units; `FUN_0049f460(p, xMin, xMax, zMin,
zMax)` is a plain x/z box. `wakeWord` is 14 everywhere except level 1 (10)
and level 4 (12).

**One thing is not the original's.** The three "within 300 of a point"
levels measure to a fixed point that lives in `.bss` — zero in the image
and written at run time by something the decompile does not show. The
port measures to the boss's own placement instead, which has to be inside
that radius of wherever the point is.

Walked in the browser: the taunt fires on levels 2, 4, 5, 7, 11, 13 and 14
by standing in each trigger, and level 1's already did. Level 10's band
was not walked — its arena is up a shaft Buzz falls past when placed by
hand — but the band brackets that boss's own height.

## The portal walk

Decoded and ported 2026-09-07 (`FUN_0043f3d0`, called once a frame from
`FUN_004402b0`; `src/sim/portal-walk.ts`). This is how the engine decides
which rooms to draw, and it is a real portal walk rather than the fixed
one-step neighbourhood `reachableZones` takes.

Start in the camera's room with the whole screen available. For each
doorway out of it, project the doorway's four corners; if the projected
quad still overlaps the rectangle you hold, the room beyond is visible,
and you recurse into it with the rectangle narrowed to that quad's
bounding box. A room nothing projects into is never drawn. The recursion
carries a budget that starts at 254 and falls by one a step, and a room
is re-entered only when reached with a HIGHER budget, that is by a
shorter path.

Everything happens in a 512 x 256 rectangle space with the eye at
(256, 128) and a focal length of 160, so `x * 160 / z + 256` and
`y * 160 / z + 128`, +Y down. The picture itself is only the middle of
that space, x 96..416 and y 8..248; the margins exist so a corner behind
the camera can be pinned outside the picture without overflowing a signed
short. A corner nearer than z = 11 is clipped along its quad edge to
whichever neighbour is further away, the crossing taken at the eye plane,
and then pinned to the side of the space it went off. Two counters ride
along: eight per corner behind the eye, so 32 means all four and the room
is dropped, and one per pinned corner whose crossing landed within 512
units of the view axis. `FUN_00451f80`, a signed area over the projected
quad's two triangles, rejects the doorways facing away unless a corner
was pinned.

Three quirks of the original, all reproduced:

- A room reached twice keeps the rectangle of the shorter path, not the
  union of the two. Portal engines usually union; this one does not.
- A later doorway in a room's list that misses the rectangle CLEARS a room
  an earlier doorway had already made visible, so the outcome depends on
  the order the doorways sit in the file.
- The pinned-corner counter is tested as `count & 3`, and four pinned
  corners come to 4, whose low two bits are clear. So the widest case
  narrows where three pinned corners would have fallen back to the parent
  rectangle.

Level 7 holds its zone 15 out of the walk: it is recorded as visible and
the backdrop is drawn through its rectangles instead of the room being
entered.

**Validation** (`tools/portal-walk-validate.ts`, every scene with
doorways): all 204 doorways that lead to a real room fire the crossing
test exactly once when walked through a tick at a time, and 2,584 camera
placements over the zone floors all returned the camera's own room and
room 0 and never named a room the doorway graph cannot reach.

**What it is not yet used for.** Drawing. Comparing the frame with and
without the culling at 24 camera placements a level, 17 of 24 on level 1,
14 of 24 on level 2 and 21 of 24 on level 13 come out pixel for pixel
identical, and the rest lose between a few dozen pixels and 2.8% of the
frame. Play therefore draws every room and `ts2.zoneCulling(true)` turns
the walk on to look at it.

**Why that is, is not settled.** The first guess was the object-to-room
labels, since they came from matching `.ngn` instances to `level.dat`
objects by position. That guess is wrong — and since 2026-09-07 the room
comes straight out of `level.dat`'s own object list (docs/FORMATS.md
"level.dat, from the loader"), which changes the measurement not at all:
20 of 24 placements clean on level 1 and 14 of 24 on level 10. The check
that killed the guess is still worth keeping: `tools/zone-assign-validate.ts` compares each object's
label with the zone floor beneath it, and on level 1 the 22 objects whose
label names a room the floor's room does not even join all sit at
positions where every `.ngn` instance agrees on the room. There was no
ambiguity for the matching to resolve, so those labels are certain — the
engine's own — and it is the floor slab beneath that belongs to a
neighbour. Level 2, whose raw disagreement looks worst at 71.9%, has zero
objects in that column once the always-drawn room 0 and the
joined-by-a-doorway boundary cases are separated out.

The rooms and the zone floors are simply two different partitions: a
room's geometry runs out to its walls while its floor slab only has to
cover where the camera and Buzz can stand, and on level 1 five rooms'
geometry reaches 1,800 to 4,300 level units beyond their slab.

**Where the losses do come from.** Drawing every room the doorway graph
connects, with no rectangle narrowing at all, is pixel for pixel
identical at 24 of 24 placements on level 2 and 21 of 24 on level 1 — and
the three that differ there are the case the paragraph below describes,
the camera's room and Buzz's disagreeing, which the walk itself handles
and a bare graph walk does not. So connectivity covers everything that is
on screen, and what the walk loses it loses in the NARROWING: a doorway
rejected as facing away, or as missing the rectangle it was given, or
with every corner behind the eye. Averaged over a frame that is 700
pixels on level 1 and 2,160 on level 2, under a quarter of one per cent.
The likeliest cause is that the narrowing was tuned against the original's
camera and field of view, and the port has neither exactly; the two
quirks above make the walk sensitive to both.

One more thing the walk needs that the engine does not. The engine seeds
Buzz's room and the camera's from the same lookup, so the room he stands
in is always the room the walk starts from. The port's follow camera is
its own reconstruction, and where it drifts over a neighbouring room's
floor slab the walk would start next door and cull the room Buzz is
actually in — 80% of the frame, in the worst case measured. The walk
therefore also takes the floor under his feet (`ZoneState.floor`, not an
engine global) and keeps that room on screen.

## The world boss

Decoded and ported 2026-09-07 from level 6's `FUN_0041ffb0` (init) and
`FUN_00420060` (tick), the first of the five boss levels. A boss level has
no errands: its tick is the fight and nothing else, which is why
`LEVEL_TASKS[6]` carries only a `bossFight` and `stepTasks` hands the
whole level to `stepBossFight` and returns.

**Which levels.** The engine's own test is `level % 3 == 0`, so internal
levels 3, 6, 9, 12 and 15. Note that internal 6 is the THIRD level played
and internal 3 the sixth, because the level-select order swaps the first
two worlds' bosses (docs/FORMATS.md, "The save file"). So level 6 is the
first boss a player meets.

**The init** turns the boss to heading 0xc00, sets flag 0x800, pushes it
0x80000 along x so it starts off-stage, and opens its home box to
0x1000 either way so the fight can range over the whole garden.

**Five phases** (`DAT_0052f9a4`):

| phase | what happens |
|---|---|
| 0 | waiting. Buzz walking in past x 0x31f9e starts it |
| 1 | the entrance: it flies in at 0x800 a tick along x, banking out of a sine sweep, and 30 ticks before the end gains the script-velocity flag so the creature mover takes it over |
| 2 | the fight |
| 3 | dying: it sinks 0x280 a tick until the cut runs out, and the level is won |
| 4 | over |

**The fight** runs on a lap clock, 300 ticks for the first lap and 600
after. For the part of a lap above 0x12d it chases, putting its target on
Buzz at height -0x10b13; below that it charges, driving its target to
±0x40000 along x at its home height plus 0x4000, and the sign flips every
lap. Above 0x226 on the clock it also roars, shouts every 400 ticks, and
throws dust off both feet — points 0x80 either side of its heading, four
sine units out, dropped to whatever ground is under them.

Its flight height is bent by how far it has strayed: a counter runs 0 to
0x800 at 0x80 a tick while the boss is outside the arena box (x -233135
to 233647, z -139166 to 139166) and back down inside it, and the cosine
of that counter, tripled, is added to whichever height it wants.

**Being hit** is noticed by watching the health rather than by being told.
Any change closes the shell (`vulnerable` 4, the trick the tin robot uses
too), restarts the lap clock and stuns it for 0x78 ticks, and the stun
ends by opening the shell again to 7. A hit that takes it under 11 health
instead stuns it for 300, moves it to phase 3, and **writes bit 7 of that
level's token byte in the save** — which is the bit the save decode found
set on every level of a played file and could not account for. The health
bar is `(health - 10) * 0x36 / 10`, its own formula and not the tin
robot's.

**The camera cuts** are ported too (docs/CAMERA.md "Cuts"): the fight
opens with a 300-tick cut whose eye starts 0x48000 back along x and
0x8000 up from the boss and pans up through the entrance, along x for its
first 180 ticks and along z after, looking at the boss as it flies in;
every hit is a 120-tick cut to the boss; and the death is a 300-tick cut
from right over it, rising as it sinks.

**Not ported.** The hurt flicker, which scales the model through two
fields the port does not carry, and the roll it takes while dying
(+0x0c). Sequences, so the shout is silent.

**Walked end to end on level 6.** Buzz crossing the trigger starts the
entrance; the boss flies in from x 525,920 to -93,512 and the fight
begins; a hit takes it from 20 health to 18, closes the shell to 4 and
stuns it for about 107 ticks, after which the shell reopens; it then
chases and charges across the garden; and taking it to 10 health starts
the death, sinks it, wins the level and puts 0x80 in the save's level 6
token byte. The boss bar and the boss theme both come up with the fight.

## The Slime, internal level 3 — DECODED, not ported

Decoded 2026-09-07 from `FUN_0041a8a0` (init) and `FUN_0041aa10` (tick),
the sixth level played and world 2's boss. Scene `level03/level`, one
creature, type 16 SLIME on AI script 14, placed with 99 health and speed
64. This is a different kind of fight from level 6's and needs four
things the port does not have yet, listed at the end; the numbers here
are the whole of it.

**The idea.** The slime is a blob whose SIZE is its health. Two numbers
carry it: the size it is trying to be, `DAT_0052f75c`, and the size it
grows back to, `DAT_0052f6f0`, both 0x1000 at the start; a third,
`DAT_0052f704`, is the eased actual size (an eighth of the gap a tick,
a thirty-second during the entrance). The health bar reads
`((0x3800 - goal) >> 11) * 0x36 / 5`, so it has five stages, and the
creature's own health word is never allowed to fall: every hit is noticed
by comparing it with the value saved at init (`DAT_0052f730`) and
putting it straight back.

**Init.** The boss faces 0x800 (heading and `wantYaw`), is moved
0x10000 along z, gets flag 0x800, hit radius 1000 (+0x2a), the draw
triple +0x24/26/28 at 0x2000, and its `+0x8a` timer cleared. The level's
packet word at `DAT_00559d6c + 8` is saved and replaced with 0x80000000
(a plane the level draws, put out of reach until the fourth stage).
Scene object 0 is placed at the boss, 11,000 under it (`FUN_004cce30`
moves a `.ngn` scene object, level units), scene object 0x32 is scaled
to nothing and object 0 to (5000, 5000, 5000) (`FUN_004ccb20` scales
one; `FUN_004ccc70` / `FUN_004ccce0` turn one, `FUN_004ccef0` reads one's
position). Where "light" appears below, read "scene object".

**Every tick**, in order:

1. Sounds 0x6f (with a "1", sustained) and 0x67 (the arena hum). A
   150-tick timer from init (`DAT_0052f718`) plays voice sequence 0xd2
   once when it expires. Three wobble phases advance: `DAT_0052f748` by
   0x1f, `DAT_0052f74c` by 0x3f, `DAT_0052f750` not at all.
2. **Trigger** (`DAT_0052f754` 0 -> 1): Buzz within 0x17c steps of 256
   game units of the boss in x/z (`FUN_0049f3c0`). A 300-tick cut to the
   boss with its y temporarily 11,000 higher (so the cut looks at its
   top), and the level's music starts.
3. **Entrance** (phase 1): with under 0xf0 of the cut left, sound 0x46 at
   the boss once; under 0x96, sequence -4 once and the actual size eases
   toward the target a thirty-second a tick. At zero the script is jumped
   to word 9 (`+0x80 = script + 0x12`, `+0x78 = 0`), light 0's rotation
   is zeroed (`FUN_004ccc70`), and the phase becomes 999.
4. **The fight** (phase 999):
   - A voice timer (`DAT_0052f71c`, 180 at init) counts down and reloads
     to `rand + 0x708`, playing sequence 0xd1 at Buzz each time.
   - Buzz within 0x32 steps of the boss is shoved away along the line
     from it: `FUN_004071e0(yaw, 3)`, which sets his velocity from the
     angle (bit 1) and knocks him down (bit 2).
   - **A hit** (health changed): the flash timer `DAT_0052f710` = 4; the
     target size falls by 0x300; health is put back. If the target size
     is now under 0x200 it is pinned there and the GOAL grows by 0x800;
     every live effect of kind 0x3f is given one tick to live (its blobs
     burst); at a goal of 0x3000 or more the light comes back
     (`FUN_004ccb20(0x32, 0x1000 x3)`) and the saved packet word is
     restored, and at 0x3800 or more it is **dying**: script to word 0x5e
     (`+0xbc`), Buzz shifted 10,000 on x and z for the cut and back after,
     goal 0x3800, target and actual sizes 1, a 420-tick cut to the boss
     (raised 11,000 for it), flags cleared of 0x180, light 0's y set to
     1,000 under the boss, bit 7 of this level's token byte written, and
     the phase becomes 1000. Otherwise (a stage lost but not dead): shell
     closed (`vulnerable` 4), script to word 0x4f (`+0x9e`), a cut of
     `DAT_0052f758` ticks (180 at init, +40 each time) to the boss raised
     14,000, its velocity zeroed, anim state 1 on script 0x10.
   - While the shell is closed, the cut's look point is held
     `size * 2 + 10000` under the boss.
   - **Regrowing** toward the goal while the target is under it: with the
     shell closed and under 0x78 of the cut left, sequence -4 once and the
     target eases up a thirty-second of the gap a tick; with the shell
     closed and more of the cut left, the script's wait is set to 5;
     with the shell open, the target rises 32 a tick. Capped at the goal.
   - The script talks back through `+0x8a`: 1 = spit, an effect of kind
     0x3f from 10,000 above the boss with velocity y -2 and rotation
     `heading * 4`, its homing pitch (+0x20) cleared, with sound 0xd;
     3 = a 40-tick camera shake (`DAT_0050a510`). The timer is cleared.
5. **Dying** (phase 1000): the cut looks 11,000 under the boss; with
   under 180 of the cut left the boss is killed (`FUN_00405d20(e, 1)`)
   9,000 higher than it stands, the light's fall speed `DAT_0052f6fc` is
   set to -0xc00 and the phase becomes 1001. Light 0 then falls under
   gravity 0x60 a tick and bounces off the point 2,000 above the boss at
   half speed, with sound 0x45 while it is still fast. Phase 1001 waits
   for the cut to end, 1002 counts on to 1030 and sets the level-won flag
   (`DAT_00830cc4`).
6. Every tick the fight is on: an effect of kind 0x41 from 10,000 above
   the boss (mode 0x14, spin `(rand - 0x80) >> 3`); the boss's previous
   state and frame fields (+0x16, +0x1c) copied from the current, +0x32
   set to 0xfed3, the draw scale +0x2c/2e/30 set to the actual size, and
   the hit table at +0x84 rewritten — +0x12 of every 0x20 bytes to
   `-12000 - size` and +0x1e to `size / 16`, for four entries — so the
   slime is hit where it is drawn. The boss theme timer is set while the
   phase is over 0x3e6. A full-screen overlay is drawn (`FUN_0049b260(0x18,
   0, 0x40, 0x40, 0x40, u, v, 0, 0x40)`, `v` scrolling one a tick), a
   point light sits at (0x3889, -0x36099, -0x1fbc) at 0x80 grey, and the
   draw triple +0x24/26/28 is either the three wobble sines `>> 4` under
   mode `+0x34 = 0xf0000` or, while the flash timer runs, 0x2000 under
   mode 1.
7. Light 0 is turned to the boss's heading with a pitch and roll from
   `DAT_0052f6f8`, which advances 0x80 a tick until the size drops under
   0x400. Around the CAMERA, on a level with `DAT_0052f1c8` set, drips of
   kind 0x1b fall from `rand` ahead of it. A slow ambient (`DAT_0052f700`,
   20,000 ticks) sounds 0x70 from a point 200-ish ahead, and a rumble
   (`DAT_0052f708`) shakes the screen brightness registers
   (`DAT_0054dd6c/de9c/554038`) between 0x80 and `n * 3 + 0x80`.
8. The **target marker**: the first live effect of kind 0x3f has its
   position published to `DAT_00830d78/7c/80` with `DAT_00830d84 = 1`
   (`DAT_00830d88 = -3`), which the laser homes on and the HUD marks;
   with none, the marker is off.

**What the port needs before this can move.** (1) A per-creature draw
scale (+0x2c/2e/30, 0x2000 = 1) and the draw modifier triple +0x24/26/28
with its mode word +0x34, which the port's `offsetX/Y/Z` currently
holds from the model — the two uses want reconciling. (2) Rewriting the
hit table per tick, which `hitShapes` is read-only for now. (3) Effect
kinds 0x3f (the spat blob, with the laser target hook), 0x41 and 0x1b,
none exercised yet. (4) The knockback `FUN_004071e0(yaw, bits)` on the
player. Lights and the overlay are cosmetic; the camera cuts and the
save bit are already there.

## The pod, internal level 9 — DECODED, not ported

Decoded 2026-09-07 from `FUN_00424390` (init) and `FUN_00424490` (tick,
the largest level tick in the game). Scene `level09/level`, music
`buzvbuz`. Twelve creatures: slot 0 the boss, a big ZPOD (type 54, 26
health); slots 1-6 six BUBs (type 55, 1 health, script 6) that orbit it;
and slots 7-11 the helpers it releases, a small ZPOD (20), ZURG1, ZURG3,
ZGCAR and SHINY. Level 6's shape with two twists: the boss's health is
CLAMPED to its stage, and each hit releases helpers you have to kill
before it opens again.

**Init.** Stage `DAT_0052fbd4` = 1, base height `DAT_0052fbcc` =
-0x58000, the released pair both "slot 7" (none), a spin cooldown of 200
and a voice timer of 0x78; the boss's record speed set to 0; every BUB
(slots 1-6, 0x9c apart) given respawn 10000 and its record's home box
copied from the boss's.

**Every tick, first.** The boss is held inside a ring of radius 0x1068
level units about the arena's origin (0x1068 + 800 from phase 3), pulled
back onto it along its own bearing when it strays; the two released
helpers are held inside 0x15e0 the same way, and stopped dead while a
box or cut is up. The six BUBs are placed ON the boss, each facing
`DAT_0052fc0c + n * 0x2ab` (an even spread of six, the whole ring turning
4 a tick), their frames staggered by 0xc0000 out of a shared 0..0x180000
phase; a point 0x5aa ahead and 0x96 above each is dropped to the ground,
and a BUB whose health is 1 shoves Buzz away from that point when he is
within 0x4b steps (`FUN_004071e0(yaw, 1)`, velocity only). Every one of
the seven flies at `base + sin(DAT_0052fc08) / 8`, the sine phase
advancing 0x20 a tick.

**Phases** (`DAT_0052fc04`):

| phase | what happens |
|---|---|
| 0 | waiting. Buzz's z rising past -0x1bb58 starts it: the level's music, base height -0x38000, a 360-tick cut to the boss from 0x8000 above Buzz |
| 1 | the entrance: the cut's eye sinks 0x80 a tick and its look tracks the boss; the base height rises 0x280 a tick to -0x8000; voice sequence 0xd5 once after 0x78 ticks; at the cut's end phase 2 and the boss's record speed 0x10 |
| 2 | the fight |
| 3 | stage 7 reached: the boss's animState 2, record speed 0x14 — it comes down for you |
| 4 | dying: the cut eye rises; under 0x78 of the cut the boss is killed (`FUN_00405d20`) |
| 5 | the level is won when the cut ends |

**A hit** (health changed, phase under 4): sound 0x83; health is put
back to `0x1a - stage` while the stage is under 6, so it only ever falls
one point a stage; the next pair of helper slots is read from the table
at 0x4f2f58 — twelve dwords `8 8 7 7 8 9 10 7 11 8 11 7` read two at a
time, so the stages release ZURG1, then the small ZPOD, then ZURG1 with
ZURG3, ZGCAR with the small ZPOD, SHINY with ZURG1 — the shell closes
(`vulnerable` 4), and in phase 2 the stun `DAT_0052fbc0` is 600 with a
360-tick cut, else 0x78. Under 11 health it is instead **dying**: a
240-tick cut whose eye is set 0x100 round from Buzz's heading and 0x8000
up, speed 0, spin cooldown 10000, phase 4, and bit 7 of this level's
token byte.

**The stun** counts down; at 0 the shell opens (`vulnerable` 7) and, at
stage 7 in phase 2, phase 3 begins. While it runs in phase 2 the boss
flickers between 0x1000 and a pulse off the frame counter through the
draw triple +0x24/26/28 under mode `+0x34 = 1`; in other phases it
alternates 0x2000 and off.

**Releasing the helpers** (phase 2, stun running; the stun is capped at
600). Once the cut ends: the first time the stun is above 0x1a4, the
pair's respawn is set to 10000 and the release is armed; then, when BOTH
released helpers' health reads 0 — Buzz has killed them — the stun drops
to 0x78, the boss's record speed goes back to 0x10 and the STAGE
advances. While the cut still runs: the spin cooldown is 200, the cut
looks at BUB `stage` (its ground point, the eye three sine units round
from that BUB's heading), and under 300 ticks of cut with that BUB in
animState 0 it is put on animState 1 / script 0x17, the pair are reset
from their placements (`FUN_00406cd0`), given flags 0xaf0, their draw
scale zeroed with `+0x32 = 0x8000` as a "grow" marker, and sound 0x86
plays at the first. Between 0xb9 and 300 ticks of cut, an effect (0x11
mode 2, or kind 4 mode 4 without detail) is thrown from (0, 400, 0x4b0)
ahead of that BUB. Once the BUB's health is 1 the pair are parked at its
ground point 0x1000 up with velocity zero and `+0x8a = 0x1cc` unless in
animState 0xe; and under 0x3c ticks of cut with the BUB in animState 1,
four explosions (kind 0x23, mode 0xe), sound 0x85, voice 0xd6, a glow
(`FUN_0049ee50`, 0xf08000, 0x20) and the BUB is killed. A released
helper whose `+0x32` reads 0x8000 grows its draw scale 0xc a tick to
0x1000, which clears the marker.

**The laser.** With the spin cooldown at 0 and Buzz within 400 steps:
from a point 400 behind the boss, the bearing to Buzz is clamped to
±0x200 of the boss's heading; a ray of 0x8000 is cast that way
(`FUN_0048c860`) and a beam drawn along it (`FUN_0044e100`, type 9),
with sound 0x87 at its end, `DAT_0052f1c2` sparks of kind 4, an effect
0x46, a glow and a green point light there; Buzz within 0x1e steps of
the end takes sound 0x84, voice 0xd7 (on a 0x4b0-tick timer) and
`FUN_004071e0(yaw, 3)`, the full knock-down.

**Also.** The base height eases toward Buzz's own height at 0x80 a tick
while he is within 200 steps in phase 3, else back to -0x8000. The
camera's look-at (`DAT_0050a118`) is switched every 0x1e ticks to
whichever living released helper is nearer the camera, 0x2000 above it,
else the boss 0x4000 above. The boss theme timer is set in phases 2 and
3. The bar is `(health - 10) * 0x36 / 16`.

**What the port needs first.** The same four things as the Slime plus
one: a creature reset from placement (`FUN_00406cd0`, which the sim's
respawn nearly is), and the beam draw.

## Zurg, internal level 12 — DECODED, not ported

Decoded 2026-09-07 from `FUN_0042b300` (init) and `FUN_0042b3a0`
(tick). Scene `level02/level1`, which the port cannot load until
`parseDat` is retiled (docs/FORMATS.md); music `buzvzurg`; the boss is
slot 0. A simple fight with a set-piece death.

**Init.** Flag 0x800; the boss raised 0x28000 and moved 0x10000 along z,
heading 0xc00, `targetY` its own height, record +0xe (its anim/speed
byte) 0; a 300-tick clock, a 0x78 voice timer, a 0x104 attack clock.

**Phases** (`DAT_0052fe24`):

| phase | what happens |
|---|---|
| 0 | waiting. Buzz's x rising to -0x18b2a or above starts it: music, a 300-tick cut to the boss (eye 0x3000 short of it, 0x5000 up, look 0x4000 up), sound 0xd8 |
| 1 | the entrance: the boss rises 0x200 a tick, the cut's eye 0x220 a tick and back along x (faster under 0xb4); voice 0xb9 once after 0x78; Buzz is pinned to (-0x1da7c, -0x12bd0, 0xf699) whenever he gets above -70,000; at the cut's end flags |= 0xc (script velocity and chase), record +0xe = 10, `vulnerable` 6, phase 2 |
| 2 | the fight |
| 3 | dying |
| 4 | over |

**The fight.** A voice line every `rand * 2 + 400` ticks (0xba..0xbd);
the camera's look-at is the boss; the boss theme timer is set. **A hit**:
a one-in-four voice 0xd9 at Buzz; stun 0x3c; shell closed (`vulnerable`
4); flicker through the draw triple on alternate ticks while stunned.
Under 10 health it **dies**: phase 3, a 300-tick cut from a sine unit off
its heading and 0x4000 up, anim 2 / script 0x19, chase and script
velocity cleared, its two animation-rate bytes 0xc0 and the record's
+0x1c/+0x1d 0x20, the save's token bit, voice 0xc0. Otherwise a voice
(0xbe/0xbf), anim 1 / script 2, rate bytes 0xe0, attack clock 0.

**The attack clock** `DAT_0052fe30` runs 0x12e down to 0. Passing 200:
anim 0 / script 0x18, rates 0xc0 (winding up). Passing 0x92, 0x8a, and
each tick from 0x7e to 0x7f: a shot from (-0xfa, -0xfa, 0) in the
boss's frame — kind 0x6c with velocity from its heading (a cosine from
the table at 0x4fee88 and a sine 0x80 round, both a quarter) and gravity
0x400 when its health is above 0x13 or `DAT_0052fe34` is 0, else kind
0x6d thrown straight up with rotation `heading * 4` — and sound 0x9d.
Passing 0x68: anim 1 / script 2, rates 0xe0. At 0 the clock reloads and
the boss strafes: velocity a sixteenth of a sine unit at heading ±0x200,
the sign random.

**Dying** (phase 3). Buzz pinned as before. The boss turns toward
(-0xbd7c, 0x99); inside the box x (-0x256d6, 0xe0aa) z (-0x1b3e9,
0x1b297) it drives outward at a sixteenth of a sine unit; outside it,
record +0xe = 0, it spins 0x10 a tick and RISES with an accelerating
`DAT_0052fe2c` (+0x40 a tick) to 170,000, sound 0x9f on arrival, sound
0x9e above 70,000, and throws effects of kind 0x70 from 80,000 up with
velocity -0x2400 while detail is on. The cut looks at it from
-0x188e0 up, a sine unit over its acceleration away; the level is won
when the cut ends. Whatever the phase, the boss is held within 0x500
steps of that same point, and the bar is `(health - 9) * 0x36 / 20`.
The target marker (`DAT_00830d84`) is put on the path-0 node nearest
Buzz that lies within 1,000 steps of the camera, and every such node
gets a grey glow.

**What the port needs first.** The draw triple and mode word, effect
kinds 0x6c / 0x6d / 0x70, the target marker, and Buzz pinned by the
level. No knockback and no hit-table rewriting, so it is the easiest of
the four after level 6.

## The finale, internal level 15 — the stage is DECODED, the fighters not yet

Decoded 2026-09-07 from `FUN_0042faa0` (init) and `FUN_0042fc50`
(tick). Scene `level05/level1`, music `buzvpros`. Five creatures: slots
0-2 the three bosses SMITH, GUNSL and PROSP (29 health each, scripts 39,
33, 41), slot 3 JESSIE and slot 4 WOODY (1 health, never respawn). The
tick is the stage — the entrance, the chain, the camera, the win; each
boss's own behaviour is in a routine of its own: `FUN_0042f310` (SMITH,
529 bytes), `FUN_0042f530` (GUNSL, 632) and `FUN_0042f7b0` (PROSP, 752),
which are what advance the win counter, and which are the next read.

**Init.** All five turned to 0x400; the three bosses' health zeroed and
placed at (-0x32c6d, -0x92d6, -0x14f5), (-0x327cc, -0x92da, -0x45cd)
and (-0x32bbf, -0x92db, -0x8251); everyone's respawn 10000; the arena
point read from scene object 0 (`FUN_004ccef0`) and its y kept.

**The entrance** runs off a counter `DAT_0052fff8` started at 0x50 by
Buzz's x falling under -0x16bd9, together with a 480-tick cut of
distance 0x38 to scene object 0 (eye 0x4000 up, look 0x2000 up; between
0x168 and 0xf0 of it the eye tracks 0x180 a tick along x). The counter
runs to 1000 and fires as it passes: 0x96 voice 0xcd at Jessie; 0x118
Jessie thrown up (vy -0x300) and Woody (-0x400); 0x14f the same swapped;
0x168 both again with a spin and their z velocity zeroed; 0x1ae the three
bosses thrown up (-0x700, -0x600, -0x800) and given 29 health, Jessie's
and Woody's health cleared, sound 10 — each step with sound 0x2f, a
bounce of scene objects 0, 1, 3 and 4 (a velocity from -0xc00 rising
0x200 a tick, capped at the kept y) and a 0x800-tick wobble applied to
objects 0-3 as a rotation from a sine, its axis by which step. Under 0x1e
of the cut, once: music, the three bosses' phase words set to 2 and each
jumped to word 0xe of its script with its record's +0xf cleared, ground
velocities and a 0x400 x velocity, sound 0xe, voice 199 at PROSP.

**The chain.** While the fight is on, GUNSL keeps a sine unit (0x4000
game units) from SMITH, PROSP the same from GUNSL, and PROSP from SMITH,
each pulled back along the bearing when closer than 512 level units.
None of them may cross x = -0x2bdd6 while moving toward it.

**The camera roll.** 0xf0 ticks into the fight a counter `DAT_00530068`
starts climbing 8 a tick to 0x3000 and the follow camera's ROLL
(`DAT_0052f3c4`) is set from a cosine of it, shaped so it swings for
0x800, holds, swings back and rests; sound 0xa8 plays throughout with
its pitch from the same cosine. The bar is the three healths less 27,
times 0x36, over 60; the boss theme timer is set.

**The win.** The three routines count `DAT_00530064`; at 3 a 0x78-tick
cut of distance 0x20 to the last boss beaten (`DAT_0052fff4`), and when
it ends: Jessie and Woody turned to 0x400, placed at (-0x4e4e0, -0xbc80,
0x14e0) and (-0x46944, -0xb680, -0x1bea) with 1 health, the save's token
bit, a 300-tick cut to Woody at distance 0x40 (eye 0x3000 along, 0x3000
up, 0x1000 back; its z drifting 0x20 a tick), the level-complete flow
(`DAT_0052b7dc = 1`, `DAT_0052f2dc = 0xf0`). Path-0 nodes within 1,024
steps of the camera glow (node 2 red, the rest grey) and the nearest to
Buzz is the target marker.
