# Creatures

How toy2.exe places, runs, hurts and respawns everything that is not Buzz:
the enemies, the cast he talks to, the sheep, the race car. Read out of the
executable on 2026-09-05; every function is named so it can be checked
against the decompile (`tools/ghidra/README.md`).

**Ported** (2026-09-05): the placement file (`src/formats/rnc.ts`,
`src/formats/creatures.ts`), the behaviour data (`src/sim/creature-data.ts`,
generated), and in `src/sim/creatures.ts` the entity, the tick, the
twelve-step update, all 34 script opcodes, the damage routine and the
contact test. The hit geometry is read from each type's `.all`
(`setCreatureModels`). `tools/creature-probe.ts` runs every creature in the
install and checks it patrols inside its home box, runs its script, and
hurts Buzz exactly when its flags say it should.
**Not ported**: the per-type C handlers, the laser and the dive (damage
kinds 4 and 5), the player's full knock-down reaction, and the drawing —
the viewer still shows markers rather than posed models.

Two things in this document were wrong until the port was written against
the decompile, and are corrected below: the placement's `+0x12` is the
entity's initial **flags** word, not a yaw, and the per-type table passed to
the ground ray is a **shadow radius**, not a probe reach.

The short version: a creature is a **32-byte placement** from the level's
`.raw` packet, expanded by a constructor into a **156-byte entity**, and run
each tick by one shared update that interprets a **word-code script** chosen
by the placement, moves the body, and then calls an optional **per-type C
function**. Forty-four scripts and thirty-odd C functions cover the whole
cast. Buzz's attacks and the creatures' touches go through one damage
routine with a seven-row table.

Units are the sim's: game units (32 per level unit), +Y down, 12-bit yaw,
the 4096-entry sine table at `0x4fe788` scaled to 0x4000. `dt` is
`DAT_0052f2d4`, the ticks elapsed, normally 1.

## Where creatures come from

Every scene directory holds a `level.raw` (and `level1.raw` for the second
scene): an RNC ProPack method-2 container, each record unpacking to a
payload whose first `u32` is a **record type**. The level loader
`FUN_00452310` ("Loading packet data") walks the records and keeps two:
type **0x23**, which it logs as `CreatListRam`, and 0x24 (the level's
backdrop image, docs/FORMATS.md). The other thirty-odd types are the PlayStation side of
the level and are read elsewhere or not at all.

Type 0x23 is copied whole into a static 2 KB block: **64 slots of 32
bytes**. A slot with type byte 0 is empty. `src/formats/creatures.ts`:

    +0x00 i32 x, y, z     level units; the constructor shifts them left 5
    +0x0c u8  type        creatures.cfg index: 3 ZURG1, 5 TINMAN, 6 SHEEP ...
    +0x0d u8  script      which of the 44 behaviour scripts to run
    +0x0e u8  turnRate    how fast the heading eases; 0 = fixed heading
    +0x0f u8  facing      << 4 gives a fixed 12-bit heading; 0 = free
    +0x10 u8  health      see "Health" below; 102 marks the harmless
    +0x11 u8  respawn     0 = gone for good when killed; 100 = 1800 ticks
    +0x12 i16 flags       the entity's initial flags word, copied straight
                          into +0x40. NOT a yaw: only 31 distinct values
                          occur across the install's 373 creatures and each
                          is a combination of the bits below — every enemy
                          carries 0x100 "hurts on touch", the harmless sheep
                          does not, and the hovering bots carry 0x010
    +0x14 i16 rangeX      half-extents of the HOME BOX, in 256-unit steps
    +0x16 i16 rangeZ
    +0x18 i16 rangeYaw    the box's rotation, in 1/512 turn (x 8 = 12-bit)
    +0x1a u8  vulnerable  bit 0 spin, bit 1 body attacks; 4 = bounces the laser
    +0x1c u8  accel       forward acceleration, x 2
    +0x1d u8  accelSide   sideways
    +0x1e u8  speedMax    x 16; 0xff means drive backwards
    +0x1f u8  speed       x 16; 0 = does not move at all

The C code writes into this record as well as reading it (`FUN_00416ab0`
sets +0x1a and +0x1e on the tin robot every tick), so it is the creature's
*parameters*, not just its spawn.

The other list on disc, `level.raws`, is the same record from an earlier
build (level 1's has Woody in slot 0 where the shipped list has a second
cot-bit); the engine only opens `.raw`. Counts, from `tools/raw-validate.ts
"Toy Story 2" --creatures`:

