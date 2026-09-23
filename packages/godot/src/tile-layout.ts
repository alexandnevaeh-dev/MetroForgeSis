import type { TileCell } from './room-assembler.js';
import { SeededRNG, DEFAULT_MOVEMENT_STATS, type MovementStats } from '@metroforge/procedural';
import { composePlayableVisuals, suppressRepetition, type RoomBlueprint } from './composition/index.js';

/** Must match packages/assets/src/tile-compiler.ts TILE_ATLAS.roles */
const ROLES = {
  ground: { col: 0, row: 0 },
  wall: { col: 1, row: 0 },
  ceiling: { col: 2, row: 0 },
  platform: { col: 3, row: 0 },
  left_edge: { col: 4, row: 0 },
  right_edge: { col: 5, row: 0 },
  top_edge: { col: 6, row: 0 },
  bottom_edge: { col: 7, row: 0 },
  outside_tl: { col: 0, row: 1 },
  outside_tr: { col: 1, row: 1 },
  outside_bl: { col: 2, row: 1 },
  outside_br: { col: 3, row: 1 },
  platform_left: { col: 0, row: 2 },
  platform_right: { col: 1, row: 2 },
  one_way: { col: 2, row: 2 },
  hazard: { col: 3, row: 2 },
  door: { col: 5, row: 2 },
  decor_a: { col: 6, row: 2 },
  decor_b: { col: 7, row: 2 },
} as const;

type TileRole = keyof typeof ROLES;

type TerrainVariantRole = 'ground_wear' | 'ground_crack' | 'ground_moss' | 'ground_rare' | 'wall_wear' | 'wall_crack' | 'wall_moss' | 'wall_rare' | 'ceiling_wear' | 'ceiling_moss' | 'platform_wear' | 'platform_moss';

const TERRAIN_VARIANTS: Partial<Record<TileRole, readonly TerrainVariantRole[]>> = {
  ground: ['ground_wear', 'ground_crack', 'ground_moss', 'ground_rare'],
  wall: ['wall_wear', 'wall_crack', 'wall_moss', 'wall_rare'],
  ceiling: ['ceiling_wear', 'ceiling_moss'],
  platform: ['platform_wear', 'platform_moss'],
  top_edge: ['ground_wear', 'ground_moss'],
  bottom_edge: ['ground_wear'],
  left_edge: ['wall_wear'],
  right_edge: ['wall_wear'],
};

const TERRAIN_VARIANT_ATLAS: Record<TerrainVariantRole, { col: number; row: number }> = {
  ground_wear: { col: 0, row: 3 },
  wall_wear: { col: 1, row: 3 },
  ceiling_wear: { col: 2, row: 3 },
  platform_wear: { col: 3, row: 3 },
  ground_crack: { col: 4, row: 3 },
  wall_crack: { col: 5, row: 3 },
  ground_moss: { col: 0, row: 4 },
  wall_moss: { col: 1, row: 4 },
  ceiling_moss: { col: 2, row: 4 },
  platform_moss: { col: 3, row: 4 },
  ground_rare: { col: 4, row: 4 },
  wall_rare: { col: 5, row: 4 },
};

const BASE_ROLE_BY_ATLAS = new Map<string, TileRole>(
  Object.entries(ROLES).map(([role, atlas]) => [`${atlas.col},${atlas.row}`, role as TileRole]),
);

