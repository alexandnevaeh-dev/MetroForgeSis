# Side-view boss run assets

The generator previously emitted boss walk/combat sheets but no run strip,
while BossController selected a run animation during distant chase. Missing
run files produced a one-frame colored fallback rectangle.

Metroidvania and Platformer generation now emits a twelve-frame boss run strip,
preferring an authored run sheet when available, alongside existing walk and
combat clips. Side-view run metadata specifies 14fps and looping playback.
Existing non-side-view boss metadata stays unchanged. Run quality still uses
the existing silhouette/identity checks; fallback art is not production-approved.

An older-project compatibility candidate requires multiple run frames before
selection, preserving walk animation during chase. It remains isolated on E:
because two of its pose-advancement checks failed. The canonical BossController
keeps its prior behavior. Movement speeds, damage, health and attack timing are unchanged.

The two actual offline asset-pipeline tests and metadata isolation test passed.
The initial observer incorrectly expected a nested sidecar; it was corrected
to the existing flat format. Failed logs and source backups are preserved at
`E:/MetroForgeData/Development/stormglass-boss-run-20261007`.
Desktop builds passed. Fresh actual-app report `1791411758421` exported all four
run sheets; broader art/presentation validation still failed at 255/382.
An unchanged export copy passed 24 native checks: twelve clipped source run
frames, 14fps looping playback, natural AI chase selection and pose advancement
for all four bosses. Native exit was zero with no script/frame-size errors;
an ObjectDB teardown warning remains. All 1903 original inputs stayed unchanged.

The unchanged fresh export also completed the full visible campaign: 34 steps,
six abilities, four bosses, 118 attacks, 130 damage, zero deaths and victory in
about 353 seconds. Native exit was zero with no native or script errors.
The new run strips still use fallback procedural boss art. Artistic approval,
older-project compatibility acceptance remain open. Publication is recorded
separately in the isolated uploader receipt.
