# Generated game coverage inventory

Regenerate: `node --import tsx tools/game-audit.ts "Toy Story 2"`. Internal level IDs 3 and 6 differ from play order.

This snapshot includes `--decompile /path/to/toy2_levels.c` motion evidence. Supply a fresh local DumpAll.java output to regenerate that section.

This is static inventory, **not** a completed playthrough or parity score. Missing shared handlers are explicit absent dispatch entries; level controllers may own related behavior. Unmapped dynamic collision objects need review, not automatic movement. Mapped controllers currently include push blocks and the Tarmac plane.

| Play order | Level | Scene parses | Creature hooks absent | Dynamic collision IDs without mapped controller | Poles / zip lines | Boss controller |
|---|---|---|---|---|---|---|
| 1 (1) | andy's house | yes | — | 8, 9, 10, 12, 13, 14, 15 | 14 / 2 | taunt/reward hooks; inspect per-creature combat |
| 2 (2) | andy's neighborhood | yes | LAWN (12), ZGCAR (14), ZKITE (15) | 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 12 | 6 / 5 | taunt/reward hooks; inspect per-creature combat |
| 3 (6) | bombs away | yes | — | — | 0 / 0 | tasks.ts stepBossFight |
| 4 (4) | construction yard | yes | ZGCAR (14), DRILL (22) | 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26 | 5 / 0 | taunt/reward hooks; inspect per-creature combat |
| 5 (5) | alleys and gullies | yes | BOX (25), BPLANE (24), CLOWN (32), ZBOAT (27) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 19, 20, 21, 22, 23, 24, 25 | 37 / 11 | taunt/reward hooks; inspect per-creature combat |
| 6 (3) | slime time | yes | — | — | 0 / 0 | slime-boss.ts |
| 7 (7) | al's toy barn | yes | DINO (26), BOX (25), BPLANE (24) | 0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20 | 4 / 1 | taunt/reward hooks; inspect per-creature combat |
| 8 (8) | al's space land | yes | ZGCAR (14), BBUGGY (47) | 2 | 9 / 9 | none |
| 9 (9) | toy barn encounter | yes | ZGCAR (14) | — | 0 / 0 | pod-boss.ts |
| 10 (10) | elevator hop | yes | GUNSP (31) | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 | 0 / 1 | taunt/reward hooks; inspect per-creature combat |
| 11 (11) | al's penthouse | yes | BUZZARD (41), GUNSL (45), FATBLOKE (46) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 23, 24, 25, 26 | 7 / 0 | taunt/reward hooks; inspect per-creature combat |
| 12 (12) | the evil emperor zurg | yes | — | — | 0 / 0 | MISSING |
| 13 (13) | airport infiltration | yes | FATBLOKE (46), BUZZARD (41), PROSP (61) | 0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14 | 13 / 2 | taunt/reward hooks; inspect per-creature combat |
| 14 (14) | tarmac trouble | yes | FATBLOKE (46), BUZZARD (41), SMITH (58) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 | 9 / 1 | taunt/reward hooks; inspect per-creature combat |
| 15 (15) | final showdown | yes | SMITH (58), GUNSL (45), PROSP (61) | — | 0 / 0 | MISSING |

## Missing shared behavior hooks