function tileHash(seed: number, x: number, y: number, salt: number): number {
  let value = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

/**
 * Resolves visual-only material variants after structural composition. A patch is deliberately
 * larger than one cell so wear reads as a local condition, not checkerboard noise.
 */
function applyTerrainVariants(cells: TileCell[], seed: number): TileCell[] {
  return cells.map((current) => {
    const role = BASE_ROLE_BY_ATLAS.get(`${current.col},${current.row}`);
    const variants = role ? TERRAIN_VARIANTS[role] : undefined;
    if (!role || !variants?.length) return current;

    const patchX = Math.floor(current.x / 5);
    const patchY = Math.floor(current.y / 3);
    const patchRoll = tileHash(seed, patchX, patchY, role.length) % 100;
    // Clean is common, but every material patch has a deterministic shared condition.
    if (patchRoll < 52) return current;

    const variantIndex = tileHash(seed, patchX, patchY, current.x + current.y + role.length) % variants.length;
    const variant = TERRAIN_VARIANT_ATLAS[variants[variantIndex]!];
    return { ...current, col: variant.col, row: variant.row };
  });
}

function cell(x: number, y: number, role: TileRole): TileCell {
  const pos = ROLES[role];
  return { x, y, col: pos.col, row: pos.row };
}

/**
 * Real player collision-body height (templates/godot-metroidvania/scenes/player/Player.tscn,
 * RectangleShape2D_body = 24x48) plus a landing/jump safety margin. Painted platforms must leave
 * at least this much vertical clearance below them (to the floor, or to the next platform down)
 * or the player's own hitbox cannot physically stand underneath.
 */
const PLAYER_CLEARANCE_PX = 64;

/**
 * A running jump's real horizontal-arc distance isn't modeled anywhere in this pipeline (only
 * dash/jump-apex are, see packages/procedural/src/movement-feasibility.ts) — dashReachPx is used
 * as the sizing bound for pit width because it's the largest *documented* horizontal reach stat,
 * so a pit sized within it is guaranteed crossable by dashing even if a plain running jump falls
 * short. A 0.9 safety factor keeps the generated gap short of the theoretical maximum.
 */
const PIT_WIDTH_SAFETY_FACTOR = 0.9;

/** Mirrors movement-feasibility.ts's private jumpApexPx — duplicated because that helper isn't
 *  exported (deliberately, it's part of the QA audit's internal reach math), not because the
 *  underlying stat differs. */
function jumpApexPx(stats: MovementStats): number {
  return stats.jumpHeight;
}

function dashReachPx(stats: MovementStats): number {
  return stats.dashSpeed * stats.dashDuration;
}

/** Mirrors movement-feasibility.ts's verticalReachPx('double_jump') multiplier. */
function doubleJumpReachPx(stats: MovementStats): number {
  return jumpApexPx(stats) * 1.85;
}

export interface RoomTileConnectionHint {
  direction: 'left' | 'right' | 'up' | 'down';
  requirements: string[];
  optional?: boolean;
}

export interface RoomTileLayoutInput {
  width: number;
  height: number;
  tileSize: number;
  archetype?: string;
  /**
   * Per-room seed. Callers MUST derive a distinct value per room (e.g. hash of roomId + world
   * seed) — passing the same seed for every room of an archetype reproduces the exact old
   * "one fixed shape per archetype" behavior this module is meant to fix.
   */
  seed?: number;
  /** Real per-project jump/dash reach. Defaults to DEFAULT_MOVEMENT_STATS. */
  movement?: MovementStats;
  /** This room's own outgoing connections, used to size ability-gated columns to the real
   *  ability's reach and to detect optional/secret branch entries. */
  connections?: RoomTileConnectionHint[];
  /**
   * Abilities already granted to the player by the time they can reach this room, per the real
   * world-graph pickup order (see room-assembler.ts's abilitiesAvailableBeforeRoom). A dash-reach
   * sized pit is only safe to paint if `dash`/`air_dash` is actually in this list — dash is gated
   * behind GameManager.has_ability("dash") at runtime (see DashAbility.gd's is_unlocked()), so a
   * pit sized to dash reach in a room the player visits *before* picking up dash is a real
   * softlock, not just a cosmetic risk (this is exactly what stranded the playtest bot in an
   * early arena room during this module's own verification pass).
   */
  availableAbilities?: string[];
  /** Extra salt when regenerating a duplicate silhouette without changing the room's identity seed. */
  uniquenessSalt?: number;
}

/** A real, collidable one-solid platform in pixel space (see room-assembler.ts's use of this to
 *  emit an actual StaticBody2D — the painted tiles alone are visual only). */
export interface PlatformRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A real gap carved into the main floor collider, the player must jump/dash across. `x` is the
 *  gap's LEFT edge in pixel space (matches PlatformRect's rect convention) — room-assembler.ts
 *  converts to center-x when merging with WeakFloorPlacement's center-based convention. */
export interface PitGap {
  x: number;
  width: number;
}

export interface RoomTileLayoutResult {
  cells: TileCell[];
  platforms: PlatformRect[];
  pits: PitGap[];
  /** Visual composition metadata. Collision is platforms/pits, not this. */
  blueprint?: RoomBlueprint;
}

/** Inclusive/exclusive row range a platform can occupy and still be a) reachable by a single jump
 *  from the floor and b) leave room for the player's own hitbox to stand under it. */
