# Player region alpha audit

The cape v3 pack contains 88 measured frames across 14 clips. Read-only Pillow
inspection found four full-alpha boundary contacts: landing frame 0, second
attack frames 4 and 5, and air-dash frame 4. All four are faint residue below
18/255 alpha. No frame touches its region boundary at alpha 18, 128, or 255.
The source PNGs were inspected and were not modified or resampled. Boundary
contact alone is a review flag, not proof of neighboring pose intrusion.

The fresh app run 1791319381664 contains the same eleven PNG hashes and all
fourteen clip source regions as the pack. This confirms actual selection,
not production approval or complete animation quality.

Repeat with `scripts/audit-sprite-region-alpha.py --manifest
test-packs/stormglass-player-cape-v3/manifest.json --report <E:-report-path>`
using an existing Python runtime with Pillow. The audit saves hashes, bounds,
margins, and measurements at four alpha thresholds without writing image pixels.

Detailed evidence is retained at
`E:/MetroForgeData/Development/stormglass-cape-alpha-20261006`.
Enemy and boss families still require coherent replacements. The pack remains
a review candidate, with its existing production and provenance boundaries.