- andy's neighborhood: LAWN, type 12, slots 0 → FUN_00418ce0.
- andy's neighborhood: ZGCAR, type 14, slots 7, 12, 13, 14, 18, 20, 21 → LAB_004064a0.
- andy's neighborhood: ZKITE, type 15, slots 26 → FUN_004189c0.
- construction yard: ZGCAR, type 14, slots 0, 27 → LAB_004064a0.
- construction yard: DRILL, type 22, slots 24 → FUN_0041b780.
- alleys and gullies: BOX, type 25, slots 0, 8, 30 → LAB_004068e0.
- alleys and gullies: BPLANE, type 24, slots 1, 2, 9, 10, 31, 32 → LAB_00406960.
- alleys and gullies: CLOWN, type 32, slots 3 → FUN_0041ddb0.
- alleys and gullies: ZBOAT, type 27, slots 5, 15, 16, 17 → FUN_0041df70.
- al's toy barn: DINO, type 26, slots 0 → FUN_00420af0.
- al's toy barn: BOX, type 25, slots 16, 19 → LAB_004068e0.
- al's toy barn: BPLANE, type 24, slots 17, 18, 20, 21 → LAB_00406960.
- al's space land: ZGCAR, type 14, slots 12, 23, 28, 29, 30, 31, 35 → LAB_004064a0.
- al's space land: BBUGGY, type 47, slots 40 → FUN_00422660.
- toy barn encounter: ZGCAR, type 14, slots 10 → LAB_004064a0.
- elevator hop: GUNSP, type 31, slots 8 → FUN_00425700.
- al's penthouse: BUZZARD, type 41, slots 8, 15, 19, 24, 28, 30, 31 → LAB_00406c70.
- al's penthouse: GUNSL, type 45, slots 11 → FUN_004282d0.
- al's penthouse: FATBLOKE, type 46, slots 16, 18, 22, 23, 25, 26, 32 → LAB_00406a90.
- airport infiltration: FATBLOKE, type 46, slots 9, 10, 11, 17, 21, 22, 23, 25, 26, 27, 28 → LAB_00406a90.
- airport infiltration: BUZZARD, type 41, slots 15, 16, 19, 20, 24 → LAB_00406c70.
- airport infiltration: PROSP, type 61, slots 32 → FUN_0042be60.
- tarmac trouble: FATBLOKE, type 46, slots 0, 1, 3, 8, 10, 11, 15, 16, 27, 28, 29, 30 → LAB_00406a90.
- tarmac trouble: BUZZARD, type 41, slots 2, 4, 5, 9, 13, 14, 17, 18, 21, 22, 23, 24, 25, 26 → LAB_00406c70.
- tarmac trouble: SMITH, type 58, slots 46 → FUN_0042d3e0.
- final showdown: SMITH, type 58, slots 0 → FUN_0042d3e0.
- final showdown: GUNSL, type 45, slots 1 → FUN_004282d0.
- final showdown: PROSP, type 61, slots 2 → FUN_0042be60.
- andy's house: types without a shared creature definition COTBIT (11), BOPEEP (7), ZURG1 (3), HAMM (10); may be NPCs, props or level-owned, not automatically missing behavior.
- andy's neighborhood: types without a shared creature definition ZURG1 (3), HAMM (10); may be NPCs, props or level-owned, not automatically missing behavior.
- construction yard: types without a shared creature definition PAINT (17), ZURG1 (3), FTYKE (18), HAMM (10), SLINKY (44); may be NPCs, props or level-owned, not automatically missing behavior.
- alleys and gullies: types without a shared creature definition ZURG1 (3), SLINKY (44), HAMM (10); may be NPCs, props or level-owned, not automatically missing behavior.
- al's toy barn: types without a shared creature definition HAMM (10); may be NPCs, props or level-owned, not automatically missing behavior.
- al's space land: types without a shared creature definition HAMM (10), ZURG1 (3); may be NPCs, props or level-owned, not automatically missing behavior.
- toy barn encounter: types without a shared creature definition ZURG1 (3); may be NPCs, props or level-owned, not automatically missing behavior.
- elevator hop: types without a shared creature definition HAMM (10), RATTLE (33); may be NPCs, props or level-owned, not automatically missing behavior.
- al's penthouse: types without a shared creature definition HAMM (10), RATTLE (33); may be NPCs, props or level-owned, not automatically missing behavior.
- airport infiltration: types without a shared creature definition HAMM (10), RATTLE (33); may be NPCs, props or level-owned, not automatically missing behavior.
- tarmac trouble: types without a shared creature definition RATTLE (33), SLINKY (44), HAMM (10), LUGMAN (60); may be NPCs, props or level-owned, not automatically missing behavior.

## Existing task and prop coverage (implementation presence only)

- andy's house: tasks potato, hamm, boss, race, hintNpc, findFive; 7 push blocks; motion none mapped; stomp-driven object IDs 23.
- andy's neighborhood: tasks boss, race, hamm, hintNpc, findFive; 2 push blocks; motion none mapped; stomp-driven object IDs none.
- bombs away: tasks bossFight; 0 push blocks; motion none mapped; stomp-driven object IDs none.
- construction yard: tasks boss, challenge, potato, hamm, hintNpc, findFive; 2 push blocks; motion none mapped; stomp-driven object IDs 33, 34, 35, 48, 49, 50, 51, 52, 53.
- alleys and gullies: tasks boss, challenge, hamm, hintNpc, findFive; 4 push blocks; motion none mapped; stomp-driven object IDs none.
- slime time: tasks slimeBoss; 0 push blocks; motion none mapped; stomp-driven object IDs none.
- al's toy barn: tasks potato, fetch, boss, hamm, hintNpc, findFive; 2 push blocks; motion none mapped; stomp-driven object IDs none.
- al's space land: tasks reachBox, hamm, hintNpc, findFive; 3 push blocks; motion none mapped; stomp-driven object IDs none.
- toy barn encounter: tasks none; 0 push blocks; motion none mapped; stomp-driven object IDs none.
- elevator hop: tasks potato, offer, boss, hamm, hintNpc, findFive; 0 push blocks; motion none mapped; stomp-driven object IDs none.
- al's penthouse: tasks boss, challenge, hamm, hintNpc, findFive; 3 push blocks; motion none mapped; stomp-driven object IDs none.
- the evil emperor zurg: tasks none; 0 push blocks; motion none mapped; stomp-driven object IDs none.
- airport infiltration: tasks boss, challenge, potato, hamm, hintNpc, findFive; 1 push blocks; motion none mapped; stomp-driven object IDs none.
- tarmac trouble: tasks offer, boss, hamm, hintNpc, findFive; 0 push blocks; motion tarmac-plane.ts (collision 0), tarmac-helicopter.ts (artwork/pickup motion); stomp-driven object IDs none.
- final showdown: tasks none; 0 push blocks; motion none mapped; stomp-driven object IDs none.