function platformRowRange(
  floorRow: number,
  tileSize: number,
  stats: MovementStats,
): { minRow: number; maxRow: number } {
  const apexRows = Math.max(1, Math.floor((jumpApexPx(stats) * 0.82) / tileSize));
  // A platform painted at row `r` occupies pixels [r*tileSize, (r+1)*tileSize) — its own bottom
  // edge is one full tileSize below its row index, not at the row boundary itself. The clearance
  // check (floorTop - platformBottom >= PLAYER_CLEARANCE_PX) therefore needs that extra tileSize
  // folded into how many rows back from the floor the LOWEST legal platform row can be — omitting
  // it previously produced exactly PLAYER_CLEARANCE_PX of clearance with zero margin (the
  // player's own 48px collision box fit with nothing to spare), which is exactly what wedged a
  // playtest bot in a "traversal" room's shaft platform during this module's own verification.
  const clearanceRows = Math.max(1, Math.ceil(PLAYER_CLEARANCE_PX / tileSize)) + 1;
  const ceilingLimit = 2;
  // Must stay strictly above the floor row itself or the "platform" would overlap the floor tile.
  const floorLimit = Math.max(ceilingLimit, floorRow - 1);
  const highest = Math.min(floorLimit, Math.max(ceilingLimit, floorRow - apexRows));
  const lowest = Math.min(floorLimit, Math.max(ceilingLimit, floorRow - clearanceRows));
  return { minRow: Math.min(highest, lowest), maxRow: Math.max(highest, lowest) };
}

function climbRows(platMaxRow: number, count: number, jumpStep: number): number[] {
  const rows: number[] = [];
  let row = platMaxRow;
  for (let i = 0; i < count && row > 2; i++) {
    rows.push(row);
    row -= Math.max(1, jumpStep);
  }
  return rows;
}

function placePlatform(
  cells: TileCell[],
  platforms: PlatformRect[],
  tileSize: number,
  startCol: number,
  lengthCols: number,
  row: number,
): void {
  if (lengthCols < 2) lengthCols = 2;
  cells.push(cell(startCol, row, 'platform_left'));
  for (let x = startCol + 1; x < startCol + lengthCols - 1; x++) cells.push(cell(x, row, 'platform'));
  cells.push(cell(startCol + lengthCols - 1, row, 'platform_right'));
  platforms.push({ x: startCol * tileSize, y: row * tileSize, width: lengthCols * tileSize, height: tileSize });
}

/**
 * Paint real tile cells for a room (structure first). Collision StaticBody2D must occupy
 * the same floor band as the ground row. Platform/pit geometry is returned alongside the cells so
 * room-assembler.ts can emit matching real collision — the painted tiles by themselves carry no
 * physics (the generated TileSet has no physics layer; see RoomTileMap.gd).
 */
