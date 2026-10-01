/** Reserve cardinal routes for the shipped 20px-wide top-down player before
 * collision rectangles are assembled. Prefer existing floor; cut the smallest
 * necessary openings instead of flattening a room's shelves/pews into a box. */
export function ensureNavigationClearance(
  tiles: number[][],
  points: Array<{ x: number; y: number }>,
  tileSize: number,
): void {
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new Error('Tile size must be positive');
  if (points.length === 0) return;
  const height = tiles.length,
    width = tiles[0]?.length ?? 0;
  const radius = Math.ceil(10 / tileSize);
  const min = radius + 1,
    maxX = width - radius - 2,
    maxY = height - radius - 2;
  if (maxX < min || maxY < min) throw new Error('Area is too small for player clearance');
  const inside = (x: number, y: number) => x >= min && y >= min && x <= maxX && y <= maxY;
  const floor = (tile: number | undefined) => tile === 0 || tile === 1;
  const blockedCount = (id: number): number => {
    const x = id % width,
      y = Math.floor(id / width);
    let count = 0;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) if (!floor(tiles[y + dy]?.[x + dx])) count++;
    return count;
  };
  const carve = (id: number) => {
    const x = id % width,
      y = Math.floor(id / width);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (!floor(tiles[y + dy]![x + dx])) tiles[y + dy]![x + dx] = 1;
  };
  const neighbors = (id: number): number[] => {
    const x = id % width,
      y = Math.floor(id / width);
    return [
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
      [x, y - 1],
    ]
      .filter(([nx, ny]) => inside(nx!, ny!))
      .map(([nx, ny]) => ny! * width + nx!);
  };
  const targets = points.map((p) => {
    // Scattered town attachments may extend beyond the safe perimeter.
    p.x = Math.max(min * tileSize, Math.min((maxX + 1) * tileSize - 0.001, p.x));
    p.y = Math.max(min * tileSize, Math.min((maxY + 1) * tileSize - 0.001, p.y));
    return Math.floor(p.y / tileSize) * width + Math.floor(p.x / tileSize);
  });
  for (const id of targets) carve(id);
  const start = targets[0]!;
  const flood = (): Set<number> => {
    const queue = [start],
      seen = new Set(queue);
    for (let i = 0; i < queue.length; i++)
      for (const next of neighbors(queue[i]!)) {
        if (!seen.has(next) && blockedCount(next) === 0) {
          seen.add(next);
          queue.push(next);
        }
      }
    return seen;
  };
  let reachable = flood();
  for (const target of targets) {
    if (reachable.has(target)) continue;
    const costs = new Float64Array(width * height).fill(Infinity);
    const parent = new Int32Array(width * height).fill(-1);
    const open = new MinQueue();
    costs[start] = 0;
    open.push(start, 0);
    const settled = new Set<number>();
    while (open.length) {
      const current = open.pop();
      if (settled.has(current)) continue;
      settled.add(current);
      if (current === target) break;
      for (const next of neighbors(current)) {
        const cost = costs[current]! + 1 + 12 * blockedCount(next);
        if (cost >= costs[next]!) continue;
        costs[next] = cost;
        parent[next] = current;
        const heuristic =
          Math.abs((next % width) - (target % width)) +
          Math.abs(Math.floor(next / width) - Math.floor(target / width));
        open.push(next, cost + heuristic);
      }
    }
    if (parent[target] === -1) throw new Error('Unable to connect required room objects');
    for (let id = target; id !== -1; id = parent[id]!) carve(id);
    reachable = flood();
  }
}

/** Stable min-heap keeps route repair bounded even on large overworlds. */
class MinQueue {
  private entries: Array<{ id: number; score: number }> = [];
  get length(): number {
    return this.entries.length;
  }
  push(id: number, score: number): void {
    const value = { id, score };
    let i = this.entries.length;
    this.entries.push(value);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.entries[p]!.score <= score) break;
      this.entries[i] = this.entries[p]!;
      i = p;
    }
    this.entries[i] = value;
  }
  pop(): number {
    const result = this.entries[0]!.id;
    const last = this.entries.pop()!;
    if (this.entries.length) {
      let i = 0;
      while (i * 2 + 1 < this.entries.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < this.entries.length &&
          this.entries[child + 1]!.score < this.entries[child]!.score
        )
          child++;
        if (last.score <= this.entries[child]!.score) break;
        this.entries[i] = this.entries[child]!;
        i = child;
      }
      this.entries[i] = last;
    }
    return result;
  }
}
