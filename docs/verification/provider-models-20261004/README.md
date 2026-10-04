MetroForge discovers chat models from configured LM Studio, Together, Cerebras and Mistral connections, keeps provider/model identity separate, and persists provider-specific generation settings without issuing a generation request. Together's array model list and Mistral's chat capability flags are handled explicitly. Unknown model licensing, quality and hardware requirements remain unknown.

The Models frontend retains loaded records on read failures, reports partial scouting results, provides retry, locks duplicate mutations immediately, ignores responses after unmount, and uses keyboard-accessible provider-scoped selection. The table is actually bounded, adapts to its own panel width and remains usable in a narrow app. Corrupt saved catalogs are preserved; saves are atomic. Hardware ranking does not repeatedly mutate authored priorities.

Validation: 49 regression tests, 131 UI/workflow checks, full isolated TypeScript and native desktop builds, strict UI audit with zero findings. The final portable app completed a fresh LOCAL_ONLY creation, native 161-waypoint alive extraction and Windows export. Synthetic credentials prove encrypted storage behavior, not hosted-service authentication. All tests and artifacts stayed on E:. Existing games, releases and the canonical Git index were preserved.

Limits: this is incremental app work. It does not approve final art/animations, hosted model quality, Unity/Unreal gameplay or production readiness.

API contracts consulted: [Together model listing](https://docs.together.ai/reference/models), [Mistral model capabilities](https://docs.mistral.ai/api/endpoint/models), [LM Studio compatible model list](https://lmstudio.ai/docs/developer/openai-compat/models).
