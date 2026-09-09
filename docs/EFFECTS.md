# The effect system

Decoded 2026-09-06 from `toy2.exe`. Everything that is not a model or a
level mesh and moves — Buzz's disk, the hover bot's shots, the coins
a dying creature spills, hit sparks, smoke, dust, the stomp's shockwave,
the sparkles over secrets, the boss missiles — is an **effect**: one of 64
records driven by a template and a behaviour byte. `src/formats/
effect-table.ts` reads the templates from the user's executable and
`tools/effect-table.ts` checks them; nothing from the executable is stored
in the repository.

| what | where |
|---|---|
| records | 64 x 0x3c bytes at `DAT_00529e58`; next-slot cursor `DAT_0052ad90` |
| templates | 128 x 16 bytes at 0x4ec160, 127 in use |
| spawn modes | 29 x 0x18 bytes at 0x4ec948 (entry 0 unused) |
| spawn | `FUN_0040fae0(x, y, z, vx, vy, vz, gravity, rotation, spin, kind)` |
| spawn a child | `FUN_0040fdf0(x, y, z, kind, mode)` — velocity from the spawn mode, then the above |
| tick | `FUN_00410f40`, once per game tick, after the player and creatures |
| draw | `FUN_00445980`, in the render pass after the pickups |
| touches Buzz | `FUN_004100f0`, from the player tick |
| dies | `FUN_00410b80(record)`, by the template's death code |
| random bytes | `*DAT_0052adac++`, a cursor over `rand.dat` loaded at `DAT_0084c3e0` |

## The record

| offset | | |
|---|---|---|
| +0x00 | i32 x, y, z | game units, +Y down |
| +0x0c | i32 vx | per tick; the spawner halves what it is given |
| +0x10 | i32 vy | — or, with the `homing` flag, the target: an entity pointer, or -1 for Buzz |
| +0x14 | i32 vz | |
| +0x18 | i32 gravity | added to vy each tick; the spawner quarters what it is given. Homing: the yaw |
| +0x1c | i32 floor | y of the ground below, 0x80000000 until asked |
| +0x20 | i32 | homing: the pitch, or -1 for none |
| +0x24 | i16 life | ticks left; template life x 2. 0 dead, -1 for one frame while the death hook runs |
| +0x26 | i16 width | card size, level units |
| +0x28 | i16 height | |
| +0x2a | u8 period | ticks per frame, template x 2 |
| +0x2b | i8 countdown | to the next frame |
| +0x2c | u8 sprite | sprite table index (docs/HUD.md); 0 means "not drawn" |
| +0x2d | u8 kind | |
| +0x2e | i8 death | what the death hook does |
| +0x2f | u8 mode | the behaviour byte |
| +0x30 | u8 frames | |
| +0x31 | u8 frame | current |
| +0x32 | u16 flags | below |
| +0x34 | i16 rotation | 0..0xfff; drawn x 16 |
| +0x36 | i16 spin | per tick; the spawner halves it |
| +0x38 | u8 r, g, b | colour, 0x80 neutral; the fades write here |
| +0x3b | u8 layer | 0x2c when opaque, else 0x2e (`FUN_00446fa0`) |

## The template

Sixteen bytes, copied almost verbatim: `sprite`, `period` (signed; a
negative value would randomise, none is), `life` (i16), `frames`, `death`
(signed), `width` (i16), `height` (i16), `flags` (u16), `mode`, `r`, `g`,
`b`. See `EffectTemplate`. Validation: every one of the 127 templates names
a sprite that has a header in the global table or a level's, with at least
`frames` frames that fit the sheet; every mode is a case the updater has;
every death code is 0..11 or a negative naming a real kind; every kind the
updater spawns as a child exists.

