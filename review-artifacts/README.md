# Foundry visual-slice review pack

These files are **review evidence only**. They are not a new art pass and do not change the generated game.

PR: https://github.com/alexandnevaeh-dev/MetroForgeSis/pull/4 (draft)  
Branch: `cursor/foundry-visual-recapture-acbb`  
Visual approval: **rejected as a finished slice**. MASS / LARGE / RC stay **blocked**. Do not merge.

**Next visual target is room 05 only.** Recolored block actors are unresolved placeholders, not courier art. See [room05/](room05/) for the ability-shrine still and gameplay clip. Do not propagate that treatment across other rooms until the shrine is reviewed.

## Exact commit and generation

| Field | Value |
|---|---|
| Code commit (after stills) | `ddb7163ea5f33d40f7f68467bae822b9f0c7efb6` (`ddb7163`) |
| Message | `fix(godot): composition pass` (`ddbb803`) + palette color pass: `derive masonry from palette instead of teal` (`e5e6389`) + `warm the far/parallax backdrop from palette` (`ddb7163`) |
| Before stills | Pre-pass recapture of the same prompt/seed, generated from `a04ce27` |
| Slug | `foundry-visual-slice-after` (before: `foundry-visual-slice-pr2`) |
| Prompt | Ashen Foundry: a lone courier delves a ruined mechanical forge of brass and sooted iron, side-view metroidvania |
| Profile | `VISUAL_VERTICAL_SLICE` |
| Mode | `LOCAL_ONLY` |
| Archetype | `SIDE_VIEW_METROIDVANIA` |
| Seed | `20260909` |
| Godot | `4.7.1.stable.official.a13da4feb` |
| Viewport | 1920×1080 |
| Windowed driver | `opengl3` (Linux) |
| Created | `2026-09-10T05:06:34Z` |
| Job id | `job_mtv2c003_5lfxl7` |
| `visualSliceApproved` | `false` |
| `visualReviewStatus` | `VISUAL_SLICE_REVIEW_REQUIRED` |

After PNGs are byte-identical to `GeneratedGames/foundry-visual-slice-after/reports/{02,04,05,06,07}*.png` from that run.

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
| Gate | `qa/screenshot_gameplay.png` | **Scored.** SHA-256 prefix `acb127411c9598a0`. 1920×1080. |
| Room stills | `qa/screenshot_slice_traversal.png` etc. = `reports/02-traversal.png` … | Same **windowed** RuntimeSmokeTest session; **different PNGs** (different hashes). |

Capture path:

1. Headless Godot smoke still hits `texture_2d_get` null (dummy renderer). Those runtime screenshot checks stay SOFT_FAIL. That is **not** the gate input.
2. `captureGameplayScreenshots` then ran **windowed** Godot (`--rendering-driver opengl3`, `METROFORGE_CAPTURE=1`). Telemetry `strategy` is `windowed_gpu`. The scored frame is **not** blank (occupancy 100%, ~80 quantized colors).

Reported gate numbers (`screenshot_critique.json` / `validation_report`) for this after run: occupancy **0.983**, uniqueColors **51**, lumaStdDev **6.39**, score **40**, issue wallpaper/low-contrast. The windowed (`windowed_gpu`, `opengl3`) frame is not blank.

The warm-soot/gunmetal color pass slightly changes the numbers (the old navy run reported occupancy 1.0 / lumaStdDev 5.10 / 80 colors) but the deterministic `gameplay_screenshot_qa` gate **still fails** at score 40: a single spawn still frame is intentionally low-contrast for this heuristic. That is exactly why **visual approval stays pending** — automated QA is not a substitute for human review.

Rooms 02–07, if scored independently with the same function, also trip wallpaper/low-contrast. That is extra context only. The recorded `gameplay_screenshot_qa` FAIL is from `screenshot_gameplay.png`.
