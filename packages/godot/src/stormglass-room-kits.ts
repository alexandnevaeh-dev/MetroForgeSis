import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { GameDNA, WorldGraph } from '@metroforge/schemas';
import { buildStormglassGalleryBlueprint } from './stormglass-gallery-blueprint.js';

/** Bounds for original archive assemblies; they never occupy doorway thresholds.
 * Existing author-owned kit files are left alone by the admission path. */
export function validStormglassArchiveBays(value: unknown, roomWidth: number): boolean {
  if (!Number.isFinite(roomWidth) || roomWidth < 512 || !Array.isArray(value) || value.length > 32) return false;
  const ids = new Set<string>();
  return value.every((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const bay = raw as { id?: unknown; kind?: unknown; x?: unknown; width?: unknown; height?: unknown };
    if (typeof bay.id !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(bay.id) || ids.has(bay.id) ||
      !['book-recess', 'scribe-desk', 'ledger-pedestal', 'scroll-cabinet'].includes(String(bay.kind))) return false;
    if (typeof bay.x !== 'number' || typeof bay.width !== 'number' || typeof bay.height !== 'number' ||
      ![bay.x, bay.width, bay.height].every(Number.isFinite) || bay.width < 64 || bay.width > 1024 ||
      bay.height < 32 || bay.height > 384 || bay.x - bay.width / 2 < 192 || bay.x + bay.width / 2 > roomWidth - 192) return false;
    ids.add(bay.id);
    return true;
  });
}
/** Validate sampling geometry without changing or resampling the atlas. */
export function validStormglassKitManifest(value: unknown, png: Buffer): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    png.length < 24 ||
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return false;
  const m = value as { version?: unknown; size?: unknown; entries?: unknown; sha256?: unknown };
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  if (
    m.version !== 1 ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    png.toString('ascii', 12, 16) !== 'IHDR' ||
    !Array.isArray(m.entries) ||
    m.entries.length < 1 ||
    m.entries.length > 256
  )
    return false;
  if (
    m.size !== undefined &&
    (!Array.isArray(m.size) || m.size[0] !== width || m.size[1] !== height)
  )
    return false;
  if (createHash('sha256').update(png).digest('hex') !== String(m.sha256).toLowerCase())
    return false;
  const roles = new Set<string>(),
    regions: number[][] = [];
  const rect = (v: unknown): v is number[] =>
    Array.isArray(v) &&
    v.length === 4 &&
    v.every(Number.isSafeInteger) &&
    v[0] >= 0 &&
    v[1] >= 0 &&
    v[2] > 0 &&
    v[3] > 0;
  for (const raw of m.entries) {
    if (!raw || typeof raw !== 'object') return false;
    const e = raw as {
      role?: unknown;
      region?: unknown;
      opaqueBounds?: unknown;
      anchor?: unknown;
      filterClip?: unknown;
    };
    if (
      typeof e.role !== 'string' ||
      !/^[a-z0-9_]{1,64}$/.test(e.role) ||
      roles.has(e.role) ||
      e.anchor !== 'opaque-bottom-center' ||
      e.filterClip !== true ||
      !rect(e.region) ||
      !rect(e.opaqueBounds)
    )
      return false;
    const r = e.region,
      b = e.opaqueBounds;
    if (
      r[0]! + r[2]! > width ||
      r[1]! + r[3]! > height ||
      b[0]! + b[2]! > r[2]! ||
      b[1]! + b[3]! > r[3]!
    )
      return false;
    if (
      regions.some(
        (a) =>
          r[0]! < a[0]! + a[2]! &&
          r[0]! + r[2]! > a[0]! &&
          r[1]! < a[1]! + a[3]! &&
          r[1]! + r[3]! > a[1]!,
      )
    )
      return false;
    roles.add(e.role);
    regions.push(r);
  }
  return true;
}
/** Admit the authored kit only for the matching side-view blueprint, after verifying its assets.
 * Existing author-owned room layouts are never overwritten. */