**Flags** (`EFFECT_FLAGS`): 0x01 test the ground and die on landing, 0x02
can touch Buzz, 0x08 homing, 0x10 flat on the ground instead of a
billboard, 0x60 the blend (0 translucent at alpha 0x40, 0x20 additive,
0x40 subtractive, 0x60 opaque — the same words the HUD uses, docs/HUD.md),
0x80 protected, 0x100 keep, 0x200 drawn.

## Spawning

The spawner refuses anything further than 800 x 256 game units from the
camera target (`DAT_0052adc0`), or 400 for kinds 0x37, 0x43 and 0x50. It
takes the next slot round-robin, but skips a live record with `protect`
set, settling for the protected one with the least life if it has gone all
the way round. Position is copied, velocity halved, gravity quartered,
rotation kept, spin halved; life and period are doubled from the template;
`drawn` is set; the floor is unknown.

The child spawner picks a spawn mode: four packed nibbles at +0 say how
each of vx, vy, vz and gravity (+4, +8, +0xc, +0x10) is randomised from
the next random byte `r`, and +0x14/+0x16 are the rotation and spin.
The six rules, with `v` the entry's value: 1 `((r & v) - v/2) * 8`, 2
`(r & v) * 8`, 3 `-(r & v) * 8`, 4 `((r & v) + (v >> 4 & 0xff0)) * 8`, 5
`((r & v) - (v >> 4 & 0xff0)) * 8`, 6 `((r & v) - v/2) * 16`; 0 uses `v`.
Callers often patch the returned record (life, size, spin, a velocity) right
after.

## The tick

### Disk launch corrections (2026-09-08)

These effects were initially mislabeled as the normal laser. They are disks;
the normal laser is a separate beam system described below.

The browser's firing call passed Buzz's yaw into a parameter also used as
pitch for untargeted shots. Facing +X therefore fired upward, facing -Z
fired backward, and facing -X fired downward. `spawnStraightDisk` now takes
separate yaw and pitch; the current controller has no vertical aiming and
uses pitch zero. Homing shots retain their existing initial yaw and
target-derived pitch. Target selection also skips zero-health creatures.
`tools/disk-probe.ts` reads the install's effect templates and checks eight
ticks of forward, level flight at all 4,096 headings, plus eight explicit
elevation cases. This verifies the launch correction, not retail parity of
the wrist origin, target selection, or charged-shot behavior.

The user's invisible-laser report exposed a second bug the flight-only
checks missed: `drawEffects` divided game-unit positions by 256 rather than
32 × 256. The resulting cards were 32 times too far from the world origin.
`effectCardPlacement` now converts centres from game units and sizes from
level units separately, preserving the renderer's Y/Z axis flips. The laser
probe also checks actual sprite-batch vertex positions at a nonzero origin.
Verified in headless Chromium with a real fired shot on level 2: a side
camera shows the bolt and spark trail beside Buzz. The follow camera can
hide the first part of flight behind his body. The wrist-bone origin is
still a gap; the firing pose's missing layer and phase progression were
subsequently fixed (docs/PLAYER.md, "Laser phases").

### Update order

For each live record, in this order:

1. life -= dt, floored at 0.
2. Move. Plain: `y += vy*dt; vy += gravity*dt; x += vx*dt; z += vz*dt`.
   Homing (flag 0x08): turn the yaw toward the target — Buzz's position
   less 0x2000 when the target is -1, otherwise the entity's hit-shape
   centre (`entity[0x21] + hitShape[animState].centre`), and a target whose
   `+0x7e` is 0 or `+0x70` negative kills the missile — at `delta * dt /
   turn`, the pitch toward it at `/ 0x14`, then fly at `0x4000 / speed`
   along them. `speed` is 0x10 (turn 8) normally, 8 for a template period
   of 0xc4 (turn `(life/16)^2 + 4`, so it tightens as it ages), and 6 when
   chasing a creature (turn `(life & 0xf) * (life < 0x20 ? 1 : 3) + 2`).
