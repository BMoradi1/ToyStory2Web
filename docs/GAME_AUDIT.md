# Whole-game parity audit

Reviewed 2026-10-01. This is the current audit index; older roadmap entries
may describe work that has since shipped. The first pass covers all 15 scenes,
their creature dispatch hooks, authored collision objects, existing task/prop
controllers, original level motion calls, and browser entry/exit. **It is not
a completed original-versus-port playthrough.**


## 2026-10-01 — Elevator Hop and Airport platforms

`src/sim/level-platforms.ts` follows Elevator tick `00425f60`, movement helper
`0048acc0`, and Airport init/tick/helpers `0042c930`, `0042ca60`, `0042c2b0`,
`0042c3e0`. This is **partial original parity**, with verified traversal primitives.

- Elevator Hop: surfaces 32/33/34 transfer wire positions from `[0,2,0]` toward
  `[1,1,1]`; real stomp impacts activate both lifts and remove collision 19.
  Sixteen compound collision objects move with near/far artwork and cable scaling.
  The original route endpoints and acceleration/deceleration are used; randomized
  waits currently use their fixed midpoint. Switch artwork and success sequence
  update; original warning flashes, shrinking barriers, and lift sounds remain open.
- Airport Infiltration: collision IDs 8/10/2/5/1 follow DAT paths 2/4/6/7/5,
  including the third vehicle's node-8 start, authored headings, acceleration,
  route recycling, and paired artwork. Original obstruction guards, synchronized
  reversal of vehicles 2/3, stomp spring response and exhaust are still absent.
- Shared: collision spatial index updates, floor/ledge carrying, jump release,
  single carry across compound-hull seams, reset restoration, pause and exit cleanup.
- `tools/level-platforms-probe.ts` checks installed paths, puzzle/barrier gating,
  landing/riding/jumping with real player physics, ledge transport, seam contacts,
  long route cycles, exact hull restoration and spatial-index cleanup.
- `tools/level-platforms-flow-check.js` verifies actual rendered vertices, stomp
  puzzle activation, pause, restart and exit for both scenes. Buzz is positioned
  above switches and placed into the stomp state; this is not an unassisted run.
- Production build and `tools/game-audit-flow-check.js` pass (all 15 entry/exit).
  Full traversal completion, natural ledge acquisition and original timing/audio
  comparison remain unverified. Existing Slime probe baseline failure is unchanged.

## Evidence and status rules

- **Verified:** a named check exercises the behavior and asserts its result.
  State whether inputs, damage, inventory or positions were injected.
- **Partial:** implementation exists, but known branches or feedback are absent.
- **Missing:** original behavior has evidence and its corresponding port path
  is absent. Missing creature hooks do not mean the whole creature is absent:
  shared wordcode can still animate or move it.
- **Investigate:** there is a lead, not enough evidence to claim parity or a bug.
- **Unreviewed:** no behavior-level comparison yet. Never interpret as passed.

Every fix needs an original function/data reference, affected internal level and
object/creature IDs, a trigger, expected observable result, and a regression
covering reset and level exit. Keep copyrighted executable dumps outside git.

## Repeatable checks

```sh
node --import tsx tools/game-audit.ts 'Toy Story 2'
node --import tsx tools/game-audit.ts 'Toy Story 2' --json
# Optional original-motion inventory from tools/ghidra/DumpAll.java output:
node --import tsx tools/game-audit.ts 'Toy Story 2' --decompile /tmp/toy2_levels.c
npm run build
# With the development server running:
node --import tsx tools/browser-shot.ts 'Toy Story 2' /tmp/game-audit.png --eval-file tools/game-audit-flow-check.js
```

The install is read-only. JSON output supports comparing inventories as handlers
are added. Parse failures produce a nonzero exit. Missing handlers remain an
explicit backlog, not a scene-load failure. Optional decompile mode follows
available level-local helpers and lists position/rotation mutation call sites;
it cannot establish branch reachability, timing or indirect calls. Seed all 15
tick addresses listed in the JSON when preparing a Ghidra dump.

[Generated inventory](GAME_INVENTORY.md) records this pass, including original
function addresses, creature slots, unmapped collision IDs and task controllers.
Regenerate it when those mappings change. A collision ID without a mapped
controller is an investigation lead: it might be fixed or controlled elsewhere.
The inventory maps push blocks and Tarmac collision object 0 to their controllers.