| scene | creatures | cast |
|---|---|---|
| level01/level | 36 | COTBIT BOPEEP SHEEP TINMAN ZURG1 ZURG3 RC HAMM MRPOT REX |
| level02/level | 29 | LAWN ARMY ZGCAR ZURG3 ZURG1 HAMM ZKITE REX RC |
| level04/level | 30 | ZGCAR ZPOD PAINT ZURG1 LTYKE REX FTYKE HAMM MRPOT DRILL SLINKY |
| level05/level | 35 | BOX BPLANE CLOWN ZURG1 ZBOAT SLINKY DUCKS HAMM ZURG3 SHINY REX |
| level07/level | 32 | DINO HAMM CHICK LOCK HOOLA MUM ROOST MRPOT ZPOD BOX BPLANE ZURG3 REX |
| level08/level | 42 | HAMM FSAUCE MOTHER MARTIAN ZURG1 ZPOD ZURG3 SHINY ZGCAR BBUGGY REX |
| level10/level | 24 | MOUSE HAMM MRPOT GUNSP RATTLE ZPOD SHINY REX |
| boss arenas (level03, 06, 09, 12, 15) | 1 | the boss |

The `.raw` container itself: 14-byte headers, `u32 BE` unpacked size
(`0xFFFFFFFF` ends the file), `u32 BE` packed size, two `u16` CRCs, two
bytes, then the stream. `unpackRnc2` is transcribed from the engine's own
unpacker `FUN_0047b170`; it decodes all 54 files in the install and every
record matches its CRC.

## The entity