export function buildRoomTileCells(input: RoomTileLayoutInput): RoomTileLayoutResult {
  const { width, height, tileSize } = input;
  const cols = Math.max(1, Math.floor(width / tileSize));
  const rows = Math.max(1, Math.floor(height / tileSize));
  const floorRow = Math.max(1, Math.floor((height - tileSize * 2) / tileSize));
  const cells: TileCell[] = [];
  const platforms: PlatformRect[] = [];
  const pits: PitGap[] = [];
  const archetype = input.archetype ?? 'combat';
  const stats = input.movement ?? DEFAULT_MOVEMENT_STATS;
  const connections = input.connections ?? [];
  const rng = new SeededRNG((((input.seed ?? 1) + (input.uniquenessSalt ?? 0) * 9973) >>> 0) || 1);
  const { minRow: platMinRow, maxRow: platMaxRow } = platformRowRange(floorRow, tileSize, stats);
  const jumpStep = Math.max(1, Math.floor((jumpApexPx(stats) * 0.7) / tileSize));

  // A down-connection gated on ground_slam already reserves a floor gap for a WeakFloor scene
  // (see deriveWeakFloors in room-assembler.ts) — never double-carve that same span with a pit.
  const hasWeakFloorGap = connections.some(
    (c) => c.direction === 'down' && c.requirements.includes('ground_slam'),
  );
  // Dash-reach-sized pits are only safe once dash/air_dash is actually unlocked — see
  // RoomTileLayoutInput.availableAbilities's doc comment for why this isn't just cosmetic.
  const hasHorizontalReachAbility = (input.availableAbilities ?? []).some(
    (a) => a === 'dash' || a === 'air_dash',
  );

  // ---- Pit: a real gap in the main floor the player must jump or dash across. ----
  const pitEligible =
    !connections.some((c) => c.direction === 'up') &&
    !hasWeakFloorGap &&
    hasHorizontalReachAbility &&
    (archetype === 'challenge' ||
      (archetype === 'traversal' && rng.next() < 0.5) ||
      (archetype === 'arena' && rng.next() < 0.35));
  const maxPitWidthTiles = Math.max(
    2,
    Math.min(4, Math.floor((dashReachPx(stats) * PIT_WIDTH_SAFETY_FACTOR) / tileSize)),
  );
  const marginTiles = Math.max(3, Math.floor(cols * 0.2));
  let pitStartCol = -1;
  let pitEndCol = -1;
  if (pitEligible && cols > marginTiles * 2 + maxPitWidthTiles) {
    const pitWidthTiles = rng.int(2, maxPitWidthTiles);
    pitStartCol = rng.int(marginTiles, cols - marginTiles - pitWidthTiles);
    pitEndCol = pitStartCol + pitWidthTiles;
    pits.push({ x: pitStartCol * tileSize, width: pitWidthTiles * tileSize });
  }

  for (let x = 0; x < cols; x++) {
    if (x >= pitStartCol && x < pitEndCol) continue;
    cells.push(cell(x, floorRow, 'ground'));
    if (floorRow + 1 < rows) cells.push(cell(x, floorRow + 1, 'bottom_edge'));
    if (floorRow + 2 < rows) cells.push(cell(x, floorRow + 2, 'ground'));
    if (floorRow + 3 < rows) cells.push(cell(x, floorRow + 3, 'bottom_edge'));
  }
  // Playable air stays empty so biome parallax shows through. Filling the camera with a
  // rear dado painted every interior cell as the same masonry as the floor — a cream void,
  // not a composed room. Connector rooms still get a one-tile wainscot so a hallway reads
  // as having a baseboard rather than floating in sky.
  if (archetype === 'connector') {
    const dadoRow = floorRow - 1;
    if (dadoRow > 1) {
      for (let x = 1; x < cols - 1; x++) {
        if (x === Math.floor(cols / 2)) continue;
        cells.push(cell(x, dadoRow, 'top_edge'));
      }
    }
  }
  // Traversal rooms carve a multi-row vertical opening through the dado/rear wall so the shaft
  // (see below) reads as a real vertical passage rather than a platform stack painted over a
  // solid backdrop.
  let shaftCol = -1;
  if (archetype === 'traversal') {
    shaftCol = rng.int(Math.max(2, Math.floor(cols * 0.15)), Math.max(2, Math.floor(cols * 0.35)));
  }
  const leftDoor = connections.some((c) => c.direction === 'left');
  const rightDoor = connections.some((c) => c.direction === 'right');
  const upDoor = connections.some((c) => c.direction === 'up');
  for (let y = 0; y < floorRow; y++) {
    const leftOpening = leftDoor && y >= floorRow - SIDE_DOOR_ROWS && y < floorRow;
    const rightOpening = rightDoor && y >= floorRow - SIDE_DOOR_ROWS && y < floorRow;
    if (!leftOpening) cells.push(cell(0, y, 'wall'));
    if (!rightOpening) cells.push(cell(cols - 1, y, 'wall'));
  }
  for (let x = 1; x < cols - 1; x++) {
    const upOpening = upDoor && x >= Math.floor(cols * 0.4) && x <= Math.floor(cols * 0.6);
    if (upOpening) continue;
    cells.push(cell(x, 0, 'ceiling'));
  }
  cells.push(cell(0, 0, 'outside_tl'));
  cells.push(cell(cols - 1, 0, 'outside_tr'));
  cells.push(cell(0, floorRow, 'outside_bl'));
  cells.push(cell(cols - 1, floorRow, 'outside_br'));

  if (archetype === 'tutorial' && width >= 1280) {
    // Repeat locally reachable stair bays instead of scaling jump gaps with the hall.
    // Broad upper balconies and an uninterrupted floor give separate exploration
    // and combat lanes; each bay can be entered from the ground without an ability.
    const climb = climbRows(platMaxRow, 3, jumpStep);
    const stride = Math.max(3, Math.floor(80 / tileSize));
    const bayStep = Math.max(stride * 6, Math.floor(512 / tileSize));
    const start = Math.max(4, Math.floor(160 / tileSize));
    const balconyLength = Math.max(5, Math.floor(160 / tileSize));
    for (let base = start; base + stride * 2 + balconyLength < cols - 2; base += bayStep) {
      placePlatform(cells, platforms, tileSize, base, 3, climb[0] ?? platMaxRow);
      placePlatform(cells, platforms, tileSize, base + stride, 3, climb[1] ?? climb[0] ?? platMaxRow);
      placePlatform(cells, platforms, tileSize, base + stride * 2, balconyLength, climb[2] ?? climb[1] ?? platMaxRow);
    }
  } else if (archetype === 'tutorial') {
    // Three low steps (kept — tile-layout-archetypes.test.ts pins uniquePlatformHeights>1 and
    // platformCount>=3 here to distinguish the tutorial staircase from combat's flat islands),
    // but pulled tighter to the entrance and shorter than before so most of the room stays open
    // negative space toward the exit instead of reading as a 3-tier challenge room.
    const climb = climbRows(platMaxRow, 3, jumpStep);
    const lowCol = Math.max(2, Math.floor(cols * 0.12));
    const midCol = Math.max(lowCol + 4, Math.floor(cols * 0.24));
    const highCol = Math.max(midCol + 3, Math.floor(cols * 0.36));
    placePlatform(cells, platforms, tileSize, lowCol, 3, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, midCol, 3, climb[1] ?? climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, highCol, 3, climb[2] ?? climb[1] ?? platMaxRow);
  }

  if (archetype === 'combat' || archetype === 'arena') {
    // Wide flanking islands at similar height so the floor stays a fight bowl, not a staircase.
    const leftLen = rng.int(3, Math.max(4, Math.floor(cols * 0.16)));
    const rightLen = rng.int(3, Math.max(4, Math.floor(cols * 0.16)));
    placePlatform(cells, platforms, tileSize, Math.max(2, Math.floor(cols * 0.12)), leftLen, platMaxRow);
    placePlatform(
      cells,
      platforms,
      tileSize,
      Math.min(cols - 3 - rightLen, Math.floor(cols * 0.72)),
      rightLen,
      platMaxRow,
    );
  }

  if (archetype === 'challenge' || archetype === 'traversal') {
    const lengthCols = rng.int(5, Math.max(6, Math.floor(cols * 0.24)));
    const lowStart = rng.int(Math.floor(cols * 0.16), Math.max(Math.floor(cols * 0.16) + 1, Math.floor(cols * 0.5) - lengthCols));
    const lowRow = rng.int(platMinRow, platMaxRow);
    placePlatform(cells, platforms, tileSize, lowStart, lengthCols, lowRow);

    if (archetype === 'challenge') {
      // Upper platform must be reachable from the lower one within a single jump apex — not from
      // the floor directly — so it's genuinely a second traversal step, not a decorative twin.
      const upperMinRow = Math.max(2, lowRow - Math.max(1, Math.floor((jumpApexPx(stats) * 0.82) / tileSize)));
      const upperRow = rng.int(upperMinRow, Math.max(upperMinRow, lowRow - 2));
      const upperLength = rng.int(3, Math.max(4, Math.floor(cols * 0.16)));
      const upperStart = rng.int(Math.floor(cols * 0.5), Math.max(Math.floor(cols * 0.5) + 1, cols - 3 - upperLength));
      placePlatform(cells, platforms, tileSize, upperStart, upperLength, upperRow);
    }

    if (archetype === 'traversal' && shaftCol >= 0) {
      // A short ascending stack of platforms through the carved-out wall opening — each step is
      // within a single jump apex of the one below it, so the whole shaft is climbable.
      // Start at platMaxRow (the lowest row that still leaves PLAYER_CLEARANCE_PX under the
      // platform). Using `floorRow - jumpStep` with tileSize 32 landed on floorRow-2 and left
      // only 32px under the first step — less than the player's 48px hitbox — which wedged
      // the playtest bot walking the floor corridor ("walk_timeout" room_001 → room_002).
      const jumpStep = Math.max(1, Math.floor((jumpApexPx(stats) * 0.7) / tileSize));
      let stepRow = platMaxRow;
      const stepCol = Math.max(1, Math.min(cols - 7, shaftCol));
      for (let i = 0; i < 3 && stepRow > 3; i++) {
        placePlatform(cells, platforms, tileSize, stepCol + (i % 2 === 0 ? 0 : 3), 3, stepRow);
        stepRow -= jumpStep;
      }
    }
  }

  if (archetype === 'secret') {
    // Optional connections are how this pipeline already models branch/secret access (see
    // world.ts's branching shortcuts) — when this room is only reachable via an optional edge,
    // treat it as genuinely concealed: push the niche near the room's edge, close to the top of
    // single-jump reach, and gate the run-up with a short dash-only pit so it can't be walked into
    // by accident. A non-optional "secret" room (reached via the main spine) just gets an offset
    // niche instead of the full gauntlet.
    const concealed = connections.some((c) => c.optional);
    const nicheCol = rng.next() < 0.5 ? rng.int(2, Math.max(3, Math.floor(cols * 0.12))) : rng.int(Math.max(3, cols - Math.floor(cols * 0.12) - 4), Math.max(4, cols - 4));
    const nicheRow = Math.max(2, floorRow - Math.max(1, Math.floor((jumpApexPx(stats) * 0.9) / tileSize)));
    if (nicheRow < floorRow - 1) {
      placePlatform(cells, platforms, tileSize, nicheCol, 3, nicheRow);
      if (concealed && !hasWeakFloorGap && hasHorizontalReachAbility) {
        const approachWidthTiles = Math.max(2, Math.min(3, Math.floor((dashReachPx(stats) * PIT_WIDTH_SAFETY_FACTOR) / tileSize)));
        const approachCol = nicheCol > cols / 2 ? nicheCol - approachWidthTiles - 1 : nicheCol + 4;
        // Only needs to clear the room's own side walls (col 0 / cols-1) — unlike the primary
        // pit, this one is deliberately placed right next to the (already edge-offset) niche.
        if (approachCol > 1 && approachCol + approachWidthTiles < cols - 1) {
          for (let x = 0; x < cols; x++) {
            if (x >= approachCol && x < approachCol + approachWidthTiles) {
              // Remove any floor cells already painted in this span (idempotent: floor loop above
              // already skipped the primary pit range, this is a second, secret-only gap).
              for (let i = cells.length - 1; i >= 0; i--) {
                const c = cells[i]!;
                if (c.x === x && (c.y === floorRow || c.y === floorRow + 1 || c.y === floorRow + 2 || c.y === floorRow + 3)) {
                  cells.splice(i, 1);
                }
              }
            }
          }
          pits.push({ x: approachCol * tileSize, width: approachWidthTiles * tileSize });
        }
      }
    }
  }

  if (archetype === 'ability_gate' || archetype === 'ability_shrine') {
    const required = new Set(connections.flatMap((c) => c.requirements));
    const verticalAbility = [...required].find(
      (r) => r === 'double_jump' || r === 'air_dash' || r === 'grapple' || r === 'wall_jump' || r === 'wall_slide',
    );
    const gx = rng.int(Math.floor(cols * 0.4), Math.floor(cols * 0.68));
    const earliestApproach = Math.max(2, Math.floor(cols * 0.18));
    const altarCol = Math.min(cols - 6, Math.max(earliestApproach + 6, Math.floor(cols * 0.52)));
    // Keep the pickup approach local instead of stretching its jump with room width.
    const approachCol = Math.max(earliestApproach, altarCol - 4 - Math.max(1, Math.ceil(32 / tileSize)));
    const climb = climbRows(platMaxRow, 2, jumpStep);
    placePlatform(cells, platforms, tileSize, approachCol, 4, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, altarCol, 4, climb[1] ?? platMaxRow);
    let doorTopRow: number;
    if (verticalAbility === 'wall_jump' || verticalAbility === 'wall_slide') {
      // Real wall-jump/wall-climb reach is treated as unbounded within a single room (see
      // movement-feasibility.ts's comment on the same assumption) — the column spans nearly the
      // full room height so the gate genuinely reads as a climbable shaft, not a short doorway.
      doorTopRow = 2;
    } else if (verticalAbility === 'double_jump' || verticalAbility === 'air_dash' || verticalAbility === 'grapple') {
      const reachPx = verticalAbility === 'grapple' ? dashReachPx(stats) * 4 : doubleJumpReachPx(stats);
      doorTopRow = Math.max(2, floorRow - Math.floor((reachPx * 0.85) / tileSize));
    } else {
      doorTopRow = Math.max(2, floorRow - rng.int(4, 6));
    }
    if (archetype === 'ability_gate') {
      for (let y = doorTopRow; y < floorRow; y++) {
        cells.push(cell(gx, y, 'door'));
      }
    }
    // Ability-gate requirements live on RoomTransition. Carving a floor pit here severs the
    // walk corridor after dash is already granted (room_006 → room_007) and the playtest
    // bot cannot dash — it times out / never fires the right-hand door.
  }

  if (archetype === 'save') {
    // A small protected dais and nothing else — a single-tier chamber, not a two-step scaffold,
    // so it reads as "small room around a checkpoint" rather than a generic platforming room.
    const daisCol = Math.max(2, Math.floor(cols * 0.44));
    const climb = climbRows(platMaxRow, 1, jumpStep);
    placePlatform(cells, platforms, tileSize, daisCol, 3, climb[0] ?? platMaxRow);
  }

  if (archetype === 'npc' || archetype === 'shop') {
    // One wide, low bench spanning most of the room's width — low platform density, a stable
    // "room-within-a-room" floor rather than the multi-tier scaffolds combat/tutorial use.
    const benchCol = Math.max(3, Math.floor(cols * 0.22));
    const benchLen = Math.max(6, Math.floor(cols * 0.5));
    const climb = climbRows(platMaxRow, 1, jumpStep);
    placePlatform(cells, platforms, tileSize, benchCol, benchLen, climb[0] ?? platMaxRow);
  }

  if (archetype === 'puzzle') {
    const climb = climbRows(platMaxRow, 3, jumpStep);
    const lowCol = Math.max(2, Math.floor(cols * 0.32));
    const gapCols = Math.max(1, Math.ceil(32 / tileSize));
    const midCol = lowCol + 4 + gapCols;
    const highCol = midCol + 3 + gapCols;
    placePlatform(cells, platforms, tileSize, lowCol, 4, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, midCol, 3, climb[1] ?? platMaxRow);
    if (climb[2] !== undefined) {
      placePlatform(cells, platforms, tileSize, highCol, 3, climb[2]);
    }
  }

  if (archetype === 'connector') {
    const ledge = rng.int(Math.floor(cols * 0.35), Math.floor(cols * 0.55));
    placePlatform(cells, platforms, tileSize, ledge, 3, platMaxRow);
  }

  if (archetype === 'set_piece') {
    const monumentCol = rng.int(Math.floor(cols * 0.38), Math.floor(cols * 0.52));
    placePlatform(cells, platforms, tileSize, monumentCol, 5, platMinRow);
  }

  if (archetype === 'transition') {
    const leftPlat = rng.int(3, Math.max(4, Math.floor(cols * 0.22)));
    placePlatform(cells, platforms, tileSize, Math.floor(cols * 0.12), leftPlat, platMaxRow);
    placePlatform(cells, platforms, tileSize, Math.floor(cols * 0.62), 4, platMinRow);
  }

  if (archetype === 'treasure') {
    const alcove = rng.next() < 0.5 ? 2 : cols - 7;
    const step = Math.max(2, alcove === 2 ? alcove + 6 : alcove - 6);
    const climb = climbRows(platMaxRow, 3, jumpStep);
    placePlatform(cells, platforms, tileSize, step, 3, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, Math.floor((step + alcove) / 2), 3, climb[1] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, alcove, 4, climb[2] ?? platMaxRow);
  }

  if (archetype === 'boss') {
    const climb = climbRows(platMaxRow, 2, jumpStep);
    placePlatform(cells, platforms, tileSize, 3, 4, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, cols - 8, 4, climb[1] ?? climb[0] ?? platMaxRow);
  }

  if (archetype === 'miniboss') {
    const midCol = Math.max(3, Math.floor(cols * 0.38));
    placePlatform(cells, platforms, tileSize, midCol, 6, platMaxRow);
  }

  // A ceiling opening needs a complete ascent regardless of the room's archetype.
  // Keep solid platforms in alternating columns so the player can jump beside their
  // undersides. Reusing the archetype's decorative platforms can obstruct this shaft.
  if (upDoor) {
    const riseRows = Math.floor((jumpApexPx(stats) * 0.82) / tileSize);
    const minimumRows = Math.ceil(PLAYER_CLEARANCE_PX / tileSize) + 1;
    const platformCols = Math.max(2, Math.ceil(48 / tileSize));
    const gapCols = Math.max(2, Math.ceil(32 / tileSize));
    const centerCol = Math.floor(cols / 2);
    const leftCol = centerCol - Math.ceil(gapCols / 2) - platformCols;
    const rightCol = centerCol + Math.floor(gapCols / 2);
    if (riseRows < minimumRows || 2 * riseRows * tileSize - tileSize - 48 < stats.jumpHeight ||
        leftCol < Math.floor(cols * 0.4) || rightCol + platformCols > Math.floor(cols * 0.6) + 1) {
      throw new Error('Ceiling exit needs more jump height or room width for a clear ascent');
    }
    const rise = riseRows * tileSize;
    const jumpVelocity = Math.sqrt(2 * stats.gravity * stats.jumpHeight);
    const landingTime = (jumpVelocity + Math.sqrt(jumpVelocity ** 2 - 2 * stats.gravity * rise)) / stats.gravity;
    const centerDistance = (platformCols + gapCols) * tileSize;
    if (!Number.isFinite(landingTime) || centerDistance > stats.walkSpeed * landingTime * 0.8) {
      throw new Error('Ceiling ascent exceeds configured horizontal jump reach');
    }
    const occupied = new Set<string>();
    for (const platform of platforms) {
      for (let col = platform.x / tileSize; col < (platform.x + platform.width) / tileSize; col++) {
        occupied.add(`${col},${platform.y / tileSize}`);
      }
    }
    for (let i = cells.length - 1; i >= 0; i--) {
      if (occupied.has(`${cells[i]!.x},${cells[i]!.y}`)) cells.splice(i, 1);
    }
    platforms.length = 0;
    let side = 0;
    for (let row = floorRow - riseRows; row >= 2; row -= riseRows) {
      placePlatform(cells, platforms, tileSize, side++ % 2 === 0 ? leftCol : rightCol, platformCols, row);
    }
  }

  const composed = composePlayableVisuals({
    cells,
    platforms,
    pits: pits.map((p) => ({ x: p.x, y: 0, width: p.width, height: tileSize })),
    cols,
    rows,
    floorRow,
    tileSize,
    width,
    height,
    archetype,
    seed: (((input.seed ?? 1) + (input.uniquenessSalt ?? 0) * 9973) >>> 0) || 1,
    connections,
  });

  // Material patches intentionally run after semantic composition, so suppress once more after
  // patching to ensure their shared condition cannot recreate long identical atlas runs.
  const terrainCells = applyTerrainVariants(composed.cells, input.seed ?? 1);
  return { cells: suppressRepetition(terrainCells, input.seed ?? 1), platforms, pits, blueprint: composed.blueprint };
}

