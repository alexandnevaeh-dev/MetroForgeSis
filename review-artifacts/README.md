# Foundry visual-slice review pack

PR: https://github.com/alexandnevaeh-dev/MetroForgeSis/pull/4 (draft)  
Branch: `cursor/foundry-visual-recapture-acbb`  
Visual approval: **rejected as a finished slice**. MASS / LARGE / RC stay **blocked**. Do not merge.

**Current actor pass:** original authored courier art (`packages/assets/authored/foundry-courier/`) replaces the 4-color procedural silhouettes. See [VISUAL_ACCEPTANCE.md](VISUAL_ACCEPTANCE.md), [assets/PROVENANCE.md](assets/PROVENANCE.md), and 8× comparisons in [assets/](assets/). Spawn QA and playtest must still be re-run on this revision; passing them is **not** Approve Visual Direction.

Actors were previously procedural courier silhouettes (not mustard cubes). Spawn `gameplay_screenshot_qa` scored **100** (was 40) after the playable-band framing pass. See [room05/](room05/).

## Exact commit and generation

| Field | Value |
|---|---|
| Code commit (after stills) | `30d350a` (warm beacons) on the playable-band framing pass |
| Message | composition + ability-shrine camera pass + palette color pass + readability pass (brighter ledges, courier silhouette, shrine focal core) |
| Before stills | Pre-pass recapture of the same prompt/seed, generated from `a04ce27` |
| Slug | `foundry-visual-slice-spawn2` (before: `foundry-visual-slice-pr2`) |
| Prompt | Ashen Foundry: a lone courier delves a ruined mechanical forge of brass and sooted iron, side-view metroidvania |
| Profile | `VISUAL_VERTICAL_SLICE` |
| Mode | `LOCAL_ONLY` |
| Archetype | `SIDE_VIEW_METROIDVANIA` |
| Seed | `20260909` |
| Godot | `4.7.1.stable.official.a13da4feb` |
| Viewport | 1920×1080 |
| Windowed driver | `opengl3` (Linux) |
| `visualSliceApproved` | `false` |
| `visualReviewStatus` | `VISUAL_SLICE_REVIEW_REQUIRED` |

After PNGs are byte-identical to `GeneratedGames/foundry-visual-slice-spawn2/reports/{02,04,05,06,07}*.png` from that run.

## Traversal continuity — verified (not inferred from stills)

The vanished tall columns were decorative runtime `RearWall` ribs (`collision_enabled = false`),
not climb geometry. Evidence:

- **Collidable geometry is identical before vs after — positions and transforms included.** For
  every room a fingerprint of each `CollisionShape2D` (its parent, its `RectangleShape2D` size, and
  the full parent-chain of `position`/`rotation`/`scale`/`transform`) hashes identically between
  before (`foundry-visual-slice-pr2`) and after. Counts and sizes alone would not prove this; the
  fingerprint covers placement too.
- **Collision overlays** in [`collision/`](collision/) render each room's real collidable
  surfaces (floor + platforms, green) over the art for rooms 02/04/05/07.
- **Runtime gates pass:** `world_connectivity`, `world_reachability` (all rooms reachable via
  progressive ability pickup), `movement_feasibility` (ability gates align with jump/dash reach),
  and `godot_playtest` **8/8** (persona `victory_rusher`, ~38s, rooms 000–009) on Godot 4.7.1.

### Camera visibility during play (not just collision)

