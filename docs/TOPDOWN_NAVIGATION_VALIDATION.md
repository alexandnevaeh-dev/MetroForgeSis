# Top-down playtest navigation evidence

The input-driven bot now plans bounded four-pixel grid routes using the real CharacterBody2D swept shape. Solid terrain, props and doors participate. Movement still uses input actions; this does not move the player directly or alter the world. Failed searches and timed-out movement fail the leg.

Verified September 24, 2026 on the isolated packaged v27 top-down generation (seed92427): native Godot4.6 headless playthrough passed8/8 checks,4/4 transitions,key acquisition/gate opening,final boss and victory. Native Vulkan rendering on RTX5060 repeated the victory and captured ten screenshots. A separate enclosed-body fixture rejects an unreachable target without moving the body.

Limits: one generated seed and persona; search capped8192 expanded cells, so long detours may exhaust it. Dynamic obstacles are not replanned mid-walk. This is functional test evidence, not artwork/animation approval, full generation acceptance or Unity/Unreal parity. Portablev27 still contains the earlier bot until explicitly repackaged. Test blocked-route-check.tscn under an isolated current top-down template; require BLOCKED_ROUTE_REJECTED=true.
