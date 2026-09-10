# SunnyLand Forest → MetroForge Player Animation Mapping Report

**Phase:** 4 (Player Asset Inventory)  
**Date:** 2026-09-01  
**Source Pack:** SunnyLand Forest by Ansimuz (CC0 1.0)

---

## Executive Summary

**SunnyLand Forest Available Animations:**
- idle (9 frames)
- jump (4 frames)
- fall (4 frames)
- duck (4 frames)
- climb (4 frames)
- hurt (2 frames)
- skip (8 frames)

**Total Available Clips:** 7 core animation sequences

**MetroForge Required States:** 26 gameplay states

**Coverage Analysis:**
- **Direct Source Mapping:** 5 states (idle, jump, fall, hurt, swim/climb)
- **Reusable with Timing:** 1 state (duck → crouch/interact)
- **Derivable with Authored Animation:** Multiple states from base poses
- **Unsupported/Requires Custom Animation:** ~12-15 states

---

## Detailed Animation Inventory

### ✅ Available SunnyLand Animations

#### 1. **IDLE** — Standing Neutral
**File:** `Assets/PNG/spritesheets/player/idle.png`
- **Frame Count:** 9 frames
- **Dimensions (estimated):** ~16×16 px per frame in horizontal strip
- **Source Frame Organization:** 9 individual frames in `Assets/PNG/sprites/player/player-idle/` (player-idle-1.png through player-idle-9.png)
- **Visual Content:** Standing pose with idle breathing/fidget animation
- **Loop Behavior:** Yes (continuous idle animation)
- **Quality:** Solid foundation for neutral standing state

**MetroForge Mapping:**
- ✅ **idle** (primary mapping)
- ⚠️ **swim_idle** (conditional reuse if underwater pose compatible)

**Normalization Notes:**
- Scale from ~16×16 to 64×64 target frame size (4× upscale)
- Verify foot position consistency across 9 frames
- Maintain breathing/fidget feel at gameplay scale

---

#### 2. **JUMP** — Takeoff/Airborne Rise
**File:** `Assets/PNG/spritesheets/player/jump.png`
- **Frame Count:** 4 frames
- **Dimensions (estimated):** ~16×16 px per frame in horizontal strip
- **Source Frame Organization:** 4 individual frames in `Assets/PNG/sprites/player/player-jump/` (player-jump-1.png through player-jump-4.png)
- **Visual Content:** Jump pose showing character leaving ground
- **Loop Behavior:** Yes (repeatable mid-air)
- **Quality:** Clear jump takeoff/rise pose

**MetroForge Mapping:**
- ✅ **jump** (primary mapping: jump_rise)
- ⚠️ **jump_start** (conditional: if takeoff frame is distinct enough, extract frame 1)
- ⚠️ **double_jump** (conditional: reuse with timing/VFX difference)
- ⚠️ **air_dash** (conditional: mid-air pose suitable for dash state)

**Normalization Notes:**
- 4 frames adequate for jump arc (takeoff → apex → descent)
- Verify silhouette clearly reads as airborne
- Foot/leg position must show upward momentum

---

#### 3. **FALL** — Airborne Descent
**File:** `Assets/PNG/spritesheets/player/fall.png`
- **Frame Count:** 4 frames
- **Dimensions (estimated):** ~16×16 px per frame in horizontal strip
- **Source Frame Organization:** 4 individual frames in `Assets/PNG/sprites/player/player-fall/` (player-fall-1.png through player-fall-4.png)
- **Visual Content:** Falling/descending pose
- **Loop Behavior:** Yes (repeatable during fall)
- **Quality:** Distinct falling silhouette

**MetroForge Mapping:**
- ✅ **fall** (primary mapping)
- ⚠️ **ground_slam_fall** (conditional: if pose matches downward momentum)

**Normalization Notes:**
- 4 frames support smooth fall loop
- Must visually distinguish from jump (less upward momentum)
- Arm/body position should show descent/vulnerability

---

#### 4. **DUCK/CROUCH** — Low Stance
**File:** `Assets/PNG/spritesheets/player/duck.png`
- **Frame Count:** 4 frames
- **Dimensions (estimated):** ~16×16 px per frame in horizontal strip
- **Source Frame Organization:** 4 individual frames in `Assets/PNG/sprites/player/player-duck/` (player-duck-1.png through player-duck-4.png)
- **Visual Content:** Crouch/duck pose (lower profile)
- **Loop Behavior:** Yes
- **Quality:** Usable crouch stance

**MetroForge Mapping:**
- ⚠️ **interact** (conditional: reuse for interact/examine pose)
- ❌ **ground_slam_start** (different mechanically; ground slam is downward attack, not crouch)
- ❌ **ground_slam_impact** (slam impact is explosion, not pose)

**Normalization Notes:**
- Crouch is a generic low-stance pose; limited reuse for MetroForge's ability-heavy gameplay
- Frame count (4) may be excessive for interact state
- Foot position must remain stable during crouch