Unchanged collision proves geometry preservation; separately, `tools/camera_visibility_audit.gd`
places the player at the **approach / jump apex / landing** of every required target and reads the
**real gameplay camera** (the player's `CameraDirector`, the same path both capture systems use).
See [`camera-visibility/`](camera-visibility/) (`AUDIT.md`, `audit.json`, and the
approach→apex→landing triptych).

- **84 checks across all 10 rooms; 0 not-visible.** 68 fully-in-view; the 16 partials are all
  room-exit doors at the frame edge (the exit is on-screen). Every elevated **platform landing** is
  fully visible at approach, apex, and landing — the player sees the destination before committing.
- **Both capture paths reflect the gameplay camera.** `QualityPresentation._playable_band` and
  `RuntimeSmokeTest._sync_visual_camera` compute the band with identical constants (floor→highest
  platform − 140 apex, full height when a room exits upward, top crop capped at 45%), and the audit
  harness drives the actual `CameraDirector`.

## Readability pass in these stills

- **Platform edges:** floor lifted off the soot background, platform ledges brighter than walls,
  and a bright top lip on platform/one-way tiles — walls and the overall scene are not brightened.
- **Courier silhouette:** head + torso + two legs + carrying pack, with the accent limited to a
  small warm helmet band and the pack instead of a full cyan cap.
- **Focal points:** shrine/save/ability props get a bright luminous core so a checkpoint reads as a
  focal point.
- **Framing:** the playable-band camera (floor + platforms + jump apex) is now applied to **every**
  side-view room, not just the shrine, so rooms 02/04 frame the action instead of a tall empty
  background. Required routes are preserved — full room width is always kept, rooms that exit
  upward keep full height, and the top crop is capped at 45%. Collision geometry is unchanged
  (verified above).
- **Blue beacons — traced and fixed:** the cold-blue vertical lines were the far-plate vault ribs
  in `paintFarVaultAndLanterns`, hardcoded to `(34,52,108)` (with gold `(168,148,78)` lanterns),
  scaled up on the far plate. They are now derived from the palette (warm structural rib + warm
  amber lantern), and the near-parallax chains are warmed too.

## What the after pass changed (on top of `ddbb803`)

Two palette-driven color fixes were added so the mechanical-forge identity actually reaches the
pixels, without touching traversal, collision, or the camera crop:

- **Dense teal tile stacks → gunmetal iron.** `asMasonry()` (`tile-compiler.ts`) no longer mixes
  every masonry tile 88% toward a hardcoded drowned-citadel teal; it desaturates toward the tone's
  own grey with a faint cool slate bias. Foundry walls/floors/climb tiles now read as sooted iron.
- **Navy camera margins → warm soot atmosphere.** The far/parallax backdrop
  (`parallax-strip.ts`) no longer uses a hardcoded navy night-sky gradient; it derives a warm
  soot/ember gradient from the biome palette. The camera still uses contain-zoom, so the side
  margins on taller-than-16:9 rooms read as foundry haze instead of dead navy — **climb geometry
  is never cropped**.
- **Courier placeholder.** In `LOCAL_ONLY` there is no image provider, so the player ships the
  procedural humanoid. It is palette-tinted via `actorPalette()` (`ddbb803`) instead of the old
  hardcoded blue capsule. Real courier art still requires an image provider (unavailable here).

## Download map

- **Contact sheet (labeled before/after):** [foundry_slice_review_contact_sheet.png](foundry_slice_review_contact_sheet.png)
- **Full-res after:** [after/02_traversal.png](after/02_traversal.png) · [04_vertical.png](after/04_vertical.png) · [05_ability.png](after/05_ability.png) · [06_secret.png](after/06_secret.png) · [07_checkpoint.png](after/07_checkpoint.png)
- **Full-res before:** [before/](before/)
- **Player:** [player/player_before_after_8x.png](player/player_before_after_8x.png) (64px originals next to the 8× nearest-neighbor copies)
- **Critic input (not rooms 02–07):** [critic/screenshot_gameplay.png](critic/screenshot_gameplay.png)

GitHub (after this directory is on the PR branch):

- https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/cursor/foundry-visual-recapture-acbb/review-artifacts
- Raw contact sheet: https://github.com/alexandnevaeh-dev/MetroForgeSis/raw/cursor/foundry-visual-recapture-acbb/review-artifacts/foundry_slice_review_contact_sheet.png

## What the screenshot critic measures

`gameplay_screenshot_qa` calls `critiqueGameplayScreenshot()` in `packages/assets/src/scene-critic.ts` on **one file**: `qa/screenshot_gameplay.png`.

It is a deterministic pixel pass (stride 4), not a VLM:

- **occupancy** — fraction of sampled pixels with alpha ≥ 16 and luma > 12. Near 1.0 means the frame is almost fully painted (no large black void). Combined with low contrast it trips the wallpaper rule.
- **lumaStdDev** — standard deviation of **3×3 cell-mean luma** (spatial structure across the frame, not per-pixel noise). `< 4` is “looks flat”; occupancy > 0.94 **and** lumaStdDev < 10 is the wallpaper/low-contrast fail (score capped at 40).
- **HUD band** — top 12% of the frame. If more than 86% of those samples are “visible” (luma > 40), it reports “HUD band is so filled it likely obstructs gameplay”.
- Other checks: unique 4-bit-quantized colors, sky-vs-ground mean separation, blank-frame skip for headless dummy renderer.

Thresholds were **not** changed for this review pack.

## Which capture the failing metrics used

The FAIL in `validation_report.json` is **not** computed from rooms 02 / 04 / 05 / 06 / 07.

| Source | File | Role |
|---|---|---|
| Gate | `qa/screenshot_gameplay.png` | **Scored.** SHA-256 prefix `9f1452c70da65891`. 1920×1080. |
| Room stills | `qa/screenshot_slice_traversal.png` etc. = `reports/02-traversal.png` … | Same **windowed** RuntimeSmokeTest session; **different PNGs** (different hashes). |

Capture path:

1. Headless Godot smoke still hits `texture_2d_get` null (dummy renderer). Those runtime screenshot checks stay SOFT_FAIL. That is **not** the gate input.
2. `captureGameplayScreenshots` then ran **windowed** Godot (`--rendering-driver opengl3`, `METROFORGE_CAPTURE=1`). Telemetry `strategy` is `windowed_gpu`. The scored frame is **not** blank (occupancy 100%, ~80 quantized colors).

The scene-critic gate has **two** dimensions: the single scored spawn frame (`critiqueGameplayScreenshot`) and cross-room diversity (`critiqueScreenshotDiversity`).

- **Spawn frame — resolved (single-frame dimension).** A spawn focal light + receded backdrop + a tight warm **character key on the authored courier** + a broader fill took the scored start frame from score **40** (occupancy 1.0 / lumaStdDev 7.4, wallpaper/low-contrast) to score **100** (occupancy 0.40 / lumaStdDev 15.5, uniqueColors 106): a clear focal courier separated from a receded dark backdrop, readable mid/far walkable platforms, and real light→dark falloff — not black/noise added for the metric, and no threshold or capture-timing change. See `spawn_before_after.png` (same capture point and 1920×1080 resolution). Because a heuristic score is not proof of human quality, please eyeball the frame directly.
- **Cross-room diversity — still unresolved.** `critiqueScreenshotDiversity` still fails: more than half of the room pairs share a near-identical luma-grid signature (mean pairwise distance ~8.3; the pass rule needs <55% of pairs below distance 6). The rooms are still the same gunmetal-grid platformer look. This is the remaining reason the gate fails.

**Net: `gameplay_screenshot_qa` is still an unresolved failure and 17/18 is partial validation.** The failing dimension is now room variety, not the spawn frame. Visual approval stays **pending**; MASS / LARGE / RC blocked.
