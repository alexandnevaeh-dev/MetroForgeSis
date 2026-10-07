# Archive Gallery enclosure candidate

Room 021 now requests the `archive-gallery` theme. Its enclosure differs from
the Sunken Library: two 384px vestibules flank a 1280px central archive hall.
Side clearance is 256px, central clearance 384px, and two piers retain 192px
walking portals. Solid roofs occupy the unused upper canvas. The authored
layout clears generic floating platforms and synchronizes its floor blueprint.

The recipe differs only by room 021's added theme; all graph connections,
requirements and encounter metadata are preserved. Existing user-authored
paint follows the established preservation path. Backups and focused test logs
are under `E:/MetroForgeData/Development/stormglass-archive-gallery-20261007`.

Geometry and assembly regression tests passed. Fresh desktop generation,
native traversal, theme-specific asset dressing and visible approval remain
pending. This is an enclosure candidate, not a completed archive room.

## Fresh app and native enclosure evidence

Actual desktop generation report `1791380282705` emitted the archive theme,
three roof volumes, two piers, no generic platforms and five recorded masonry
rectangles. The archive export gate passed. Overall generation remains failed:
255 of 382 runtime checks passed, with enemy art, surface dressing and broader
presentation gates still failing. No acceptance gate was removed.

An isolated unchanged export copy passed nine native rendered checks, including
exact roof dimensions, clipped 2048×1280 background, all four original enemies,
normal damage rules, Input-only crossing into room 022 and return to room 021.
Terminal exit was zero. `source-preservation.json` confirms 1849 source inputs
unchanged; only the two validation fixture files were added. The screenshot is
`native-game/archive-overview.png`, proof is `native-game/archive-proof.json`,
and the terminal log is `archive-native.log` under the evidence directory.

Missing enemy run-sheet warnings and an ObjectDB teardown leak warning are
retained. The log contains no SCRIPT ERROR or ERROR entries. Full uninterrupted
campaign regression after this enclosure, finished archive presentation and
visual approval remain open.

## First full-campaign regression attempt

The unchanged fresh app export failed its full Input journey after four of
thirty-four transitions, before reaching room 021. The room 002 upward return
to room 001 did not fire although monitoring was enabled. The player remained
in room 002 with dash acquired; no boss encounter had been reached. Terminal
exit was one, without script errors. This is a failed campaign regression,
not archive gameplay acceptance. Evidence: `journey-v1/native-summary.json`,
`journey-v1/driver.log` and captures in its game's `qa/input-journey` directory.

All 1849 copied source inputs matched before traversal. The seven switchback
flight endpoint observations passed, so investigation should cover the final
landing approach, jump edge and Up intent at the real sensor. No production
door, physics, health or geometry was patched to force a pass. Preserve this
attempt and use a separate candidate for any corrected driver test.

## Upper landing approach candidate

Comparison with the earlier passing export found identical room 002 geometry,
movement configuration, production transition logic and input driver. The failed
capture shows the player beside the upper opening. The switchback approach now
walks beneath the door's entry x before jumping, rather than stopping 64px to
its right. This changes only navigation input, not actor position or physics.
`journey-v2/input-preservation-before.json` verifies the driver is the only
changed file among 1849 copied inputs. The native Up-door intent regression
passed nine checks. Early v2 observations passed the failed return and reached
the first guardian, but the full campaign result remains pending.

The v2 attempt ultimately failed after fifteen transitions: the room 016 to 018
leg reported walk_timeout although room 018 subsequently loaded. WorldManager
frees the outgoing actor before awaiting boss-exit locking and publishing the
destination. The walk helper can therefore see no actor while current_room_id
still names the old room. This timing gap must not itself claim arrival or fail
an otherwise successful transition. The v3 driver waits at most two seconds for
the exact requested destination only when walking failed and the old actor is
invalid. A live-player stall or another destination remains a failure. Both
failed attempts are preserved; v3 full native validation is running. Source
comparison confirms PlaytestAgent is the only changed input in either candidate.

## Completed v3 campaign

The rendered v3 journey terminated with exit zero and no native or script errors:
34/34 transitions, all six abilities acquired, four guardians defeated, 109
attacks, 150 damage taken, zero deaths and victory in 358.413 seconds. The route
entered and traversed room 021; capture `055_room_021.png` was inspected. Final
hash comparison confirms only the input driver differs among 1849 app-export
inputs; gameplay, geometry, doors, actor health and art remained unchanged.
`journey-v3/completion.json` records the final result and preservation boundary.

The controlled arrival probe also passed six checks after its preload jobs were
joined before shutdown. Its clean retry exited zero without ERROR entries.
The first probe's passing assertions plus shutdown resource parse errors are
preserved separately in `arrival-wait-first.log` and its proof. This probe uses
direct room-loading setup and is not campaign evidence.

This establishes native critical-route regression for the enclosure candidate
and driver fixes. Overall app art/presentation validation still fails, optional
rooms remain incompletely tested, and visual/production approval is open.