---

#### 5. **CLIMB** — Vertical Locomotion
**File:** `Assets/PNG/spritesheets/player/climb.png`
- **Frame Count:** 4 frames
- **Dimensions (estimated):** ~16×16 px per frame in horizontal strip
- **Source Frame Organization:** 4 individual frames in `Assets/PNG/sprites/player/player-climb/` (player-climb-1.png through player-climb-4.png)
- **Visual Content:** Climbing/grappling pose
- **Loop Behavior:** Yes
- **Quality:** Rope/vine climbing animation

**MetroForge Mapping:**
- ✅ **grapple** (primary mapping: grapple/climbing state)
- ⚠️ **swim** (conditional: if climbing motion translates to swimming)
- ⚠️ **wall_slide** (conditional: if pose matches wall contact)

**Normalization Notes:**
- Climbing pose must show upward/vertical locomotion
- Arm position critical for readability
- Frame count (4) adequate for climbing loop

---

#### 6. **HURT** — Damage Feedback
**File:** `Assets/PNG/spritesheets/player/hurt.png`
- **Frame Count:** 2 frames
- **Dimensions (estimated):** ~16×16 px per frame in horizontal strip
- **Source Frame Organization:** 2 individual frames in `Assets/PNG/sprites/player/player-hurt/` (player-hurt-1.png, player-hurt-2.png)
- **Visual Content:** Knockback/damage response
- **Loop Behavior:** No (single-shot)
- **Quality:** Brief damage feedback animation

**MetroForge Mapping:**
- ✅ **hurt** (primary mapping)

**Normalization Notes:**
- Only 2 frames limits feedback clarity
- Verify knockback direction reads clearly
- Non-looping is correct for damage state

---

#### 7. **SKIP** — Dash/Dodge Movement
**File:** `Assets/PNG/spritesheets/player/skip.png`
- **Frame Count:** 8 frames
- **Dimensions (estimated):** ~16×16 px per frame in horizontal strip
- **Source Frame Organization:** 8 individual frames in `Assets/PNG/sprites/player/player-skip/` (player-skip-1.png through player-skip-8.png)
- **Visual Content:** Skipping/hopping movement
- **Loop Behavior:** Yes (could be non-looping single-shot)
- **Quality:** Energetic skip/hop animation

**MetroForge Mapping:**
- ⚠️ **dash** (conditional: reuse skip as ground dash if timing permits)
- ⚠️ **air_dash** (conditional: reuse for aerial movement)
- ⚠️ **double_jump** (conditional: skip apex could represent second jump)
- ❌ **wall_jump** (different mechanical context; skip is ground-based)

**Normalization Notes:**
- 8 frames is substantial; verify whether entire sequence is needed
- Skip may be too playful for combat-focused dash state
- Timing adjustment critical for gameplay responsiveness

---

## Gap Analysis: Unmapped MetroForge States

The following 19 MetroForge gameplay states have **no direct source animation** in SunnyLand Forest:

### Attack/Combat States (3 states)
1. **attack** — Ground melee strike (no direct equivalent; closest is skip momentum)
2. **attack_2** — Combo second strike (no source)
3. **attack_3** (derivative) — Combo third strike (no source) — *Note: V2 only generates attack_1 + attack_2; attack_3 is extra*

**Resolution:** These require authored derivative animation or selective reuse from available poses

### Movement States (5 states)
4. **run** — Ground sprinting (no direct source; skip is closest but differs mechanically)
5. **land** — Floor impact/recovery (no source; transition frame from fall)
6. **jump_start** — Takeoff before airborne (potentially frame 1 of jump clip)
7. **wall_slide** — Wall contact descent (climb pose could reuse, but context differs)
8. **wall_jump** — Wall repulsion takeoff (no source)

**Resolution:** Skip, fall, and jump could provide base poses with adaptation

### Ability States (11 states)
9. **swim** — Underwater locomotion (no direct equivalent; climb could proxy)
10. **swim_idle** — Underwater neutral stance (idle could work if modified)
11. **grapple** — Rope/hook pulling (climb animation could map here)
12. **phase** — Temporal/phasing ability (no source; requires authored)
13. **respawn** — Revival animation (no source)
14. **interact** — NPC/object interaction (duck pose could work)
15. **ability_acquire** — Pickup/power-up receipt (no source)
16. **air_dash** — Aerial mobility dash (skip or jump could map)
17. **double_jump** — Secondary airborne jump (jump clip could extend)
18. **ground_slam_start** — Slam startup pose (no source)
19. **ground_slam_fall** — Slam descent (fall clip could map)
20. **ground_slam_impact** — Slam landing impact (no source)

**Resolution:** Most require authored animation; some states could reuse base poses with visual/timing adjustments

---

## Mapping Decision Matrix