Validation on this pass: production build passed; all 15 DAT/terrain/creature
inventories parsed; Chromium launched all 15 scenes in selector order, simulated
ten ticks each, checked the visor, exited through the pause menu and verified
selector backdrop cleanup. The harness unlocks levels by setting disposable
save token bits. It does **not** verify collecting those tokens or progression.

## Level-by-level review queue

Names below use selector order; internal IDs swap levels 3 and 6. Every row
still needs the full checklist below. Existing tests are coverage anchors,
not evidence for untested interactions.

| Play order | Level | Confirmed gaps / implementation evidence | Next behavior comparison |
|---|---|---|---|
| 1 | Andy's House | Tin intro/fight/reward integration tested; hover wobble/sparks partial. Chair stomp and pushables implemented. | Remaining numbered props and platforms; all five token routes. |
| 2 | Andy's Neighborhood | LAWN, ZKITE and ZGCAR hooks absent. | Lawnmower/kite state machines, moving scenery and race/reset behavior. |
| 3 | Bombs Away (internal 6) | `stepBossFight` exists. | Complete boss attacks, damage windows, defeat, token and replay. |
| 4 | Construction Yard | DRILL and ZGCAR hooks absent; trailer paint implemented, outdoor cans missing. | Drill, outdoor paint and collision movement, then token routes. |
| 5 | Alleys and Gullies | BOX, BPLANE, CLOWN and ZBOAT hooks absent. | Boat/plane and clown behavior; 37 poles and 11 zip lines need route checks. |
| 6 | Slime Time (internal 3) | Dedicated slime controller exists. | Full encounter, arena effects, reward and replay comparison. |
| 7 | Al's Toy Barn | DINO, BOX and BPLANE hooks absent. | Dinosaur encounter and original moving-collision calls. |
| 8 | Al's Space Land | BBUGGY and ZGCAR hooks absent; prop-gated texture effect missing. | Buggy challenge, `0052c9b8 & 1` effect trigger and reward paths. |
| 9 | Toy Barn Encounter | Dedicated pod controller and beam tests exist; ZGCAR hook absent. | Full fight/summon cycles and reward; determine the absent hook's role. |
| 10 | Elevator Hop | Wire puzzle and both compound lifts implemented; GUNSP hook absent. | Exact lift obstruction/random-wait parity, feedback, gunslinger and full traversal completion. |
| 11 | Al's Penthouse | BUZZARD, GUNSL and FATBLOKE hooks absent. | Level-local prop helpers, hazards and encounters. |
| 12 | The Evil Emperor Zurg | Entrance, attacks, recovery, defeat, save bit and victory/movie handoff implemented in `zurg-boss.ts`. Installed-data and focused browser checks pass. | Unassisted combat, original-versus-port camera/render comparison and detail-dependent particles. |
| 13 | Airport Infiltration | Five authored transport routes implemented; FATBLOKE, BUZZARD and PROSP hooks absent. | Transport obstruction/reversal and effects, full traversal; distinct from Tarmac. |
| 14 | Tarmac Trouble | Plane motion/collision, wheels/fans, ground/climbing passengers, wheel hazards and helicopter hover/rotors/token motion and light puzzle/lowering implemented and tested. Slinky timed-path rules and retry implemented. Near/far scenery sway, rain/plane sound, rain particles and lightning/thunder restored. Blacksmith recovery, defeat and delayed reward implemented; axe throws implemented; hit flashing missing. FATBLOKE and BUZZARD hooks absent. | Remaining creature hooks and other ambient effects; pitch/roll attachment on other movers. |
| 15 | Final Showdown | Stage and three fighter controllers implemented in `finale.ts`; rendered entrance, attacks, rescue, completion save, ending/credits and replay tested. | Natural combat completion; exact roll/framing and voice/pitch parity. |

## Prioritized work

