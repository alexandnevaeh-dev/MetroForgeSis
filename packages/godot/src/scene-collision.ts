type Point = { x: number; y: number };
type Properties = Record<string, string>;
interface Shape { type: string; props: Properties }
interface Node { name: string; type: string; props: Properties; shapes: Map<string, Shape>; children: Node[] }
export interface SceneCollisionRect { path: string; x: number; y: number; w: number; h: number; points?: Point[] }
export interface SceneCollision { tileSize: number; widthTiles: number; heightTiles: number; rects: SceneCollisionRect[]; source: 'godot_scene' }

function quoted(header: string, key: string): string | undefined {
  const value = new RegExp(`(?:^|\\s)${key}=("(?:[^"\\\\]|\\\\.)*")`).exec(header)?.[1];
  return value ? JSON.parse(value) : undefined;
}
function numeric(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value))) throw new Error('Unsupported numeric scene expression');
  return Number(value);
}
function vector(value: string | undefined, fallback: Point): Point {
  if (!value) return fallback;
  const parts = /^Vector2\(([^,]+),([^,]+)\)$/.exec(value.trim());
  if (!parts) throw new Error('Unsupported scene transform');
  return { x: numeric(parts[1], 0), y: numeric(parts[2], 0) };
}
function tree(text: string, resolveScene: ((path: string) => string) | undefined, stack: string[]): Node {
  if (stack.length > 12) throw new Error('Scene nesting exceeds supported depth');
  const sections: Array<{ header: string; props: Properties }> = [];
  let section: typeof sections[number] | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('[')) { section = { header: line, props: {} }; sections.push(section); }
    else { const pair = /^([\w/.]+)\s*=\s*(.*)$/.exec(line); if (pair && section) section.props[pair[1]!] = pair[2]!; }
  }
  const shapes = new Map<string, Shape>(), scenes = new Map<string, string>();
  for (const row of sections) {
    if (row.header.startsWith('[sub_resource')) shapes.set(quoted(row.header, 'id') ?? '', { type: quoted(row.header, 'type') ?? '', props: row.props });
    if (row.header.startsWith('[ext_resource') && quoted(row.header, 'type') === 'PackedScene') scenes.set(quoted(row.header, 'id') ?? '', quoted(row.header, 'path') ?? '');
  }
  const nodes = new Map<string, Node>(); let root: Node | undefined;
  for (const row of sections.filter(row => row.header.startsWith('[node '))) {
    const name = quoted(row.header, 'name'); if (!name) throw new Error('Scene node has no name');
    const parent = quoted(row.header, 'parent');
    const path = parent === undefined ? '.' : parent === '.' ? name : parent + '/' + name;
    let node: Node = { name, type: quoted(row.header, 'type') ?? '', props: row.props, shapes, children: [] };
    const instance = /instance=ExtResource\("([^"]+)"\)/.exec(row.header)?.[1];
    if (instance) {
      const resource = scenes.get(instance); if (!resource || !resolveScene) throw new Error('Instanced scene collision cannot be resolved');
      if (stack.includes(resource)) throw new Error('Circular scene instance');
      const inherited = tree(resolveScene(resource), resolveScene, [...stack, resource]);
      node = { ...inherited, name, props: { ...inherited.props, ...row.props } };
    }
    if (nodes.has(path)) throw new Error('Duplicate scene node');
    if (parent === undefined) { if (root) throw new Error('Multiple scene roots'); root = node; }
    else { const holder = nodes.get(parent); if (!holder) throw new Error('Scene parent is missing'); holder.children.push(node); }
    nodes.set(path, node);
  }
  if (!root) throw new Error('Room scene has no root');
  return root;
}
type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
function transformed(parent: Matrix, props: Properties): Matrix {
  if (props.transform !== undefined || numeric(props.skew, 0) !== 0 || props.top_level === 'true') throw new Error('Unsupported scene transform');
  const p = vector(props.position, { x: 0, y: 0 }), s = vector(props.scale, { x: 1, y: 1 }), r = numeric(props.rotation, 0);
  const a = Math.cos(r) * s.x, b = Math.sin(r) * s.x, c = -Math.sin(r) * s.y, d = Math.cos(r) * s.y;
  return [parent[0] * a + parent[2] * b, parent[1] * a + parent[3] * b, parent[0] * c + parent[2] * d, parent[1] * c + parent[3] * d, parent[0] * p.x + parent[2] * p.y + parent[4], parent[1] * p.x + parent[3] * p.y + parent[5]];
}

/** Read authored static collision from generated text scenes, including instanced bodies.
 * Scripts are not executed. Unsupported active shape kinds fail explicitly rather than
 * presenting painted cells or bounding boxes as actual collision. */
export function parseRoomSceneCollision(text: string, resolveScene?: (path: string) => string): SceneCollision {
  const root = tree(text, resolveScene, []), rects: SceneCollisionRect[] = [];
  let width = 0, height = 0, tileSize = 0;
  function visit(node: Node, parent: Matrix, path: string, body?: { solid: boolean }) {
    const matrix = path === '.' ? identity : transformed(parent, node.props);
    if (node.props.tile_size !== undefined && node.props.room_width !== undefined) {
      tileSize = numeric(node.props.tile_size, 0); width = numeric(node.props.room_width, 0); height = numeric(node.props.room_height, 0);
    }
    const physicsBody = ['StaticBody2D', 'CharacterBody2D', 'RigidBody2D', 'Area2D'].includes(node.type)
      ? { solid: node.type === 'StaticBody2D' && (numeric(node.props.collision_layer, 1) & 1) !== 0 } : body;
    if ((node.type === 'CollisionShape2D' || node.type === 'CollisionPolygon2D') && physicsBody?.solid && node.props.disabled !== 'true') {
      const id = /^SubResource\("([^"]+)"\)$/.exec(node.props.shape ?? '')?.[1], shape = id ? node.shapes.get(id) : undefined;
      if (!shape || shape.type !== 'RectangleShape2D') throw new Error(`Unsupported static collision shape: ${path}`);
      const size = vector(shape.props.size, { x: 20, y: 20 }); if (size.x <= 0 || size.y <= 0) throw new Error('Invalid collision dimensions');
      const points = [{ x: -size.x / 2, y: -size.y / 2 }, { x: size.x / 2, y: -size.y / 2 }, { x: size.x / 2, y: size.y / 2 }, { x: -size.x / 2, y: size.y / 2 }].map(p => ({ x: matrix[0] * p.x + matrix[2] * p.y + matrix[4], y: matrix[1] * p.x + matrix[3] * p.y + matrix[5] }));
      const left = Math.min(...points.map(p => p.x)), top = Math.min(...points.map(p => p.y));
      rects.push({ path, x: left, y: top, w: Math.max(...points.map(p => p.x)) - left, h: Math.max(...points.map(p => p.y)) - top, ...(Math.abs(matrix[1]) > 1e-9 || Math.abs(matrix[2]) > 1e-9 ? { points } : {}) });
    }
    for (const child of node.children) visit(child, matrix, path === '.' ? child.name : path + '/' + child.name, physicsBody);
  }
  visit(root, identity, '.');
  if (![tileSize, width, height].every(value => Number.isSafeInteger(value) && value > 0) || tileSize > 256) throw new Error('Room scene grid dimensions are missing or invalid');
  return { tileSize, widthTiles: Math.ceil(width / tileSize), heightTiles: Math.ceil(height / tileSize), rects, source: 'godot_scene' };
}
