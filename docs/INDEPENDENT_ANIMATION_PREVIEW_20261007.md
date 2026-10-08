# Independent animation source preview

The editor previously interpreted every animation as a sheet even when Godot
loaded independent PNG frames through a sidecar. It could therefore show a
legacy placeholder or wrong cropped cells while the game showed source art.

Desktop animation metadata now carries validated source paths, regions, foot
anchors and display scale. Source clip counts/timing override stale sheet
artifact fields. Unsafe paths, malformed counts/regions/anchors, nonfinite
scale and invalid timing are rejected without guessed sheet frames.

The inspector loads sources through the existing guarded image IPC, validates
regions against decoded dimensions and draws with nearest-neighbor sampling
on a shared anchored canvas. Loading waits before playback; failures expose
Retry and disabled controls. Viewport height stays stable and stale image reads
cannot replace the active selection. Legacy grid preview behavior is retained.

Twenty-three focused metadata/layout/clock tests passed. Native desktop build
passed after adding the unavailable-bridge fallback. The first actual-app test
passed six checks before its harness attempted an unsupported empty project
selection. That failed log was preserved; supported switching to a second
isolated fixture project fixed the observer.

The final actual desktop run passed 13 checks: real source metadata IPC,
anchored source pixels, declared frame count, frame stepping, keyboard seek,
one-shot replay, missing-file error/disabled controls, restored-file Retry,
unsafe-metadata rejection, narrower layout, unchanged gameplay/source hashes
and no renderer exceptions. Wide/narrow captures were inspected.
Evidence: `E:/MetroForgeData/Development/animation-source-preview-20261007`,
especially `ui-v2/proof.json` and its screenshots.

This validates editor preview behavior. It does not admit the draft Watchman
sources or change artifact provenance/maturity. Grid thumbnails still show the
manifest's primary image; source-aware thumbnail/provenance reconciliation and
full actor-art acceptance remain separate work.