/** Pixel Y of the walkable floor top (agrees with ground tile row). */
export function floorTopPx(height: number, tileSize: number): number {
  const floorRow = Math.max(1, Math.floor((height - tileSize * 2) / tileSize));
  return floorRow * tileSize;
}

/** Side-door cut matches the painted wall opening (`floorRow - 4` .. `floorRow`). */
export const SIDE_DOOR_ROWS = 4;

export interface ShellColliderRect {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Collision for painted wall/ceiling tiles. Openings match `buildRoomTileCells` so
 *  jump/dash cannot leave the room except through real doors, pits, and down shafts. */
export function buildRoomShellColliders(input: {
  width: number;
  height: number;
  tileSize: number;
  connections?: Array<{ direction: string }>;
}): ShellColliderRect[] {
  const { width, height, tileSize } = input;
  const cols = Math.max(1, Math.floor(width / tileSize));
  const floorRow = Math.max(1, Math.floor((height - tileSize * 2) / tileSize));
  const floorTop = floorRow * tileSize;
  const connections = input.connections ?? [];
  const leftDoor = connections.some((c) => c.direction === 'left');
  const rightDoor = connections.some((c) => c.direction === 'right');
  const upDoor = connections.some((c) => c.direction === 'up');
  const doorTop = Math.max(0, (floorRow - SIDE_DOOR_ROWS) * tileSize);
  const rects: ShellColliderRect[] = [];

  const push = (name: string, x: number, y: number, w: number, h: number) => {
    if (w >= 1 && h >= 1) rects.push({ name, x, y, width: w, height: h });
  };

  if (leftDoor) {
    push('ShellLeftUpper', 0, 0, tileSize, doorTop);
  } else {
    push('ShellLeft', 0, 0, tileSize, floorTop);
  }
  if (rightDoor) {
    push('ShellRightUpper', width - tileSize, 0, tileSize, doorTop);
  } else {
    push('ShellRight', width - tileSize, 0, tileSize, floorTop);
  }

  if (upDoor) {
    const upLeft = Math.floor(cols * 0.4) * tileSize;
    const upRight = (Math.floor(cols * 0.6) + 1) * tileSize;
    push('ShellCeilingLeft', 0, 0, upLeft, tileSize);
    push('ShellCeilingRight', upRight, 0, Math.max(0, width - upRight), tileSize);
  } else {
    push('ShellCeiling', 0, 0, width, tileSize);
  }
  return rects;
}