1. **Tarmac plane and moving ledge attachment — implemented.**
   `src/sim/tarmac-plane.ts` ports `0042dcb0` (tick `0042e790`): near IDs 0–15
   excluding helicopter 3, IDs 84–86, far IDs 16–30, independent fans/wheels,
   smoothed collision object 0 and wheel damage. Shared absolute collision
   transforms and `moving-platform.ts` carry floor contacts and acquired moving
   ledges without attaching unrelated airborne players or wall contacts. The node probe verifies
   orbit/LOD poses, wheel bounds, collision reset/indexing, angle wrap, landing,
   riding, walking and jumping. The browser check verifies actual near/far
   vertices, landing/riding/jumping, pause, restart, wheel damage/invulnerability,
   fall respawn and selector exit/re-entry. Both position Buzz for focused checks;
   this is not a full Tarmac playthrough. The expanded browser regression also
   acquires an actual moving ledge, follows the climb, pauses/resumes and lands
   aboard. `ledge-probe.ts` covers moving anchor stability and early damage/death
   release. Helicopter helper `0042e1d0` is now ported in `tarmac-helicopter.ts`: hover,
   near/far rotors and token artwork/collection coordinates. The node and combined
   Tarmac browser regressions cover motion, phase wrap, pickup collection, pause,
   reset and re-entry. The light puzzle and helicopter sound are now implemented too:
   `tarmac-lights-probe.ts` validates 200 generated boards and original timing;
   `tarmac-lights-flow-check.js` uses real pad ground-pounds for failure/retry,
   success/lowering/camera, pause, reward collection, restart and exit. It
   positions Buzz above pads and at the lowered token; this is not an unassisted
   traversal. Pitch/roll attachment and the original climb-camera transition
   remain open.
   Slinky's slot-2 challenge now ports `0042e790`: offer/reminder, clock,
   jump/slime/timeout failure, token withdrawal and retry. The node probe
   `tarmac-path-probe.ts` checks original boundaries and reward lifecycle.
   `tarmac-path-flow-check.js` uses actual dialogue, jump input, slime collision,
   timeout, retry, token collection, pause, restart and exit, with positions
   supplied for focused checks. Idle chatter and full-route traversal remain open.
   Near/far scenery 69/70 now sways using the original tick's relative-angle
   helper. A shared sound-bank parser fix preserves unused slots, restoring
   Tarmac's rain/thunder/plane mappings; rain and plane-engine event calls now
   run alongside the helicopter. `tarmac-scenery-probe.ts` checks 4096 phases
   and all 17 banks. `tarmac-scenery-flow-check.js` checks rendered motion,
   decoded audio, voice reuse, pause/mute, reset and exit/re-entry. Thunder
   scheduling, lightning and rain particles are now implemented by the weather pass below.
   Weather now ports `0044ed60/0044ed90/0044f010` and the weather portion of
   `0042e790`: bounded rain pool, installed page-23 rain artwork, ground splashes,
   lightning envelope and delayed thunder. Secondary sprite-page batching fixes
   the wrong-sheet rendering path. Node probes and the weather browser check
   cover timing, actual cards/splashes, framebuffer brightening, pause/reset and
   mid-flash exit/re-entry. The latter positions Buzz for focused checks. Exact
   brightness modulation across the separate HUD/backdrop layers remains open,
   along with the absent shared creature hooks. Beacon flares and nearby Buzz
   lighting already exist in `lens-flare.ts` and `scripted-light.ts`; the
   `00830d78..00830d8e` registers describe lighting, not aiming targets.
   `special-light-probe.ts` checks Tarmac's radial colour split and cutoff.
   Blacksmith combat is now **partial**: the level-local subset of `0042d3e0`
   and `0042e790` restores 60-tick hit recovery, the health-below-10 defeat
   script entry, contact-hazard removal, sound sequence -2 and slot-4 reveal
   after the original phase countdown. The HUD uses its 20-point health span.
   `tarmac-smith-probe.ts` reads the installed placement and executes the defeat
   wordcode; it covers recovery boundaries, reward after model removal, reset
   and finale isolation. `tarmac-smith-flow-check.js` checks actual taunt/wake,
   recovery, defeat/reward, restart and exit/re-entry in Chromium. Both inject
   hits; the browser also positions Buzz. Axe attacks now follow the original
   chase/range gate, animation 3/script 24, 63-tick release and frame-47 movement
   handoff (`0042d47f..0042d57d`). Kind 0x66 leaves animated part 4 at offset
   (180,-150,-50), homes horizontally on Buzz and raises sound 0xa7.
   `tarmac-smith-attack-probe.ts` checks boundaries, repeat/cancel/reset,
   finale isolation and installed projectile movement/contact damage. The
   browser regression reaches the attack through authored wordcode and checks
   release/sound, pause during windup and restart cleanup. Hit flashing remains
   missing; this is not a complete encounter playthrough.
   The shared SMITH hook stays listed as absent in the generated inventory:
   recovery/defeat live in the Tarmac task controller; the level-gated attack
   runs after the shared creature update. The finale controller remains absent.