`FUN_00407150` zeroes 64 entities of 0x9c bytes at `0x52c840`, then for each
non-empty slot points entity `+0x98` at the placement and calls the
constructor. Fields the code uses, by offset:

    +0x00 i32 x, y, z     game units
    +0x0c i16             set by the C handlers (the tin robot's hover)
    +0x0e u16 heading     12-bit
    +0x12 i16 animState   what the script's `anim` opcode set; C code reads it
    +0x14 i16 type        creatures.cfg index; 0 = empty slot
    +0x18 u32 frame       16.16 animation cursor; the anim script sets the frame
    +0x20 i32 floorY      INT_MIN = unknown
    +0x38 i16 x 3         offset added to the position for the wake-up test
    +0x3e i16 hitRadius   used by the wake-up and contact tests, >> 3
    +0x40 u16 flags       see below
    +0x42 i16 bodyRadius  0x500, 0x708 or 0xed8 by type (CREATURE_TYPES)
    +0x44 i32 vx, vy, vz  velocity (+0x44, +0x48, +0x4c)
    +0x50 i32 x 3         HOME: where it was placed
    +0x5c i32 x 3         TARGET: where it is going
    +0x68 i32 wantYaw     the heading it is turning toward
    +0x6e u8, +0x6f u8    animation rate, landed / airborne (see Animation)
    +0x70 i16 deathTimer  > 0 counting down to the death effect, < 0 counting up to removal
    +0x74 ptr animScript  current animation frame script
    +0x78 i16 wait        script timer; the script runs while it is negative
    +0x7a i16 respawn     ticks until it comes back; 0 = never
    +0x7c i16 stun        hit cooldown
    +0x7e i16 health
    +0x80 ptr pc          script position
    +0x84 ptr hitShapes   the model's type-9 group (see below): 16 bytes per
                          animState — i16 offset x3, i16 count (record 0
                          only), i16 scale x3 (256 = 1.0), i16 radius
    +0x8a i16 timer       free for the C handler (the hover-bot's firing cycle)
    +0x90 i32 lastFloor   y to fall back to when the ground ray finds nothing
    +0x94 ptr handler     per-type C function, or null
    +0x98 ptr placement   the 32-byte record

Flags at +0x40, as far as they are used:

    0x001  awake for contact even when far (the near-list filter keeps it)
    0x002  NEAR: in this tick's near list (cleared and re-set every tick)
    0x004  moving under a script-set velocity (`velocityToTarget`)
    0x008  CHASES: while the player is in the home box, target = player
    0x010  no gravity
    0x020  flies: y follows the target's y; casts a shadow
    0x040  respawns even in view; also "fly with ground check"
    0x080  drawn this frame (set by the draw code, gates contact)
    0x100  hurts the player on touch
    0x200  talked to / touched (the dialogue and the sheep use it)
    0x400  keep momentum: no deceleration; cleared on landing or when shoved
    0x800  has died once: set by the death effect. A respawn rebuilds the
           flags from the placement and adds this bit back if it was set
    0x2000 its model is not loaded (`FUN_00447bd0` sets it): never in the near list

**Where the model-derived fields come from** (found 2026-09-05). Each
creature type's `.all` ends with a group of type 9 (`GroupType.HitShapes`,
53 of the 68 character models; Buzz and Woody have none). Its payload is the
`+0x84` table, one 16-byte ellipsoid per `animState`, and its group entry
carries the coarse-sphere numbers: `+0x38/+0x3a/+0x3c` are the entry's
u16s at +0x2c/+0x2e/+0x30 and `+0x3e`, the hit radius, is +0x32. The type
loader `FUN_0043b0c0` (a switch from type number to `chars<n>/<name>`)
loads each model through `FUN_0043aca0`, which reads the `.all` with
`FUN_0043d820` into one 0x6c-byte part record per group, keeps the last
record's payload pointer when that group is type 9 (`DAT_0053e6c8[type]`)
and the entry words (`DAT_0053eac8[type]`), and then, once every type is
in, copies them into every entity of that type. `readHitShapes` in
src/formats/all.ts reads the table; the laser and contact tests index it by
`animState`.

## Construction (`FUN_00406cd0(entity, fromList)`)

Position = placement << 5. `type` from +0x0c, script pointer from the
44-entry table `PTR_DAT_004e02c4[+0x0d]`, `health` from +0x10, `respawn`
from +0x11 (100 becomes 0x708 = 1800 ticks), flags from +0x12 (a respawn
passes `fromList = 0`, and if the creature has died before it keeps flag
0x800), heading and `wantYaw` = facing << 4, home and target = position,
velocity 0, frame 0, floorY unknown, wait 0, animScript = the default
(`ANIM_SCRIPTS[1]`, a 24-frame loop), bodyRadius 0x500 and no handler. The
switch on type then overrides the radius and installs the handler for the
types that have one — `CREATURE_TYPES` in the data module lists all of
them. Two types pick their handler by level: type 45 (GUNSL) is
`FUN_004282d0` on level 11 else `FUN_0042f530`, type 58 (SMITH) is
`FUN_0042d3e0` on level 14 else `FUN_0042f310`, type 61 (PROSP) is
`FUN_0042be60` on level 13 else `FUN_0042f7b0`. Type 24 (BPLANE) starts with
health 0 and respawn 10000: it exists only once something spawns it.

## The tick (`FUN_004086f0`, once per frame)

For each of the 64 entities with `type > 0`:

- **Dormant** (`health <= 0`): if `respawn == 0`, rebuild it — but only
  when flag 0x40 is set or it is outside the view frustum (`FUN_00448f00`
  tests the placement position against the camera's matrix rows at
  `0x54c100`, so nothing pops in on screen). Otherwise `respawn -= dt`
  (unless it is the entity that was killed last, `DAT_0050a54c`, or the
  value is 5000+, which means "never").
- **Alive**: it wakes when the player is within
  `(bodyRadius * 0x16a >> 9) + (hitRadius >> 3)` of it, both sides in units
  of 256 game units (the delta is `(focus - offset - position) >> 8`). Level
  6 and anything with health 0xca is always awake. The focus `DAT_0052adc0`
  is the player position, smoothed toward it by `DAT_0050a140 / 64` a tick.

The awake ones form the **near list** `DAT_0052f1d0` (up to 64). A second
pass drops any without flag 0x001 whose distance is beyond
`(hitRadius >> 3) + 400` (same 256-unit scale), or with flag 0x2000; the
rest get flag 0x002. Each of those is then updated (below), and its death
timer is run: positive counts down and fires the death effect
(`FUN_00405d20(e, 1)`) at zero; negative counts up, spraying a particle a
tick from the random stream meanwhile, and at zero the entity is removed
(`FUN_00405d20(e, 2)`) and dropped from the list. Level 10 runs an extra
per-level pass (`FUN_00425a80`) before and after.

## The update (`FUN_004076f0(entity)`)

In order, every tick, for every entity in the near list. `rec` is the
placement.

1. **Stun.** If `stun > 0`, `stun -= dt` and this tick's accelerations are
   forced to 0x20.
2. **Script.** `wait -= dt`; while `wait < 0` the interpreter runs from
   `pc` (next section) until an opcode blocks.
3. **Peek.** Whatever `pc` now points at is looked at without being run:
   `jumpToTarget`/`jumpToTargetStop` set the jump mode and `wait = 20`;
   `facePlayer` sets `wantYaw` to point at the player. A non-zero `facing`
   in the placement then overrides `wantYaw` outright, every tick.
4. **Chase.** With flag 0x008, if the player is inside the home box
   (rotated by `rangeYaw`, half-extents `rangeX * 256`, `rangeZ * 256`), the
   target becomes the player, with a per-type standoff: types 4 and 20 aim
   0x5000 above him and keep 0x4b0 away, type 5 aims 0x800 above, type 15
   keeps 0x5dc away and does not track his height, type 57 keeps 2000 away
   and aims 0x800 (0x5000 while `DAT_0052fe34`) above, everything else
   0x800 above. The target's y is only followed while within 0x10000
   vertically; otherwise it is the home y. If it would end up inside the
   standoff radius it is eased back out by a sixteenth per tick. Types 5
   and 15 do not pause the script; the rest add `dt` back to `wait`, so a
   chasing script freezes at its blocking opcode until the player leaves.
5. **Acceleration.** Velocity is rotated into the heading's frame (fwd,
   side, both `>> 12` of the 0x1000-scale sine). Without flag 0x400 each
   component decays toward zero by `accel * 2 * dt / 4` (forward) and
   `accelSide * 2 * dt / 4` (sideways) — 0x20 for both while stunned.
