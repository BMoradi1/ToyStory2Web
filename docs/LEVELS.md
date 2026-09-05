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
2. `FUN_004025c0(table)` — load a table of up to ten 4-int records into
   `DAT_0050a150`. Purpose not decoded; every level has one.
3. `FUN_004a0db0(3, 1)` — **reveal slot 3 quietly**. The puzzle token is
   collectable from the start; the puzzle is getting to it.
4. `FUN_004335d0(table)` — load a table of `(a, b, pathTag)` triples: the
   moving objects that ride the paths in `level.dat`, resolved through the
   loader's path table `DAT_00559c70[tag]`.
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
- `FUN_004027f0(creature, anim, text, x, y, slot)` — **dialogue**. Opens the
  text box; the last argument is the slot to reveal when it closes
  (`FUN_00402a10` calls `FUN_004a0db0(slot, 0)`), or -1. This is how the
  find-five owners award slot 1: level 1's Bo Peep line runs with slot 1
  once `DAT_0052b7d8`, the sheep count, reaches five.
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

## Creatures

`FUN_00406cd0` constructs an entity from its creature type (`piVar1[3]`, the
`creatures.cfg` index) and installs per-type behaviour functions from a
switch of 60-odd cases — types 4 and 5 get `FUN_00416a60`/`FUN_00416ab0`,
which are level 1's tin robot: its death is where `FUN_004a0db0(4, 0)` comes
from. The 25 addresses that switch stores are the creature behaviours the
first Ghidra pass missed, listed in `tools/ghidra/README.md`.

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
