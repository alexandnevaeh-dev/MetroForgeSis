# Optional local art styles

Asset Workshop offers Local art style for an explicit, project-scoped source-art request. None keeps the existing project-brief generation behavior. Switching projects resets the choice; styles never activate globally across side-view, top-down or Quantum games.

The initial curated option is Pixel art XL for a local SDXL Diffusers model. Its cached safetensors file must match the pinned SHA256 and size. Listing choices does not download weights or load inference. The selected cache file is rechecked before mutation, and the worker rechecks its actual bytes before local loading. No weights or generated artwork are included in this source feature. The model's separate license conditions still apply; availability is not license or visual approval.

Provider mode and enabled providers remain authoritative. A requested local style limits selection to capable local providers, and incompatible or unavailable routes fail with a correction hint. Local files are not sent to remote workers. No fallback may silently discard the style and report ordinary generation as success.

This option currently creates new artwork only. Replacements retain the existing IP Adapter reference workflow, which is incompatible with the present style adapter path. Choose None for replacement or create a separate candidate. OpenVINO and ControlNet/IP Adapter combinations with the adapter are rejected; supported local generation keeps normal inference timeouts.

The raw generated source stays beside the compiled game sprite. Applied adapter path, SHA256 and scale are verified against the worker echo and recorded as execution provenance. Immutable production specifications include the descriptor in their request hash. Missing or inconsistent provenance prevents promotion. Foreground isolation and compilation retain their own metadata and existing quality gates.

Technical validation covers candidate builds, focused tests, actual Workshop selection/generation, failure paths and native presentation. It does not approve the generated character's palette, anatomy, foot anchors or animation, or establish full game/engine production readiness.