6. **Heading and drive**, only while flag 0x004 is set (a
   `velocityToTarget` has been issued and nothing has shoved it since) or
   the creature is chasing: with `turnRate != 0`, `wantYaw` = the direction to the target (the
   player, when chasing) minus half a turn. If `speedMax == 0xff` the
   creature drives backwards: the side component is pushed toward
   `-speed * 8` at `(accelSide + 0x20) * dt / 4`; otherwise it is pushed
   toward `speed * 16` at `(speedMax + accelSide) * dt / 4`. (Yes: the
   scripts steer with the *side* component; the forward one is only ever
   set by `velocityToTarget`.)
7. **Turn.** `heading += (wantYaw - heading) * turnRate * dt >> 7`, the
   difference taken the short way round.
8. **Move.** Velocity is rotated back out of the heading frame. If
   `rec.speed == 0` everything horizontal is zeroed; else
   `x += vx * dt`, `z += vz * dt`.
9. **Home box.** The new position, rotated into the box's frame, is
   clamped to the half-extents and rotated back. A creature cannot leave
   its patch by walking, ever.
10. **Vertical.** Without flag 0x010: `vy += dt * 0x100 / 4`, capped at
    0x800; `y += vy * dt`. Then, unless flag 0x020 (flying), a ground ray
    from `y - 0x1900` (`FUN_00486280`) gives the floor; if none, `y`
    reverts to `lastFloor`. The ray always drops a fixed 0x10000: the
    per-type value the call also takes (`SHADOW_RADIUS`, the table at
    0x4e05ee) is handed to the shadow-drawing call and skipped when it is 0,
    so a 0 there means "casts no shadow", not "no ground check". If the fallen
    `y` is within 0x200 above the floor the creature is **grounded**: with
    no jump pending `y` eases to the floor at up to 0x400 a tick, `vy = 0`;
    with a jump pending (step 3) the jump is over — `wait = 0`, `pc`
    skips the jump opcode, flag 0x400 clears, and `jumpToTargetStop` also
    zeroes the velocity. Flying creatures instead take the target's y and
    register a drop shadow (`DAT_0054f098`, up to 47). With flag 0x010 and
    not flying (or with 0x040): `y` eases toward the target's y by a 64th
    a tick, floored by the ground ray.
11. **Animation.** The rate byte is `+0x6e` when grounded, `+0x6f` when
    not. Negative: a fixed `-rate * 0x200` per tick (16.16 frames).
    Positive: `sideSpeed * rate / 2`, so a walk cycle follows the legs.
    Each whole frame the cursor crosses advances the anim script
    (`FUN_00405c80`, below).
12. **Handler.** If the type has a C function it is called with
    `{ entity, bits, fwd, side }`: bit 1 = driving (step 6 ran), bit 2 =
    grounded, bit 4 = the frame changed this tick.

