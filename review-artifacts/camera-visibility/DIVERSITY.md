# Cross-room diversity — measured result

`critiqueScreenshotDiversity` (packages/assets/src/scene-critic.ts) compares luma-grid signatures
of the per-room slice captures; it fails when >55% of room pairs are near-identical (distance < 6).

| Slice | mean pairwise distance | passes |
|---|---|---|
| `foundry-visual-slice-spawn2` (before per-role identities) | 8.52 | no (near-duplicate cluster) |
| `foundry-visual-slice-div1` (after per-role identities) | 13.81 | **yes** |

Change: each gameplay role gets a distinct rear-wall silhouette family + per-role receded backdrop
tint within the warm soot/gunmetal range (tutorial=apse, traversal/gate=colonnade chain-shaft,
challenge/save=maintenance gallery wall, combat=furnace hall, shrine=furnace hearth,
treasure/boss=ruin recess). Collision/traversal geometry is identical (fingerprint pr2 vs div1),
palette unchanged. This is a **measured** metric result, not visual approval.