### Direct Source Mapping (Ready to Use)
| MetroForge State | SunnyLand Source | Action | Effort |
|------------------|------------------|--------|--------|
| idle | idle | Use as-is | LOW |
| jump | jump | Use as-is | LOW |
| fall | fall | Use as-is | LOW |
| hurt | hurt | Use as-is | LOW |
| grapple | climb | Use with context adjustment | MEDIUM |

**Count:** 5 states fully covered

### Conditional Reuse (Minor Adaptation)
| MetroForge State | SunnyLand Source | Potential | Effort |
|------------------|------------------|-----------|--------|
| swim_idle | idle | Visual palette swap only? | MEDIUM |
| swim | climb | Context change + timing | MEDIUM |
| interact | duck | Timing + frame count reduction | LOW |
| dash | skip | Timing + frame selection | MEDIUM |
| air_dash | skip | Timing adjustment + context | MEDIUM |
| double_jump | jump | Extend duration + timing | MEDIUM |
| ground_slam_fall | fall | Context change (downward attack) | MEDIUM |
| wall_slide | climb | Orientation adjustment | MEDIUM |

**Count:** 8 states with adaptation potential

### No Source (Requires Authored Derivative)
| MetroForge State | Reason | Alternative |
|------------------|--------|-------------|
| run | Ground sprinting; SunnyLand lacks horizontal movement loop | Generate from idle+skip blend or create 4-frame run |
| jump_start | Could extract frame 1 of jump clip | Frame extraction from jump |
| land | Floor contact recovery; no source equivalent | Generate 2-3 frame recovery from fall-to-idle transition |
| wall_jump | Wall repulsion takeoff; unique mechanical pose | Author 3-4 frame sequence |
| attack | Melee strike; no combat animation in pack | Author 6-frame combo starter |
| attack_2 | Combo follow-up; no source | Author 6-frame combo extension |
| phase | Phasing/temporal shift; no source | Author stylized blink/phase effect sequence |
| respawn | Revival animation; no source | Author 8-frame respawn sequence |
| ability_acquire | Pickup/power receipt; no source | Author 4-5 frame celebration/receipt |
| ground_slam_start | Slam charge-up; no source | Author 3-frame startup pose |
| ground_slam_impact | Slam impact/landing; no source | Author 5-frame impact sequence |

**Count:** 11 states with no viable source

---

## Overall Assessment

### Viability Summary
- **Total MetroForge Required States:** 26
- **Direct Source Coverage:** 5 states (19%)
- **Conditional Reuse Potential:** 8 states (31%)
- **Requires Authored Animation:** 13 states (50%)

### Quality of Available Source
**Positive:**
- ✅ Idle animation is substantial (9 frames) and well-animated
- ✅ Jump/fall/hurt are mechanically sound and gameplay-clear
- ✅ Climb pose is useful for grapple state
- ✅ Clean pixel-art style with consistent proportions
- ✅ All sprites use same baseline character proportions

**Limitations:**
- ❌ Pack is platformer-focused; lacks combat/attack animations
- ❌ No sprint/run animation (horizontal movement loop)
- ❌ Limited ability-state coverage
- ❌ No boss/advanced movement (dash, ground slam, phase)
- ❌ Minimal frame counts for some states (hurt: 2 frames, duck: 4 frames)

### Recommendation

**SunnyLand Forest Player Source: QUALIFIED FOR INTEGRATION**

**Verdict:** The pack provides **solid foundation for core movement** (idle, jump, fall, movement loops) but requires **authored derivative work** for combat, abilities, and advanced states.

**Integration Path:**
1. Normalize direct-source states (idle, jump, fall, hurt, grapple/climb) ✅
2. Adapt conditional-reuse states (swim, dash, interact, wall mechanics) ⚠️
3. Author missing states (combat, abilities, recovery, effects) 📝

**Comparison vs V2:**
- V2 is procedurally generated (limited visual richness)
- SunnyLand provides authentic pixel-art base (higher quality where available)
- SunnyLand requires supplementary authored work (estimated 30% of asset pipeline)
- Quality gate success depends on execution of hybrid approach

---

## Next Steps (Phase 5: Normalization)

### Immediate Actions
1. **Extract and scale** available spritesheets to 64×64 frame target
2. **Establish pivot/baseline** consistency across all 7 source clips
3. **Verify frame content** and alpha integrity in each sheet
4. **Create metadata JSON** for gameplay timing

### Supplementary Work Required
1. Identify most critical missing states for authored derivation
2. Determine whether to use skip/jump frames as base for run/attack loops
3. Plan pivot-based animation blending for state transitions

### Test & Validation
- Side-by-side V2 vs V3 playtest (Phase 8)
- Evaluate whether quality improvement justifies authoring burden
- Confirm collision compatibility after normalization

---

**Status:** PHASE 4 COMPLETE — Ready for Phase 5 Normalization  
**Prepared by:** MetroForge Quality Gate Workflow  
**Approval:** Proceed with cautious optimism; significant authored work required but foundation is sound