export function configureStormglassGalleryRoomKits(
  outputDir: string,
  dna: GameDNA,
  graph: WorldGraph,
): boolean {
  if (
    dna.archetype !== 'SIDE_VIEW_METROIDVANIA' ||
    !dna.identity.title.startsWith('Stormglass Reliquary')
  )
    return false;
  const expanded = graph.nodes.some(
    (node) => node.metadata.stormglassRegionProfile === 'expanded-region',
  );
  const blueprint = buildStormglassGalleryBlueprint(expanded ? 'expanded-region' : 'gallery'),
    tileSize = dna.technical.tileSize;
  if (
    !blueprint.rooms.every((room) => {
      const node = graph.nodes.find((n) => n.id === room.id),
        meta = node?.metadata;
      return (
        meta?.stormglassRoomTheme === room.theme &&
        Number(meta.targetTileWidth) * tileSize === room.width &&
        Number(meta.targetTileHeight) * tileSize === room.height
      );
    })
  )
    return false;
  // Geometry labels alone cannot admit a kit whose doors disagree with its blueprint.
  const authoredIds = new Set<string>(blueprint.rooms.map((room) => room.id));
  const opposite: Record<string, string> = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const sameRequirements = (a: readonly string[], b: readonly string[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const matches = (edge: WorldGraph['edges'][number], link: (typeof blueprint.links)[number]) =>
    edge.bidirectional === true &&
    sameRequirements(edge.requirements, link.requirements) &&
    ((edge.from === link.from && edge.to === link.to && edge.transition === link.direction) ||
      (edge.from === link.to &&
        edge.to === link.from &&
        edge.transition === opposite[link.direction]));
  if (
    !blueprint.links.every((link) => graph.edges.filter((edge) => matches(edge, link)).length === 1)
  )
    return false;
  if (
    graph.edges.some(
      (edge) =>
        (authoredIds.has(edge.from) || authoredIds.has(edge.to)) &&
        !blueprint.links.some((link) => matches(edge, link)),
    )
  )
    return false;
  const source = join(outputDir, 'data/visual/blueprints/stormglass-gallery-room-kits-v1.json');
  const target = join(outputDir, 'data/visual/stormglass-room-kits.json');
  if (!existsSync(source) || existsSync(target)) return false;
  try {
    const config = JSON.parse(readFileSync(source, 'utf8').replace(/^\uFEFF/, ''));
    if (config.version !== 1 || !config.rooms) return false;
    const campaignRooms = graph.nodes.filter((node) => node.type === 'room');
    if (expanded) {
      // Reuse verified local material modules, with explicit supported destinations.
      // The return well stays visually clear; no furniture occupies its opening.
      config.rooms.room_043 = structuredClone(config.rooms.room_002);
      config.rooms.room_044 = {
        ...structuredClone(config.rooms.room_041),
        // Original chamber assemblies occupy supported bays rather than repeating
        // a complete facade painting across this long, tested circulation route.
        props: [],
        archiveBays: [
          { id: 'ArchiveReadingRecess', kind: 'book-recess', x: 1152, width: 512, height: 288 },
          { id: 'ArchiveScribeDesk', kind: 'scribe-desk', x: 1792, width: 192, height: 40 },
          { id: 'ArchiveLedgerPedestal', kind: 'ledger-pedestal', x: 3328, width: 96, height: 72 },
          { id: 'ArchiveScrollCabinet', kind: 'scroll-cabinet', x: 4352, width: 256, height: 160 },
        ],
      };
      config.rooms.room_045 = {
        ...structuredClone(config.rooms.room_005),
        props: [
          { role: 'gear_housing', x: 224, height: 128, lift: 0 },
          { role: 'chapel_bell', x: 832, height: 144, lift: 1664 },
        ],
      };
    }
    const fullCampaign =
      campaignRooms.length === (expanded ? 46 : 43) &&
      campaignRooms.every(
        (node) => node.metadata.stormglassCampaignLayout === 'stormglass-gallery-campaign-v1',
      );
    if (fullCampaign) {
      if (
        Object.keys(config.rooms).length !== campaignRooms.length ||
        campaignRooms.some((node) => !config.rooms[node.id])
      )
        return false;
    } else {
      // Legacy opening adapters receive only their matching authored rooms.
      config.rooms = Object.fromEntries(
        Object.entries(config.rooms).filter(([id]) => authoredIds.has(id)),
      );
    }
    const manifests = new Set<string>(
      Object.values(config.rooms).flatMap((room: any) => room.manifests ?? []),
    );
    for (const path of manifests) {
      if (path.includes('..') || !path.startsWith('assets/architecture/stormglass/kits/'))
        return false;
      const full = join(outputDir, path);
      if (!existsSync(full)) return false;
      const manifest = JSON.parse(readFileSync(full, 'utf8'));
      if (
        typeof manifest.atlas !== 'string' ||
        manifest.atlas.includes('..') ||
        !manifest.atlas.startsWith('assets/architecture/stormglass/kits/')
      )
        return false;
      const atlas = join(outputDir, manifest.atlas);
      if (!existsSync(atlas)) return false;
      if (!validStormglassKitManifest(manifest, readFileSync(atlas))) return false;
    }
    for (const [roomId, room] of Object.entries(config.rooms) as Array<[string, any]>) {
      const roles = new Set<string>();
      if (!Array.isArray(room.manifests) || !Array.isArray(room.props)) return false;
      if (room.archiveBays !== undefined) {
        const node = graph.nodes.find((node) => node.id === roomId);
        if (!validStormglassArchiveBays(room.archiveBays, Number(node?.metadata.targetTileWidth) * tileSize)) return false;
      }
      for (const path of room.manifests) {
        const manifest = JSON.parse(readFileSync(join(outputDir, path), 'utf8'));
        for (const entry of manifest.entries ?? []) roles.add(entry.role);
      }
      if (
        [
          room.wallRole ?? 'marble_wall',
          'floor_course',
          'ribbed_column',
          'lantern',
          'door_open',
          'rune_gate_open',
          'rune_gate_sealed',
          'threshold_trim',
          ...(room.stainedWindows === false ? [] : ['stained_window']),
        ].some((role) => !roles.has(role))
      )
        return false;
      if (
        ['ambientColor', 'wallTint', 'columnTint'].some(
          (key) => room[key] !== undefined && !/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(room[key]),
        )
      )
        return false;
      if (
        room.props.some(
          (prop: any) =>
            !roles.has(prop.role) ||
            !Number.isFinite(prop.x) ||
            !Number.isFinite(prop.height) ||
            prop.height <= 0 ||
            !Number.isFinite(prop.lift ?? 0),
        )
      )
        return false;
    }
    writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}
