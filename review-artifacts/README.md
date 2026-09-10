# Foundry visual-slice review pack

These files are **review evidence only**. They are not a new art pass and do not change the generated game.

PR: https://github.com/alexandnevaeh-dev/MetroForgeSis/pull/4 (draft)  
Branch: `cursor/foundry-visual-recapture-acbb`  
Visual approval: **pending**. MASS / LARGE / RC stay **blocked**. Do not merge.

## Exact commit and generation

| Field | Value |
|---|---|
| Code commit (after stills) | `ddbb8037f6d885c4030163006ebafed5b29b4587` (`ddbb803`) |
| Message | `fix(godot): composition pass for Foundry rear walls and contain-view sky` |
| Before stills | Pre-composition recapture of the same prompt/seed, generated from `a04ce27` |
| Slug | `foundry-visual-slice-pr2` |
| Prompt | A courier in a furnace foundry, orange claw enemy, 32px industrial kit, side-view metroidvania |
| Profile | `VISUAL_VERTICAL_SLICE` |
| Mode | `LOCAL_ONLY` |
| Archetype | `SIDE_VIEW_METROIDVANIA` |
| Seed | `20260909` |
| Export | `--skip-export` |
| Godot | `4.7.1.stable.official.a13da4feb` |
| Viewport | 1920×1080 |
| Windowed driver | `opengl3` (Linux) |
| Created | `2026-09-10T04:38:39.442Z` |
| Job id | `job_mtv1essy_qn84ud` |
| `visualSliceApproved` | `false` |
| `visualReviewStatus` | `VISUAL_SLICE_REVIEW_REQUIRED` |

After PNGs are byte-identical to `GeneratedGames/foundry-visual-slice-pr2/reports/{02,04,05,06,07}*.png` from that run.

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
| Gate | `qa/screenshot_gameplay.png` | **Scored.** SHA-256 prefix `bb54ae94175497cb`. 1920×1080. |
| Room stills | `qa/screenshot_slice_traversal.png` etc. = `reports/02-traversal.png` … | Same **windowed** RuntimeSmokeTest session; **different PNGs** (different hashes). |

Capture path:

1. Headless Godot smoke still hits `texture_2d_get` null (dummy renderer). Those runtime screenshot checks stay SOFT_FAIL. That is **not** the gate input.
2. `captureGameplayScreenshots` then ran **windowed** Godot (`--rendering-driver opengl3`, `METROFORGE_CAPTURE=1`). Telemetry `strategy` is `windowed_gpu`. The scored frame is **not** blank (occupancy 100%, ~80 quantized colors).

Reported gate numbers (`screenshot_critique.json` / `validation_report`): occupancy **1.0**, uniqueColors **79**, lumaStdDev **5.10112**, score **40**, issues wallpaper + HUD band.

Re-running the same function on the PNG now in `critic/screenshot_gameplay.png`: occupancy **1.0**, uniqueColors **80**, lumaStdDev **5.10092**, score **40**, **same two issues**. `capture_telemetry.json` records the windowed retry at 80 colors. That 79 vs 80 gap is 4-bit quantization on the same path after the windowed overwrite; it is **not** a black headless frame and is **not** evidence that the fail is an environment artifact.

Rooms 02–07, if scored independently with the same function, also fail wallpaper/low-contrast (and some fail lumaStdDev < 4). That is extra context only. The recorded `gameplay_screenshot_qa` FAIL is from `screenshot_gameplay.png`.