## Original motion call inventory

Static call sites from each tick and available level-local helpers. Conditions, speed, timing, indirect calls and port parity require review. Zero calls does not prove no movement.


### andy's house (tick 00417680)

- 00417680: render position; object 19.
- 00417680: render position; object 20.
- 00417680: render position; object 26.
- 00417680: render rotation; object 4.
- 00417680: render position; object 6.
- 00417510: render rotation; object computed: inspect original.
- 00417380: render rotation; object computed: inspect original.
- 00417380: render position; object computed: inspect original.
- 00417680: render rotation; object 23.
- 00417680: render rotation; object 14.

### andy's neighborhood (tick 004190c0)

- 004190c0: render position; object 6.
- 004190c0: collision translation velocity; object 7.
- 004190c0: render rotation; object 4.
- 004190c0: render rotation; object 8.
- 004190c0: render rotation; object 9.
- 004190c0: render rotation; object 10.
- 004190c0: render rotation; object 21.
- 004190c0: render rotation; object 5.
- 004190c0: render rotation; object 11.
- 004190c0: render rotation; object 30.
- 004190c0: render rotation; object 31.
- 004190c0: render position; object 25.

### bombs away (tick 00420060)


### construction yard (tick 0041c640)

- 0041c640: render position; object 13.
- 0041c640: collision translation velocity; object 1.
- 0041c640: collision translation velocity; object 7.
- 0041bee0: render position; object computed: inspect original.
- 0041bee0: collision translation velocity; object computed: inspect original.
- 0041c640: collision translation velocity; object 2.
- 0041c640: collision translation velocity; object 8.
- 0041c640: collision translation velocity; object 3.
- 0041c640: collision translation velocity; object 9.
- 0041c640: collision translation velocity; object 4.
- 0041c640: collision translation velocity; object 6.
- 0041c640: collision angular velocity; object 26.
- 0041c640: render rotation; object 28.
- 0041c640: render rotation; object 29.
- 0041bc20: render position; object computed: inspect original.
- 0041c640: render rotation; object 65.
- 0041c640: render rotation; object 66.
- 0041c640: render rotation; object 67.
- 0041c640: render position; object 68.
- 0041c640: collision translation velocity; object 21.

### alleys and gullies (tick 0041e880)

- 0041e880: collision translation velocity; object 5.
- 0041e880: collision translation velocity; object 8.
- 0041e150: collision translation velocity; object computed: inspect original.
- 0041e150: render position; object computed: inspect original.
- 0041e880: collision translation velocity; object 7.
- 0041e880: collision translation velocity; object 6.
- 0041e880: collision translation velocity; object 9.
- 0041e880: collision translation velocity; object 10.
- 0041e880: collision translation velocity; object 11.
- 0041e880: collision translation velocity; object 12.
- 0041e880: render rotation; object 5.
- 0041e880: render rotation; object 7.
- 0041e880: render rotation; object 10.
- 0041e880: render rotation; object 11.
- 0041e880: render rotation; object 20.
- 0041e880: render position; object 12.
- 0041e880: render position; object 13.
- 0041e880: render rotation; object 12.
- 0041e880: render rotation; object 13.
- 0041e880: render position; object 18.
- 0041e880: render position; object 19.
- 0041e880: render rotation; object 18.
- 0041e880: render rotation; object 19.
- 0041e880: render position; object 15.
- 0041e880: render rotation; object 2.
- 0041e880: render rotation; object 3.
- 0041e880: render position; object 1.
- 0041e880: render position; object 52.

### slime time (tick 0041aa10)

- 0041aa10: render rotation; object 0.
- 0041aa10: render position; object 0.

### al's toy barn (tick 00421340)