## The script interpreter

Scripts are signed 16-bit words. The interpreter executes opcodes back to
back, in one tick, until one **blocks**: `yield` (4), the two jumps (6, 7),
`facePlayer` (0x20), `end` (0) and anything it does not know. The blocking
opcode stays at `pc`; on the next tick the interpreter sees it has made no
progress and steps over it. So `wait 60; yield` is "wait 60 ticks":
`wait` only sets the timer, `yield` is what actually stops. Every wait in
the data is written that way.

A one-bit **condition** is set by the `test*` opcodes and consumed by
`ifSkip`. Random numbers come from a 2 KB byte stream, `data/rand.dat`,
read sequentially through `DAT_0052adac` and rewound at level start.

| op | name | operands | effect |
|---|---|---|---|
| 0 | end | | blocks for ever (padding after the loop) |
| 1 | wait | n | `wait = n` |
| 2 | waitRandom | mask, add | `wait = (rand & mask) + add` |
| 3 | targetRandomDir | dist | target = home + `dist` in a random direction (12-bit angle from two random bytes); `dist < 0` means `-64 * min(rangeX, rangeZ) / dist` |
| 4 | yield | | block |
| 5 | targetRandomInBox | margin | target = home + a random point in the home box, at least `margin * 32` from the edges (`rand * range * 2` each axis) |
| 6 | jumpToTarget | | block until grounded (step 10), keep momentum |
| 7 | jumpToTargetStop | | block until grounded, then stop dead |
| 8 | ifSkip | n | if the condition is set, `pc += n + 1`; else `pc += 2` |
| 0xb | nop | x | two words, nothing |
| 0xc | flags | and, or | `flags = (flags & and) \| or` |
| 0xd | anim | state, script | `animState = state`; animScript = `ANIM_SCRIPTS[script]`; frame = its first byte |
| 0xe | testRandom | mask | condition = `(rand & mask) == 0` |
| 0xf | setSpeed | n | `rec.speed = n >> 4` |
| 0x10 | testPlayerNear | r | condition = horizontal distance to the player, in level units, `< r` |
| 0x11 | testPlayerInBox | | condition = the player is inside the home box |
| 0x12 | testTargetNear | r | condition = horizontal distance to the target `< r` (level units) |
| 0x13 | nop | x | two words, nothing |
| 0x14 | setSpeedMax | n | `rec.speedMax = n` |
| 0x15 | resetFloor | | `floorY = INT_MIN` |
| 0x16 | colour | grounded, airborne | the two animation rate bytes (+0x6e, +0x6f); -32 is a frame every four ticks |
| 0x17 | sound | event | `FUN_0049e660(event, entity)` — a sound event at the creature (docs/LEVELS.md) |
| 0x18 | velocityToTarget | -ticks | `vx, vz = (target - position) / (-n >> 5)`; `vy = n`; flag 0x004 |
| 0x19 | face | 1 or 2 | `wantYaw` toward the target (1) or the player (2) |
| 0x1a | velocity | vx, vz | set the horizontal velocity directly |
| 0x1b | targetPlayer | | target = the player (y too, unless flying) |
| 0x1c | velocityY | vy | set `vy` (negative is up) |
| 0x1d | setTurnRate | n | `rec.turnRate = n` |
| 0x1e | setRecord1a | n | `rec.vulnerable = n` |
| 0x1f | targetPastPlayer | d | target = position + `d` x 0x4000 game units (the unshifted sine) toward the player; `d <= 0` adds 0x80 + d to the angle and uses 1 |
| 0x20 | facePlayer | | block for a tick, turning toward the player |
| 0x21 | setTimer8a | n | `+0x8a = n` |
| 0x22 | testGlobal | | condition = `DAT_0053c620 != 0` (a timer the player code runs) |
| 0x23 | targetAwayFromPlayer | d | target = position - `d` x 0x4000 game units away from the player |
| -1 | loopBack | n | `pc -= n`, counted from the opcode's own word. Several scripts land on an operand this way (script 1 loops to word 2, the middle of a `colour`); the stray word blocks for a tick and is stepped over, so it costs one tick and nothing else |

The table is `CREATURE_OPS` in the data module and `tools/creature-scripts.ts`
prints any script with it. Level 1's:

