# Castle region scale and internal rooms

The user supplied seven complete Symphony of the Night stage maps and clarified that they are examples of how large the levels should feel. Treat them as regional structure and spatial-density references. Their bitmap dimensions are not target gameplay dimensions. Preserve MetroForge's original Stormglass world, characters, architecture and separate genre sets.

The examples are retained with original file hashes under E:/MetroForgeData/References/20261004-castle-stage-scale/reference-index.json. They are reference material, not assets in a generated game. The supplied [stage guide](https://castlevaniadungeon.net/games/sotnstages.html) was read, and the browser-rendered Entrance, Alchemy Lab, Marble Gallery, Outer Wall, Long Library and Royal Chapel screenshots were inspected. Direct image fetches failed in the web tool, but the images loaded in the browser. Full maps below were inspected from the user's attachments.

| Example | Structural lesson | Original Stormglass application |
| --- | --- | --- |
| Entrance | Long ground-level spine; nested upper chambers, stairs and a lower branch | Arrival wing with a continuous hall, upstairs service rooms and a flooded undercroft branch |
| Abandoned Mine | Deep central descent joining long horizontal passages and side pockets | Castle foundations with connecting shafts, a lower cross-passage and sheltered return routes |
| Catacombs | Very long region with alternating chambers, hazards and separate upper/lower routes | Crypt wing with encounter/rest rhythm, enclosed burial rooms and optional lower exploration |
| Alchemy Laboratory | Multiple shafts, large central chambers, smaller side rooms and changes of direction | Reliquary works with workshop chambers, upward circulation and a usable return loop |
| Marble Gallery | Long main gallery with central junctions, upstairs routes and an extended downstairs branch | Grand gallery hub connecting archives, chapel and lower castle wings |
| Royal Chapel | Long climbing approach, tall towers, elevated connecting galleries and side alcoves | Chapel ascent with an original landmark tower and sheltered rooms along the climb |
| Long Library | Rooms stacked inside one building; shelves and furnishings define room purpose | Archive wing with enclosed reading rooms, upper stacks, service passages and a distinct study |

## Scale and construction targets

Plan each area as a connected collection of rooms with a common castle material language. Use several long routes, multiple elevations and meaningful branch destinations. A wing has internal chambers; the larger region connects several wings, vertical links and optional rooms. The existing tested three-storey gallery is one wing in this structure.

Initial design targets, subject to traversal and pacing tests: a major area spans roughly 12–24 gameplay-camera widths and 6–14 camera heights across its whole bounding box. A long hall spans 3–8 widths; a major shaft spans 4–8 heights; enclosed side chambers span 1–3 widths. These are planning ranges, not measured values from the reference images or hard limits. Convert them using the actual gameplay camera and movement settings, not image pixels. Empty space outside rooms does not count as playable area.

Keep long rooms dense enough to reward traversal. Introduce chamber thresholds, cross-routes, overlooks, encounter pockets, rest spaces, landmarks and optional rewards. Checkpoint spacing follows travel time and risk rather than repeating every fixed number of rooms. Place ability gates where acquired movement exposes a readable earlier branch. Return routes must reduce travel and remain usable after arena completion.

Enclose rooms with matching floor, ceiling and wall thickness; internal doorways should read as architectural thresholds. Background masonry, recessed panels, shelves, piers and windows express the room's purpose. Balcony surfaces and supports share the same material and meet the collision surface. Furniture belongs to a chamber role and full support surface. Keep the player silhouette and attack telegraphs readable. Repeat local material courses where appropriate, while avoiding pasted complete background scenes.

## Implementation order and evidence

1. Preserve the verified v7 gallery and its receipts. Create a new E: candidate for region layout work.
2. Replace the current mostly horizontal spine with an authored spatial region plan: long hall, two shaft routes, upper/lower branches, enclosed side chambers and a return loop. Preserve progression order while validating actual door directions and collision.
3. Compile scene geometry and inspect it in MetroForge's actual World Map and Rooms views. A graph drawing alone does not establish playable size or correct transitions.
4. Add original chamber-specific wall assemblies and furnishings. Validate player-relative scale, enclosure, depth and grounded placement in native captures.
5. Run actual-input ascent, descent, branch and return tests, then the complete journey with earned abilities and bosses. Record room spans, route time, visited rooms and remaining untested branches.
6. Extend the app's generation and authoring workflow so a new game can produce and edit these region/chamber plans without a staging script.

Current verified evidence is in docs/verification/castle-interior-20261004: v7 has one three-storey wing and eight named spaces, not completed reference-scale regions or seven furnished areas. The remaining 39 rooms retain their previous geometry. Native ObjectDB exit warnings, final enemy/boss art and animation, richer chamber detail, and Unity/Unreal native acceptance remain open. Keep top-down and Quantum development separate.