- 00421340: render rotation; object 33.
- 00421340: collision translation velocity; object 0.
- 00421340: collision angular velocity; object 0.
- 00421340: render position; object 0.
- 00421340: render position; object 1.
- 00421340: render rotation; object 1.
- 00421340: render position; object 31.
- 00421340: collision angular velocity; object 1.
- 00421340: collision angular velocity; object 2.
- 00421340: collision angular velocity; object 3.
- 00421340: collision angular velocity; object 4.
- 00421340: render rotation; object 2.
- 00421340: render position; object 21.
- 00421340: render position; object 22.
- 00421340: render position; object 11.
- 00421340: collision translation velocity; object 10.
- 00421340: render position; object 24.
- 00421340: collision translation velocity; object 14.
- 00421340: render position; object 18.
- 00421340: render position; object 19.
- 00421340: render position; object 20.

### al's space land (tick 00423200)

- 00423200: render rotation; object computed: inspect original.
- 00423200: render position; object 10.
- 00423200: render position; object 11.
- 00423200: render position; object 12.
- 00423200: render position; object 16.
- 00423200: render rotation; object 10.
- 00423200: render rotation; object 11.
- 00423200: render position; object 53.
- 00423200: render position; object 20.
- 00423200: render position; object 21.
- 00423200: render position; object 22.
- 00423200: render position; object 23.
- 00423200: render rotation; object 19.
- 00423200: render position; object 17.
- 00423200: render position; object 18.
- 00423200: render position; object 25.

### toy barn encounter (tick 00424490)


### elevator hop (tick 00425f60)

- 00425f60: render rotation; object computed: inspect original.
- 00425f60: render rotation; object 4.
- 00425f60: render rotation; object 6.
- 00425f60: render rotation; object 5.
- 00425680: render position; object 18.
- 00425680: render position; object 19.
- 00425680: render position; object 20.
- 00425f60: collision translation velocity; object computed: inspect original.
- 00425f60: collision translation velocity; object 1.
- 00425f60: render position; object computed: inspect original.
- 00425f60: collision translation velocity; object 0.
- 00425f60: render rotation; object 17.
- 00425f60: render rotation; object 16.
- 00425f60: render position; object 110.

### al's penthouse (tick 0042a130)

- 0042a130: render position; object computed: inspect original.
- 00428890: render rotation; object computed: inspect original.
- 00429910: render position; object computed: inspect original.
- 004293d0: render position; object 44.
- 00429fb0: render position; object computed: inspect original.
- 00429fb0: collision translation velocity; object computed: inspect original.
- 00428e70: render rotation; object 38.
- 00428e70: render rotation; object 80.
- 00428e70: render position; object 38.
- 00428e70: render position; object 80.
- 0042a130: render position; object 49.
- 004295b0: render rotation; object computed: inspect original.
- 0042a130: render rotation; object 25.
- 0042a130: render rotation; object 26.
- 0042a130: render rotation; object 28.
- 0042a130: render rotation; object 90.
- 0042a130: render position; object 87.
- 0042a130: render position; object 64.
- 00429800: render rotation; object computed: inspect original.

### the evil emperor zurg (tick 0042b3a0)


### airport infiltration (tick 0042ca60)

- 0042ca60: render rotation; object 0.
- 0042ca60: render rotation; object 1.
- 0042ca60: render rotation; object 2.
- 0042ca60: render rotation; object 3.
- 0042c3e0: collision translation velocity; object computed: inspect original.
- 0042c3e0: render position; object computed: inspect original.

### tarmac trouble (tick 0042e790)

- 0042dcb0: collision angular velocity; object 0.
- 0042dcb0: collision translation velocity; object 0.
- 0042dcb0: render position; object computed: inspect original.
- 0042dcb0: render rotation; object computed: inspect original.
- 0042dcb0: render rotation; object 10.
- 0042dcb0: render rotation; object 11.
- 0042dcb0: render rotation; object 13.
- 0042e1d0: render position; object 3.
- 0042e1d0: render position; object 48.
- 0042e1d0: render position; object 66.
- 0042e1d0: render position; object 67.
- 0042e1d0: render position; object 68.
- 0042e1d0: render position; object 116.
- 0042e1d0: render position; object 49.
- 0042e1d0: render position; object 50.
- 0042e1d0: render rotation; object 48.
- 0042e1d0: render rotation; object 50.
- 0042e790: render rotation; object 69.
- 0042e790: render rotation; object 70.

### final showdown (tick 0042fc50)

- 0042fc50: render position; object 0.
- 0042fc50: render position; object 1.
- 0042fc50: render position; object 3.
- 0042fc50: render position; object 4.
