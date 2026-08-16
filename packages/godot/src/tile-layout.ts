import type { TileCell } from './room-assembler.js';
import { SeededRNG, DEFAULT_MOVEMENT_STATS, type MovementStats } from '@metroforge/procedural';

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
    const leftOpening = leftDoor && y >= floorRow - 4 && y < floorRow;
    const rightOpening = rightDoor && y >= floorRow - 4 && y < floorRow;
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

  if (archetype === 'tutorial') {
    const climb = climbRows(platMaxRow, 3, jumpStep);
    const lowCol = Math.max(2, Math.floor(cols * 0.14));
    const midCol = Math.max(lowCol + 5, Math.floor(cols * 0.34));
    const highCol = Math.max(midCol + 4, Math.floor(cols * 0.54));
    placePlatform(cells, platforms, tileSize, lowCol, 4, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, midCol, 4, climb[1] ?? climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, highCol, 4, climb[2] ?? climb[1] ?? platMaxRow);
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
    const dashAbility = required.has('dash') || required.has('air_dash');
    const gx = rng.int(Math.floor(cols * 0.4), Math.floor(cols * 0.68));
    const approachCol = Math.max(2, Math.floor(cols * 0.18));
    const altarCol = Math.min(cols - 6, Math.max(approachCol + 6, Math.floor(cols * 0.52)));
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
    if (
      dashAbility &&
      hasHorizontalReachAbility &&
      !hasWeakFloorGap &&
      archetype === 'ability_gate'
    ) {
      const pitWidthTiles = Math.max(2, Math.min(3, maxPitWidthTiles));
      const pitCol = Math.max(marginTiles, Math.min(cols - marginTiles - pitWidthTiles, altarCol - pitWidthTiles - 1));
      if (pitCol > 1 && pitCol + pitWidthTiles < cols - 1) {
        for (let x = pitCol; x < pitCol + pitWidthTiles; x++) {
          for (let i = cells.length - 1; i >= 0; i--) {
            const c = cells[i]!;
            if (c.x === x && (c.y === floorRow || c.y === floorRow + 1 || c.y === floorRow + 2 || c.y === floorRow + 3)) {
              cells.splice(i, 1);
            }
          }
        }
        pits.push({ x: pitCol * tileSize, width: pitWidthTiles * tileSize });
      }
    }
  }

  if (archetype === 'arena' || archetype === 'boss' || archetype === 'miniboss') {
    const deco = rng.int(Math.max(2, Math.floor(cols * 0.12)), Math.max(3, Math.floor(cols * 0.28)));
    cells.push(cell(deco, floorRow - 1, 'decor_a'));
    cells.push(cell(cols - deco, floorRow - 1, 'decor_b'));
  }

  if (archetype === 'save') {
    const lx = rng.int(Math.max(2, Math.floor(cols * 0.3)), Math.max(3, Math.floor(cols * 0.6)));
    cells.push(cell(lx, floorRow - 1, 'decor_a'));
    const daisCol = Math.max(2, Math.floor(cols * 0.42));
    const climb = climbRows(platMaxRow, 2, jumpStep);
    placePlatform(cells, platforms, tileSize, daisCol, 3, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, daisCol + 5, 2, climb[1] ?? platMaxRow);
  }

  if (archetype === 'npc' || archetype === 'shop') {
    const benchCol = Math.max(3, Math.floor(cols * 0.36));
    const climb = climbRows(platMaxRow, 2, jumpStep);
    placePlatform(cells, platforms, tileSize, benchCol, 6, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, Math.max(2, benchCol - 6), 3, climb[1] ?? platMaxRow);
  }

  if (archetype === 'puzzle') {
    const climb = climbRows(platMaxRow, 3, jumpStep);
    placePlatform(cells, platforms, tileSize, Math.max(2, Math.floor(cols * 0.18)), 4, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, Math.max(2, Math.floor(cols * 0.42)), 3, climb[1] ?? platMaxRow);
    if (climb[2] !== undefined) {
      placePlatform(cells, platforms, tileSize, Math.max(2, Math.floor(cols * 0.62)), 3, climb[2]);
    }
  }

  if (archetype === 'connector') {
    const ledge = rng.int(Math.floor(cols * 0.35), Math.floor(cols * 0.55));
    placePlatform(cells, platforms, tileSize, ledge, 3, platMaxRow);
  }

  if (archetype === 'set_piece') {
    const monumentCol = rng.int(Math.floor(cols * 0.38), Math.floor(cols * 0.52));
    placePlatform(cells, platforms, tileSize, monumentCol, 5, platMinRow);
    const monumentTop = platMinRow - 1 > 1 ? platMinRow - 1 : platMinRow;
    cells.push(cell(monumentCol + 2, monumentTop, 'decor_a'));
  }

  if (archetype === 'transition') {
    const split = Math.floor(cols * 0.5);
    cells.push(cell(split, floorRow - 1, 'hazard'));
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
    const topRow = climb[2] ?? platMaxRow;
    const alcoveTop = topRow - 1 > 1 ? topRow - 1 : topRow;
    cells.push(cell(alcove + 1, alcoveTop, 'decor_b'));
  }

  if (archetype === 'boss') {
    const climb = climbRows(platMaxRow, 2, jumpStep);
    placePlatform(cells, platforms, tileSize, 3, 4, climb[0] ?? platMaxRow);
    placePlatform(cells, platforms, tileSize, cols - 8, 4, climb[1] ?? climb[0] ?? platMaxRow);
  }

  if (archetype === 'miniboss') {
    const midCol = Math.max(3, Math.floor(cols * 0.38));
    placePlatform(cells, platforms, tileSize, midCol, 6, platMaxRow);
    cells.push(cell(midCol + 2, platMaxRow - 1 > 1 ? platMaxRow - 1 : platMaxRow, 'hazard'));
  }

  return { cells, platforms, pits };
}

/** Pixel Y of the walkable floor top (agrees with ground tile row). */
export function floorTopPx(height: number, tileSize: number): number {
  const floorRow = Math.max(1, Math.floor((height - tileSize * 2) / tileSize));
  return floorRow * tileSize;
}
