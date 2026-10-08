# Melee target-facing correction and Watchman actor candidate

The patrol controller started melee attack playback without turning toward its
in-range target. A patrolling enemy could therefore strike visually away from
the player. The corrected melee start reads the actual target's horizontal
position and sets the sprite's facing before playback. Physical patrol,
cooldown, damage values, health and standing contact-hitbox rules are unchanged.

An isolated candidate installs the draft five-source Watchman attack/ready
metadata on the real enemy scene. Natural patrol and the normal melee clock
remain active. A controlled floor and inert target kept within perception
isolate presentation from combat balance. No attack timer is forced and no
health or damage calls are supplied by this fixture.

The corrected actor candidate passed 30 native observations, including target
facing on both sides, all five poses, composed family/source scale, grounded
anchors and unchanged damage/cooldown/health/contact rules. The previous
controller with identical assets and fixture failed the facing check. Both
native exit statuses and logs are preserved; the successful desktop build is
recorded in `E:/MetroForgeData/Development/stormglass-watchman-actor-20261007`.

Draft source frames remain in E: candidates outside the production catalog.
Walk/hurt/death art, full attack/idle cycles, frame-synchronized combat damage,
full family visual approval and production admission remain open. Fresh app
and full campaign regression for the runtime change are still pending.

`preservation.json` seals the actor candidate: among 1903 source inputs, only
EnemyController and the enemy000 sidecar differ, with QA sources/fixtures added.
The baseline fails exactly the right-side target-facing check; the corrected
candidate passes. Its capture was inspected. This demonstrates presentation
integration on the actual actor; standing contact damage remains separate from
animation-frame-synchronized attacks.

Fresh actual-app report `1791425696100` exported the runtime fix and the correct
`boss_final` art check. Broad art/presentation validation remains failed at
255/382. The draft Watchman sources were not installed into that export. Its
unchanged full native campaign is running in `campaign-v1`; completion and
final source preservation must be recorded before publication acceptance.

The unchanged actual-app export completed the full visible campaign: 34 steps,
all six abilities, four bosses, 122 attacks, 140 damage, zero deaths and victory
after about 363 seconds. Exit status was zero with no native/script errors.
`campaign-v1/preservation.json` records original-source hash verification.
This supplies campaign regression for the runtime facing correction; the draft
Watchman sources remain excluded from production artwork.
