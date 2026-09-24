# Top-down navigation validation

The playtest bot uses bounded A-star search on a four-pixel grid. Each edge checks the actual CharacterBody2D swept collision shape. Terrain, props and closed doors remain solid. The bot follows waypoints with movement inputs; it does not teleport or change collisions.

## Native evidence — September 24, 2026

- Open 1,000-pixel route: the previous breadth-first search exhausted its 8,192-cell budget; A-star found 249 waypoints in 112 ms.
- Enclosed-body fixture: unreachable target rejected without moving the body.
- Seed 92427, victory_rusher: Godot 4.6 passed eight checks and all four area transitions, reaching the final boss and victory.
- Door telemetry observes actual LockedDoor opening events before pickup collection begins. The latest run recorded one floor_switch opening and retained the required key ID. It no longer incorrectly reports zero openings when a switch opens the door before direct interaction.
- An earlier rendered run on Vulkan / RTX 5060 captured ten screenshots through victory.

## Limits

One seed and persona have been exercised. Search remains capped at 8,192 expanded cells; dynamic obstacles are not replanned mid-walk. The boss harness resets health before its boss test and calls the attack helper, so this is not an untouched player playthrough. Missing attack audio remains. These results do not approve artwork, animation, full generation, or Unity/Unreal parity. Portable v27 still bundles the earlier bot.

Run blocked-route-check.tscn and long-route-check.tscn from the validation fixtures in an isolated current top-down project. Require BLOCKED_ROUTE_REJECTED=true and reachable=true respectively.