3. Animate: countdown -= dt; while it is 0 or less add the period and step
   the frame modulo `frames`. Only when `frames > 1`.
4. Spin: rotation += spin * dt, mod 0x1000.
5. Ground (flag 0x01), while alive: if moving or the floor is unknown, ask
   `FUN_00486280` for the floor under the record. If the floor is above
   `y + height*32` the record has landed: life 0, and if it went through,
   sit it on the floor and add a ground mark. Otherwise add a ground mark
   anyway (the list at `DAT_0054f098`, 47 slots: x, floor y, z, width — the
   drop shadows `FUN_00445720` draws).
6. Cull: further than 400 x 256 game units from the camera target, life 0
   and death code 0. A record with neither `keep` nor `drawn` dies: the
   drawer sets `drawn` each frame it draws the record and skips one with
   life 0 or sprite 0.
7. The mode switch, then the fade switch, below.
8. Life exactly 0 becomes -1; after the loop, every -1 record is zeroed
   (life 0, sprite 0) and the death hook runs on it.

Frame gates: `DAT_0052f1c2` and `c3` count how many 2- and 3-tick
boundaries this tick crossed; `c4`..`c8` are true on one tick in 4, 5, 6,
7, 8; `c9` one in 16; `ca` one in 32 (from the divider counters
`DAT_0052ad5a`..`62`, stepped by dt). The emitters spawn on gated ticks.

### Modes

`w`/`h` are the record's size, `per` its period byte, `L` its life. "Spawn
K in M" is the child spawner with kind K and spawn mode M. `light` is
`FUN_0044f200(x, y, z, r, g, b, 0x30)`, a screen glow drawn when the point
is on screen and the camera can see it (8 per frame). `mark` adds a ground
mark at the record's floor. `sound N` is the sound event N at the record.
`randomly` uses the random stream.

