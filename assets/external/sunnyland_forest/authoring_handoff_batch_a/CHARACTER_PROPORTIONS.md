# SunnyLand Character Proportions

Measured from 19 accepted original idle/jump/fall/hurt frames on 37x32 source canvases.

| Metric | Source-pixel range | Normalized 64px-cell target |
|---|---:|---:|
| Opaque height | 24-32 px | 42-55 px |
| Opaque width | 17-33 px | 29-57 px |
| Resting idle width | 17-23 px | 29-40 px |
| Resting center X | 16-18 px | 28-31 px |
| Grounded feet baseline | 31 px | 63 px |
| Typical left padding | 5-9 px | 9-16 px |
| Typical top padding (idle) | 3-7 px | 5-12 px |

Use the dark brown/red outlines, peach skin, orange clothing, and one-pixel source clusters. Grounded authored frames must place an opaque foot pixel at normalized Y=63 with baseline variance no greater than 1px. Airborne frames may vary intentionally. Preserve the 37x32 source model's head, torso, arms, legs, and feet; do not scale a whole character to animate it.
