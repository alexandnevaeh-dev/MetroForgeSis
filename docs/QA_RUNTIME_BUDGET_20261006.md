# Runtime validation watchdog correction

The fresh 43-room Stormglass generation was reported as lacking gameplay-ready
smoke evidence. Its initial headless log stopped before the results marker,
while its windowed execution completed with actual failed checks and usable
screenshots. These are different outcomes.

Removed the smoke/capture frame-count termination arguments. Runtime scenes
exit themselves after reporting results; a 300-second child-process watchdog
still bounds a crash or hang. Completed windowed runs with failed smoke checks
now report that cause rather than a generic process failure or timeout.
No gameplay, visual, or asset acceptance checks were removed.

QA compilation and six smoke-output/capture tests passed. Native validation of
the fresh app-generated 43-room project completed in 94.444 seconds, emitted
gameplay-ready evidence, and did not time out. Result: FAIL, 253 of 382 checks
passed, 43 hard failures, and 86 soft failures. Hard failures concern detailed
enemy/boss art, architectural surface presentation, shrine assets, and authored
room decoration. This is execution evidence, not visual approval or release
readiness.

Recoverable source backups and runtime result:
`E:/MetroForgeData/Development/qa-runtime-budget-20261006`.
The repository index SHA256 remains
`0803C77A5996B93D6E975DFA41AB9CEB9E7F078881FAF88BCF265D7AF7FB3918`.