| mode | what it does | fade |
|---|---|---|
| 0 | nothing | — |
| 1 | mark under the record every tick (its height above the floor) | — |
| 2 | — | 1 |
| 3 | — | 2 |
| 4 | while L > 0x10, on 1-in-4 ticks spawn 3 in 3 (smoke trail) | 1 |
| 5 | — | 3 |
| 6 | — | 4 |
| 7 | light in its colour | 1 |
| 8 | pulse: `w = sin(L*0x80)/1024 + 0x78`, `h` the cosine; on 1-in-7 ticks while L > 5 spawn 0xf in 2 with random spin | — |
| 9 | grow 2/tick | 1 |
| 0xa | shrink 4/tick, floor 0x10 | 5 |
| 0xb | grow `per`/tick | 1 |
| 0xc | follow Buzz, rising `L * -0x22a` above him, shrink 8/tick | 1 |
| 0xd | follow Buzz, `(L + 0x10) * -400` above him, shrink 5/tick | 1 |
| 0xe | random rotation each tick; light | 1 while L < 0x20 else 6 (flicker) |
| 0xf | shrink `per`/tick, floor 1 | 1 |
| 0x10 | while L > 4 on 1-in-4 ticks spawn 0x24 in 0xf | — |
| 0x11 | while L > 4, spawn `c3` x 0x27 in 2 (the exhaust trail) | — |
| 0x12 | while L > 4 on 1-in-7 ticks spawn 0x2c in 2 at a random offset (±0x100), random spin | — |
| 0x13 | every 8th random byte re-aims vx/vz (±0x80); `w,h = sin(L*0x80)/2048 + 0x28`; dies below the water line `DAT_0053c628` | — |
| 0x14 | grow `per`/tick | 3 |
| 0x15 | ride Buzz's wrist: `x,z` = Buzz + 0x580 or 0x280 along his yaw (by `per` == 0x65), y - 0x400; while L > 4 spawn 0x2e (0x2d underwater) with Buzz's horizontal velocity halved, gravity -0x10 | 1 |
| 0x16 | grow 0x20/tick to 0x140 | — |
| 0x17 | mark at the floor; land: life 0, sit on the floor | — |
| 0x18 | shrink `per`/tick, floor 1 | 1 |
| 0x19 | mark at the floor; land: bounce (vy = -vy*6/8), die when |vy| < 0x100, sound 0x1f | — |
| 0x1a | sound 0x44; while L > 4 spawn 0x40 in 2 at a random offset (±0x1000); light | 1 |
| 0x1b | shrink `per`/tick in both axes, floor 1 | — |
| 0x1c | unless `per` == 0xc6: floor with a 100-unit mark; land: bounce vy*3/4, die when |vy| < 0x400, sound 0x68. On 1-in-7 ticks while drawn and L > 5 spawn 0xf in 2, random spin | — |
| 0x1d | **the homing disk.** Sound 0x55 on 1-in-8 ticks. Within 0x4000 (level units squared, i.e. 128) of the target's hit-shape centre: if the placement's vulnerable byte is 4 the bolt **bounces** — flags lose `hurts` and `homing`, vy = -0x400, gravity 0x30, vx/vz = the angle from target to bolt, mode 0x1e, life 0x32, sound 7 — else `FUN_00408a60(creature, angle, 4)` damages it and the bolt dies with death code 8 | — |
| 0x1e | the straight disk: while L > 4 spawn `c3` x 0x2c in a random offset (±0x80) with a third of its velocity | — |
| 0x1f | shrink 4/tick, floor 0x10 | 1 |
| 0x20 | `w,h = tri(DAT_0052ad61) * 8 + 100` (the 1-in-16 counter as a triangle wave); on `c2` ticks while drawn and L > 4 spawn 0x4d in 2 with random spin | — |
| 0x21 | shrink `per/2`/tick, floor 1 | 1 |
| 0x22 | grow `per`/tick | 7 |
| 0x23 | flat floor: `w = vy/64 + 0xfa, h = 0xfa - vy/64` (swapped when rotation bit 0x400); land: bounce vy*3/4, sound 0x71; mark | — |
| 0x24 | ride Buzz at ±sin(yaw)/10 (sign from spin), rising `(0x18 - L) * 0x120`; grow 4/tick | 1 |
| 0x25 | shrink `per`/tick, `h = w/2` | 1 |
| 0x26 | level-specific bounds on x (-0x5aa13, -0x36a56, -0x42754) that reflect vx; land: vy = -vy/2, sound 0x71; mark | — |
| 0x27 | sound 0x40; light; on 1-in-4 ticks while drawn and L > 4 spawn 0x5a in 2, random spin | 3 |
| 0x28 | shrink `per`/tick | 3 |
| 0x29 | on 1-in-4 ticks while drawn and L > 4 spawn 0x62 in 2 | — |
| 0x2a | cap vy at 0x180 and on 1-in-32 ticks re-aim vx/vz randomly; `w = sin(L*0x40) / per` | — |
| 0x2b | rotation = 0x7ff - yaw; hover 0x800 above the floor; on `c2` ticks, 1-in-4, while drawn spawn 0x6b in 2 with that rotation | — |
| 0x2c | floor; die 0x1000 below it; while drawn and L > 4: 1-in-4 spawn 0x2c in 4 with 2/3 of its velocity, 1-in-6 spawn 0x69 in 2 with its rotation, 1-in-8 spawn 0x6a in 2 rotated ±0x180..0x280 randomly | — |
| 0x2d | shrink `per`/tick, `h = w/2` | 2 |
| 0x2e | grow `per`/tick; light (b, b/2, 0) | 1 |
| 0x2f | level 12's ball (`FUN_0042b090`): trail 0x6e in 2 behind it on 1-in-4 ticks; inside the pit x (-0x256d6, 0xe0aa) z (-0x1b3e9, 0x1b297) it has a floor at y -0x12bd3 which it lands on and bounces off at 7/8, outside it none; the room's walls x (-0x29b56, 0x2a62a) z (-0x230e9, 0x22b97) reflect it; within 1,024 level units of (-0xbd7c, 0x99) in x/z it dies; any bounce sounds 0x43 | — |
| 0x30 | level 12's other ball (`FUN_0042b250`): the same "dies near (-0xbd7c, 0x99)" test, trail 0x6f in 2 | — |
| 0x31 | sound 0x40; place object 0x19 at the record and face it along the yaw (`FUN_004cce30`, `FUN_004ccc70`); on `c2` ticks while L > 4 spawn 0x2e with its own velocity | — |
| 0x32 | colour ramps up over the first 0x12 ticks (from L 0x52) | 2 |
| 0x33 | on 1-in-4 ticks while L > 4 spawn kind `per/2` in 2 with random spin; `per` == 0x76 fades | 2 if per == 0x76 |
| 0x34 | level 10's bouncer (`FUN_00425ad0`): kept inside x (-0x169eb, 0x16915) z (-0x16cef, 0x16991), each wall reflecting it with sound 0x4a | — |
| 0x35 | `w = sin(L*0x40) / per`; on 1-in-16 ticks while L > 4 spawn 0x2e in 2 with life 0x30 and size 0x2000/per | — |

