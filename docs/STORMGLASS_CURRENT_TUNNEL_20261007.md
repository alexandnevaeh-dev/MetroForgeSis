# Current Tunnel enclosure candidate

Room 012 gains a short 512px entry corridor, a 640px central crossing chamber
and an 896px exit corridor. Their clearances are 256,512,288 pixels. Solid roof
volumes fill the unused upper canvas; threshold piers leave 192px and 224px
walking portals. The taller chamber contains the original raised crossing.

The original 64px pit at x608, four platforms, two encounters and both map
connections remain unchanged. Only room 012's theme is added to the campaign
recipe; no abilities or route requirements change. The existing muted teal
burial-wall kit keeps continuity with Drowned Hall. Further tunnel dressing and
water effects remain separate work.

Sixty-four enclosure and room-assembly tests passed; the desktop build passed.
Source backups and logs are under
`E:/MetroForgeData/Development/stormglass-current-tunnel-20261007`.
Fresh app export, native crossing/return, full campaign regression and finished
presentation are pending. This is a geometry candidate, not production approval.

Actual desktop report `1791417121699` exported the enclosure. Comparison against
the prior validated export verifies seven gameplay fields unchanged in all 43
rooms: dimensions, tile size, connections, enemies, platforms and pits. Broader
art/presentation validation still failed at 255/382; no gates were removed.

An isolated unchanged export copy passed ten visible native checks, including
exact roof/platform dimensions, the original pit, two active encounters, normal
damage rules and Input-only crossing to room 013 and return. Exit status was
zero, without script or frame-size errors. All 1903 source inputs retain their
hashes; only the two validation fixtures were added. The overview capture was
inspected. Full campaign regression is running separately in `campaign-v1`;
finished tunnel dressing and visual approval remain open.

The unchanged fresh export completed the full visible campaign: 34 route steps,
all six abilities, all four bosses, 119 attacks, 110 damage, zero deaths and
victory after about 344 seconds. Exit status was zero with no native/script
errors. `campaign-v1/preservation.json` verifies all 1903 original inputs
unchanged. This validates progression through the enclosure; final visual
quality and specialized tunnel dressing remain open.

The next presentation candidate replaces only room 012's prop list with a
service winch, a votive lamp and a censer from the existing hashed modular kit.
Their Gothic metal/stone materials and teal room palette stay coherent with
Drowned Hall. No new interaction or collision is attached to these props.
Four atlas-admission/enclosure tests passed. Fresh app export and native
prop-containment/crossing verification are pending separately from the earlier
completed geometry campaign.

The dressing candidate is now exported through actual-app report `1791418705612`.
Byte comparison across 281 gameplay scripts, scenes and data files permits only
the two room-kit JSON files to differ; both change only room 012's props.
The broader art/presentation job still failed at 255/382. No gates were removed.
The fresh unchanged export copy passed twelve visible native checks, including
the service props' roof/floor containment, original platforms/pit/encounters,
normal damage and Input-only exit/return. Exit status was zero without script
or frame-size errors; an ObjectDB teardown warning remains. All 1903 original
export inputs retained their hashes. The updated overview was inspected.
Evidence: `dressing-export-comparison.json` and `dressing-v1/native.log`.
This changes decoration only; the earlier full campaign supplies geometry and
progression evidence. Finished animation art and production visual approval
remain open.