2. **Other level motion.** Use the original mutation call inventory to account
   for each object/controller, starting with traversal-critical platforms in
   Elevator Hop and both airport scenes. Share transform/collision integration;
   keep authored timing and state transitions specific to each level.
3. **Progression blockers.** Missing challenge handlers (lawnmower/kite, drill, boat, dinosaur, buggy, gunslingers). There are
   16 distinct absent shared hooks across the install. Determine what shared
   wordcode already does before replacing any behavior.
   Zurg's controller is now implemented from `0042b300/0042b3a0`, including
   entrance and death cuts, both projectile types, 60-tick hit recovery,
   retaliation, inner-radius constraint, falling death, boss-save bit and
   movie/victory handoff. `zurg-boss-probe.ts` checks installed placement,
   exact timing/selection boundaries and one-shot progression requests.
   `zurg-boss-flow-check.js` exercises entrance, pause, authored volleys,
   recovery/defeat, save, movie exit, restart and replay. It positions/protects
   Buzz and injects damage; natural combat completion remains unverified.
   `zurg-projectile-probe.ts` checks installed bouncing/homing effects, trails,
   spin deflection and contact damage. All 15 scenes still pass entry/exit.
   Broader validation found a pre-existing `slime-probe.ts` triangle assertion
   failure (2385 actual versus 2277 expected), reproduced from unchanged commit
   `fbfaf47`; investigate the probe/model expectation separately.
   Older decode notes incorrectly described descent as rising, the inner
   clamp as an outer bound, and lighting as aiming; these are corrected.
   Final Showdown now ports `0042faa0/0042fc50` and `0042f310/0042f530/0042f7b0`:
   staged entrance with retained near/far mesh identity, bounce/wobble, all three
   attacks, recovery/defeat, spacing/bounds, camera roll, rescue, save and the
   existing ending/credits handoff. Shared level cleanup now runs before credits,
   not only upon selector reload. `finale-probe.ts` checks installed wordcode,
   exact timers, two-shot gunslinger bursts, all six defeat orders, rescue/win
   timing and reset. `finale-flow-check.js` follows authored attacks, measures
   stage vertex movement/pause/reset, and checks save, credits and replay.
   The browser positions/protects Buzz and injects damage. An unassisted win
   remains unverified; dynamic sound pitch, exact camera-roll/framing comparison
   and per-character voice overlap gating remain open.
4. **Puzzles, hazards and rewards.** Outdoor paint cans, remaining prop flags,
   all token routes, power-up unlocks, collectible counts and replay behavior.
5. **Presentation parity.** Triggered effects and spatial sounds, texture gates,
   Tin cosmetics, camera/cutscene transitions and near/far visibility.

## Required checklist for each level

Track these separately; one passing screenshot cannot close a level.

| Area | Required observations |
|---|---|
| Moving scenery | Each authored render/collision mutation accounted for; motion phases, triggers, near/far meshes, camera zones. |
| Traversal | Moving-platform passengers, jumping off/on, ledge attachment, poles, zip lines, power-up routes and checkpoints. |
| Enemies / bosses | Every placed type and level-owned controller; wake/sleep, attacks, damage windows, death, respawn and rewards. |
| Puzzles / progression | Each token's actual acquisition route, challenge start/fail/retry, power-up part/unlock, save and replay. |
| Hazards | Contact, damage/knockback, invulnerability timing, death and restoration of prop state. |
| Effects / audio | Ambient and triggered sounds, particles, texture animations, lights, render distance and cleanup. |
| Lifecycle | Pause/dialogue freeze, death, restart, exit/re-entry, selector cleanup, save/load and final transitions. |

Reuse focused probes and browser checks already under `tools/`. Add a behavior
check when closing a gap, then reference it here. Natural transitions matter:
the Tin regression now follows the authored intro and attack cycle, although it
still positions Buzz and injects damage. Do not revive the old claim that its
intro handoff is missing. Full unassisted completion of all levels remains
unreviewed, including completion using only naturally obtained unlocks.

Tarmac regressions: `node --import tsx tools/tarmac-plane-probe.ts 'Toy Story 2'`
and `tools/tarmac-plane-flow-check.js` through the browser harness. Existing
`tools/push-blocks-probe.ts` also passes after the spatial-index change.