- **Script 1, ZURG1** (the walking Zurg toys): show; if the player is in
  the box skip to the attack. Patrol: wait 60; pick a random point in the
  box; face it; wait 10; walk anim; wait 22; lunge anim; leap at it
  (`velocityToTarget -2048` = 64 ticks, `sound 14`, `jumpToTargetStop`);
  land anim; wait 12; loop. Attack: target = player, then the same leap.
- **Script 3, ZURG3** (the hover bots): anim 7, drift to a random point in
  the box, wait 31..63, loop. The handler `FUN_00406220` does the rest: a
  0x168-tick cycle that opens (anim 1) at 200, fires two shots (`FUN_0040fae0`
  type 0x26, `sound 13`) at 0xb6 and 0xa6, closes at 0x88, then picks a
  new drift direction ±0x200 from its heading; it hums (`sound 0x2c`)
  while alive and eases its hover (+0x10) toward the handler's forward
  speed.
- **Script 4, SHEEP**: `velocityY -1024`, `sound 32`, wait 63..191, loop:
  a hop every few seconds. The handler `FUN_00416a60` removes the sheep
  and counts it (`DAT_0052b7d8`, the find-five task in docs/LEVELS.md)
  when flag 0x200 is set, which the touch code sets.
- **Script 5, TINMAN** (the tin robot mini-boss): idle (anim 1) until the
  player enters the box; then a wake-up sequence — anim 9 for 44, anim 1
  state 2 for 381, `flags &-265 | 0` (clears 0x008 and 0x100), anim 9
  state 3 for 64, three stomps (anim 10 state 5, `sound 34`, 32 each),
  `flags &-257 | 256` (hurts on touch), anim 9 state 4 for 44, then
  `flags |= 8` (chase) and loop to the wake-up. Two more entry points at
  words 90 and 101 (state 6 hit, state 7 dying) are jumped to by the
  handler `FUN_00416ab0`, which also bounces the laser (`rec.vulnerable =
  4`) except while hit, releases token slot 4 when its death animation
  passes frame 12, and starts the taunt dialogue when the player is up on
  its platform.
- **Scripts 0, 6, 7, 8, 42** (RC, Bo Peep, Hamm, Mr Potato Head, the
  cot-bits, Rex): one anim, one colour, `yield`, loop. The cast stands
  still; their dialogue is the level script's (docs/LEVELS.md). The RC's
  handler `FUN_00406a60` picks `FUN_00416f30` on level 1 (wheels, skid
  dust, engine pitch) — the car's motion is the level's path ride.

## Animation scripts

