# Whole-game parity audit

Reviewed 2026-09-27. This is the current audit index; older roadmap entries
may describe work that has since shipped. The first pass covers all 15 scenes,
their creature dispatch hooks, authored collision objects, existing task/prop
controllers, original level motion calls, and browser entry/exit. **It is not
a completed original-versus-port playthrough.**

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
| 10 | Elevator Hop | GUNSP hook absent; 20 dynamic collision IDs lack push controllers. | Elevators/platforms, rider attachment, gunslinger and traversal completion. |
| 11 | Al's Penthouse | BUZZARD, GUNSL and FATBLOKE hooks absent. | Level-local prop helpers, hazards and encounters. |
| 12 | The Evil Emperor Zurg | Fight controller missing despite no absent shared hook in inventory. | Implement decoded boss controller and end-to-end reward check. |
| 13 | Airport Infiltration | FATBLOKE, BUZZARD and PROSP hooks absent. | Indoor transport/platform controllers and traversal; distinct from Tarmac. |
| 14 | Tarmac Trouble | Plane motion/collision, wheels/fans, ground/climbing passengers and wheel hazards implemented and tested. FATBLOKE, BUZZARD and SMITH hooks absent. | Helicopter controller and remaining challenges; pitch/roll attachment on other movers. |
| 15 | Final Showdown | Fight controller missing; SMITH, GUNSL and PROSP hooks absent. | Multi-boss encounter, final reward, rescue/credits/save handoff. |

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
   release. The separate helicopter controller, pitch/roll attachment and original
   climb-camera transition remain open.
2. **Other level motion.** Use the original mutation call inventory to account
   for each object/controller, starting with traversal-critical platforms in
   Elevator Hop and both airport scenes. Share transform/collision integration;
   keep authored timing and state transitions specific to each level.
3. **Progression blockers.** Zurg and finale controllers, then missing challenge
   handlers (lawnmower/kite, drill, boat, dinosaur, buggy, gunslingers). There are
   16 distinct absent shared hooks across the install. Determine what shared
   wordcode already does before replacing any behavior.
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