**Fades**, applied after the mode, scale the template colour by the life:
1 over the last 0x20 ticks, 2 over 0x40, 4 over 0x100; 3 fades red over
0x20 and green/blue over the 0x10 before that (fire cooling); 5 the same
in three stages (red under 0x10, blue from 0xd, green from 0x19); 6 a
random 50..100% flicker each tick; 7 fades IN over the first 10 ticks (from
L 0x2a) then as 1.

### Death codes (`FUN_00410b80`)

0 nothing. 1, 2, 4: `FUN_00410850(record, 0/1/2)` — sound 0x4a (or 0xc on
level 1, 100 elsewhere, for code 1), five sparks of kind 0xd (0x1e for code
2) in mode 9 with a random period 6..12 and life period x 5, plus one kind
0xe (0x38) in mode 2 for codes 1 and 2. 3: five 0x25 in 0x11 at the top of
the card, one 0x28 in 2, a point light, sound 0xb. 5: five 0x29 in 0xf
scattered ±0x20 x 0x3c with random spin and life, a point light. 6: five
0x3e in 9. 7: three 0x25 in 0x11, sound 0xb. 8: as 3 without the 0x28.
9: three 0x11 in 4 at size 0xfa with random spin and life, sound 0xb.
10: one 0x78 in 2 at the top of the card. 11: one 0x75 in 0x1c with random
spin. Negative: one kind `-code` in mode 2.

The **point light** is `FUN_0049ee50(x, y, z, colour, radius 0x18 or
0x10, owner)`: an 8-slot list at `DAT_00830d60` (slot 0 is Buzz's own
light) that `FUN_0049eee0` reads to find the nearest light within range and
blend the character lighting toward it.

## Drawing (`FUN_00445980`)