`ANIM_SCRIPTS[n]` is a byte list: frame numbers. `FUN_00405c80` advances
one entry: if the next byte is 0xff, the byte after is a marker — 1 holds
the current frame (the cursor's low word is filled so it never advances),
otherwise the script rewinds that many bytes. A script whose third byte is
0xff and fourth is 0 is a single held frame. The frame goes into the top
half of `+0x18`. The type's `.anm` is loaded whole by the same loader and
kept per type (`DAT_00547cd4[type]`, the file image with its first word set
to 1 and the part-record range written over the header's +4/+6), and
**`animState` is the `.anm` slot index**: the animation player
`FUN_0043ba80` is handed `anm + 8 + animState * 4`, the slot's offset entry
(`FUN_004019d0`, `FUN_0043c070`), and the frame number picks the frame
inside that animation. So there is no per-type slot table; the state
numbers in the scripts are slots in that creature's own `.anm`.

## Health, damage and contact

`health` starts at the placement's byte. Three values are special: **102
(0x66)** marks a creature that cannot hurt Buzz by touch (the sheep); **100
or more** cannot be hurt (damage is only applied below 100); **999** is set
on death. `FUN_00408a60(entity, angle, kind)` is the one damage routine,
with a seven-row table at `0x4e066c` (`DAMAGE_KINDS`):

| kind | from | mode | stun | damage |
|---|---|---|---|---|
| 0 | a plain touch | shove only | 0 | 0 |
| 1 | spin, body contact (`DAT_0053c650 > 20`, or the charge `DAT_0053c83c < -119`) | hurt | 30 | 2 |
| 2 | spin sweep (`FUN_004a5870`) | hurt if `vulnerable & 1` | 4 | 1 |
| 3 | charged spin sweep | hurt if `vulnerable & 1` | 4 | 4 |
| 4 | laser bolt (`FUN_00410f40`) | hurt | 4 | 2 |
| 5 | dive impact (`DAT_0053c64c`, the air move in `FUN_00434d20`) | hurt | 30 | 2 |
| 6 | level code | hurt | 0 | 128 |

Mode 2 also needs the placement's `vulnerable` bit 0; kinds 1 and 5 need
bit 1 (checked by the caller). What happens: the creature is shoved —
`vx, vz = sin, cos(angle) >> 5` (0x200 at most) and flag 0x400 cleared — then,
if not already stunned, `stun` is set from the table, mode 1 spawns a hit
spark at the player (`FUN_004104d0`), health drops by the damage with
`sound 9`, and at zero or below: flags `&= 0xfe63`, health = 999, wait = 0,
`pc` = script 2 (a bare "show, yield, loop"), and `FUN_00405d20(e, 1)`.

The laser bounces instead of hitting when the placement's `vulnerable`
byte is exactly 4 (the tin robot's shell): the bolt is reflected off the
creature and `sound 7` plays.

**Contact** (`FUN_00407440`, each tick over the near list): a coarse sphere
first — `hitRadius + reach` around the entity plus its +0x38 offset against
the player's chest (`y - 0x1cc0`), with reach 150, or 400 while attacking —
then the **hit ellipsoid** for the current `animState` from `+0x84`,
rotated by the heading and scaled per axis. On a hit with the creature
drawn (flag 0x080): flag 0x200 is set, the creature is shoved with kind 0
(or the attack's kind if `vulnerable` allows and, for the dive, the
creature is below), and the player reacts (`FUN_004071e0`): pushed away
along the contact angle, and hurt too when the creature has flag 0x100
and Buzz was not attacking.

The reaction is exactly two branches. **Flag 0x100 set and Buzz not
attacking** gives push *and* hurt, whatever the creature's health.
Otherwise it is push only, or nothing at all when the health is 102 or the
attack landed. So health 102 does not by itself make a creature safe to
touch — it only matters in the second branch. No creature in the game
carries both 102 and flag 0x100, so in practice the harmless never hurt,
but that is a property of the data and not of the code.

## Death and respawn (`FUN_00405d20(entity, what)`)

`what & 1`, the death effect: unless flag 0x800, a ground-seeking
particle burst (`FUN_0040fae0`, kind 0x3d) from 0x1000 above; flag 0x800
set, both animation rates 0xe0, velocity `(0, -0x400, 0)`. Then a switch
on type: most set `deathTimer = -1` (removed next tick); a few play a
death animation first (`deathTimer` = -94, -62, -70 with a death anim
script) or spawn a burst of `n` sparks (`FUN_0040fdf0` kinds 0x23/0x11/99)
and `sound 10`; type 41 (BUZZARD) plays `sound 0x59`, types 15/22/31/32/48
spawn an explosion (`FUN_00410540`) with `sound -2`.

`what & 2`, removal: `DAT_0050a54c` = this entity (so its respawn timer
does not start counting this tick); if `respawn == 0` the type is zeroed —
gone for good; flags `&= ~3`, health 0, and it is taken out of the near
list. A dormant entity with a timer waits it out and is rebuilt by the
constructor (position, health, script — everything) once out of view.

## Per-type C handlers

`CREATURE_TYPES[type].handler` names them. Defined and readable in the
dump after `DefineFuncs.java` on the eight the first pass missed
(`0x406220`, `0x4064a0`, `0x406620`, `0x4068e0`, `0x406960`, `0x406a60`,
`0x406a90`, `0x406c70`). Level 1's four are described above; the rest are
per-level work for whoever ports that level. The handlers share a
convention: they read the placement to tune behaviour, use `+0x8a` as a
private timer, and end a creature by calling `FUN_00405d20` themselves.

## Not yet decoded

- the other `.raw` record types (0x24 is the backdrop, docs/FORMATS.md)
- what the flying creatures' shadow list is drawn as

`FUN_00447bd0` (settled 2026-09-05) is the visibility pass over the near
list: it clears flags 0x1 and 0x2000, then for a creature whose type has
its `.anm` loaded and whose draw slot's model is in (`FUN_004bc160(+0x6c)`)
sets flag 0x1 when the player is within `bodyRadius^2 * 16` (plus 250000
while the flag is already set, a hysteresis; distances in 32-unit steps)
and the sphere of `hitRadius` at the creature passes the frustum test
(`FUN_004ba1f0`); a creature with no model gets 0x2000 instead.
