# MetroForge frontend queue optimization

Generation Queue now uses the shared Button/Badge primitives with readable job-type labels, active-job count, bounded history and explicit refresh/retry. All active jobs stay visible; recent history begins at ten and expands ten at a time. Descriptions wrap away from type/status/actions using the existing forge tokens.

Queue reads are serialized and unchanged summaries do not replace React state. Active polling stays at 1.5 seconds; idle and failed polling use ten seconds, reducing scheduled idle requests by 85 percent. Start/completion/failure events request an immediate refresh. Unmount removes timers/subscriptions and discards late responses. Read errors retain known jobs and expose Retry; an initial failure reports unavailable status rather than a false empty queue.

Cancellation locks duplicate clicks and preserves button geometry. It reports request acknowledgement and lets authoritative queue state determine status. Failed cancellation leaves the active job available for retry. The renderer receives only six display fields; internal payloads and abort-signal objects stay in the main process. Existing job execution semantics remain unchanged in this publication.

Validation: isolated workspace and native desktop builds passed, 37 regression tests passed, strict UI audit had zero findings, and the changed component passed formatting. Twenty-two hidden Electron component checks cover timing, delayed reads, cancellation failures, history bounds, narrow layout, initial failure/retry and cleanup; their IPC is a controlled fixture, not worker completion evidence. Tested component/styles/harness and fixture bundle hashes are retained.

The final v3 portable application passed 44 encrypted-connection checks and 33 actual creation checks, including summary-only queue IPC. Real app creation generated and played a separate Quantum candidate, built a Windows release and completed the copied 161-waypoint release route. CapturePage images came from the real hidden app. This deterministic local template path does not establish AI-authored content or live authentication for the new hosted providers.

The local E: launcher references the existing authorized canonical .env when no explicit environment-file override is supplied. A separate read-only packaged check recognized five configured environment credentials and confirmed that the file stayed unchanged. No key values, encrypted vaults, .env content or per-provider credential inventory are included in this publication. Presence is separate from live authentication and generation capability.

The source-bound 35-room Unity route and its gate/NPC/editor-license limitations remain in ../campaign-queue-20261004. Top-down and side-view content stays separate; old releases, saves and the canonical Git index are preserved. Broader library/editor workflows, model discovery, image-provider expansion and remaining game/engine acceptance are ongoing.