For each record with life and a sprite: the sprite header gives the sheet
and the frame's texel rect (frame = +0x31); colour = the record's r, g, b
with alpha 0x40 for blend 0 and 0xff otherwise; blend word 0xc40 for 0 and
0x60, 0x4840 for 0x20, 0x20840 for 0x40. Without `flat`, a billboard
(`FUN_004b8e60`, the coin's) at rotation x 16, size width x height; with
it, a flat card (`FUN_004b8a30`, the coin shadow's) 10 level units below
the record with the rotation negated. `drawn` is set. Positions are game
units x 1/32.

## Touching Buzz (`FUN_004100f0`)

Each tick, for every live record with `hurts`, if Buzz's centre (0x1cc0
game units above his position, with y weighted half) is within `width +
100` level units of it, the **sprite** says what it is:

| sprite | it is | effect |
|---|---|---|
| 0, 1, 0x13 | a shot | Buzz is hurt (`FUN_004071e0(angle, 3)`), the record is left alone |
| 4, 5, 0x33, 0x34 | a missile | the record dies by its death code and Buzz is hurt... |
| 7 | | ...only while `DAT_0052f39c` (a per-level switch) |
| 0x10 | **a coin** | coins += 1 (`DAT_0052f39e`, to 99), the coin counter shows for 0xb4 ticks, sound -1 (a sequence), the fifty-coins fanfare 0x4f at exactly 50 |
| 0x15 | | dies with death code 4 |
| 0x16 | | sets `DAT_005281a4` from its life while `DAT_0052f38e` |
| 0x35, 0x36 | | death code, Buzz hurt (0x35 only while `DAT_0052f39c`) |
| 0x37 | | Buzz hurt |

But when Buzz is spinning (`DAT_0053c650 >= 0x15` and `DAT_0053c83c >
-0x78`) a missile is **deflected** instead: `hurts` and `homing` cleared,
vy = -0x400, gravity 0x30, life 0x32, vx/vz away from Buzz at 0x100 a
tick, sound 7. The hurt itself uses the angle from the last touching record
to Buzz.

## Normal wrist laser: beams, not disk effects

Corrected after the user identified the homing disks. `FUN_00434990` calls
`FUN_004a5d30` for the ordinary wrist weapon; it calls `FUN_004a4960` only
when the disk-ammo counter is nonzero. The earlier effects research and
implementation had mistaken the disk branch for the default weapon.

`src/sim/laser.ts` implements the separate four-record beam pool:

- Maximum range 0x20000 game units (4096 level units), with a 32-tick fade.
- Hits are resolved at firing time against scenery and animated creature
  ellipsoids. The nearest hit clips the beam; it does not chase an enemy.
- Aim assistance is limited to 0x80 angle units from the facing, with pitch
  clamped to ±0x40. Only creatures whose vulnerability includes bit 4 qualify.
- Normal shots are red, half-width 32 level units, damage kind 2; charged
  shots are yellow, half-width 64, damage kind 3. The temporary powered
  laser is green, half-width 32, and also uses damage kind 3.
- The tail retracts 0x800 game units per tick while the endpoint stays fixed.
- Drawing uses sprite 9 from the install, tiled over 400-level-unit segments,
  with frame 2 at the tail and frame 1 after it. U follows the beam's length;
  V runs across its glowing core. Mapping those axes the other way made bars.

With disk ammo, the port instead launches one disk and consumes one round.
At zero ammo the next shot is a beam again. Active disks are capped at six;
rejected launches do not spend ammunition. `tools/beam-probe.ts` checks beam
geometry, hit order, wall occlusion, aim limits, colours, fading and UV axes;
`tools/disk-probe.ts` checks the separate particle trajectory and placement.

Browser verification on level 4: collected a real category-7 pickup for ten
rounds, fired ten disks with ammo 9, 8, …, 0, and confirmed the next shot
created a red beam with no disk effect. A captured side view confirms the
beam's texture runs along its length instead of producing transverse bars.

Remaining differences: the muzzle uses an approximate body-relative origin,
the beam/scenery query reuses the swept-sphere implementation, and the
original's reflected beam and special first-person targeting are not ported.
Floating-point segment/ellipsoid intersections replace the integer routine.

## The disk launcher (`FUN_004a4960(aim)`, from `FUN_00434990`)

Requires disk ammunition (`DAT_00882964`) and a free disk permit
(`DAT_00882968`, initially 6); both counters drop by one when fired. Unless the camera is in modes 3+ (then the
target comes from `DAT_0050a4fc`), the nearest live creature whose
placement's vulnerable byte is nonzero, whose `+0x70` is not negative and
whose flags have both bits 0x1 and 0x2, within 4096 level units, becomes
the target: spawn kind **0x47** at the wrist (`DAT_0050a0a0/a4/a8`) with
the yaw in the gravity word (`yaw << 2`, quartered back), the target in
+0x10 and the aim in +0x20. With no target, kind **0x48** flies straight
along the yaw at `0x4000/3` a tick, rising by the aim's sine over three.
Sound 0x54 either way.

## Known spawn sites

| who | kinds |
|---|---|
| the disk launcher | 0x47, 0x48 |
| the stomp (`FUN_00434d20`) | 0x12 in 0xb, 0x13 in 0xc, 0x400 above Buzz, sound 0xf |
| the spin (`FUN_00434eb0`) | 0x16/0x17 in 2 (charge trails, rotation from the spin counter), 0x14/0x15 in 2 at 0x3000 up |
| a creature dying (`FUN_00405d20`) | 0x3d (the coin, floor set at once), 99 in 4 or 14, 0x11 in 4, 0x23 in 0xe |
| the hover bot (`FUN_00406220`) | 0x26 from each gun on animation frames 0xb6 and 0xa6, sound 0xd |
| creature exhaust (`FUN_004064a0`) | 0x27 in 2, two nozzles |
| creature beam (`FUN_00406a90`) | 0x61, then 100 in 0xf |
| creature handlers `FUN_00410540`/`FUN_004106c0` | 0x7d, then 0x7e and 0x7f together |
| push block dust | 2 |
| secrets (path tag 58) | 0x71, 0x73; `FUN_0049fab0` ends one by kind when its marker is spent |
| bosses (levels 6, 14, 15) | 0xc, 0x66 with the pitch set (homing at Buzz) |
| levels 1, 2, 6, 7, 8, 10 ticks | many: every level script decorates its rooms |

## What is not settled

The names of the two light-like helpers are read from their shape:
`FUN_0044f200` projects the point, tests the line to the camera and keeps
up to eight per frame (a glow drawn later); `FUN_0049ee50` keeps eight
positions with a colour and a countdown that the character lighting reads
(a point light). `FUN_0049e660` with a negative event number plays a sequence from
`PTR_DAT_00503828` rather than an event; the coin pickup is one.

## Ported

`src/sim/effects.ts` is the pool, the spawner, the child spawner, the tick
in the order above with every mode the switch names, the seven fades, the
twelve death codes and the touch test. `src/main.ts` fires beams or disks according to ammo, feeds
the creature port's shots and sparks in, hands hits to `damageCreature`,
turns a touched coin into a coin and a shot that landed into
`hurtPlayer()`. The cards are drawn by two additive `SpriteBatch`es beside
the coins' translucent one, with the template's spin.

Historical disk-path check in the browser on level 1 (before ammo gating):
firing with nothing in range spawns kind
0x48 and its mode-0x1e trail, one 0x2c spark per 3-tick gate; firing at a
creature spawns kind 0x47, which homes in three axes and, against one whose
`vulnerable` byte is 4, **bounces** — losing `hurts` and `homing`, taking
mode 0x1e and spawning that same trail, exactly as the decode says. Against
a creature with `vulnerable` 7 the bolt closed from 1,148 level units to
149 and landed damage kind 4, taking it from 4 health to 2, which is the
2 that `DAMAGE_KINDS[4]` carries.

Two things are not as the original has them, and each is named at its
site (modes 0x2f, 0x30 and 0x34 were read and ported on 2026-09-07): the
bolt's starting pitch is aimed at its
target because where `FUN_00434990` gets the aim it passes was not read,
and level it passes over anything much above the wrist; and the disk launcher
targets the nearest creature that is in this tick's near list rather than
the original's "near list AND explicitly awake", which would leave it with
almost nothing to aim at.

One thing the port had to get right that the decode only implies: the
original re-reads the target's hit-shape centre EVERY tick, so a bolt
tracks what it is chasing. Snapshotting it at spawn leaves the bolt
orbiting the spot a flier has left.
