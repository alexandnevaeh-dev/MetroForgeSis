import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameDNASchema, WorldGraphSchema, type GameDNA, type WorldGraph } from '@metroforge/schemas';
import type { GameContent } from '@metroforge/procedural';
import { deriveRoomIds } from '@metroforge/godot';
import type { PlaytestTelemetry } from '@metroforge/qa';

export interface PlaytestTelemetryRecord extends PlaytestTelemetry {
  balanceSummary?: string[];
}

export interface PlaytestRouteSummary {
  reachable: boolean;
  startRoomId: string;
  victoryRoomId: string;
  victoryBossId: string;
  transitionCount: number;
  personaId?: string;
  personaDisplayName?: string;
}

export interface ProjectMemorySummary {
  chunkCount: number;
  provider: string;
  model: string;
  createdAt: string;
}

export interface LoadedProject {
  projectPath: string;
  gameDna: GameDNA;
  worldGraph: WorldGraph;
  roomIds: string[];
  gameContent: GameContent;
  roomsData: Record<string, Record<string, unknown>>;
  manifest: { artifacts?: Array<Record<string, unknown>> };
  validationReport?: Record<string, unknown>;
  projectMeta?: Record<string, unknown>;
  playtestRoute?: PlaytestRouteSummary;
  playtestTelemetry?: PlaytestTelemetryRecord;
  projectMemory?: ProjectMemorySummary;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function loadGameContent(projectPath: string): GameContent {
  const readNamed = <T>(relativePath: string, key: string): T[] => {
    const data = readJson<Record<string, T[]>>(join(projectPath, relativePath));
    if (!data) return [];
    return data[key] ?? [];
  };

  return {
    enemies: readNamed('data/enemies/enemies.json', 'enemies'),
    bosses: readNamed('data/bosses/bosses.json', 'bosses'),
    quests: readNamed('data/quests/quests.json', 'quests'),
    items: readNamed('data/items/items.json', 'items'),
    npcs: readNamed('data/npcs/npcs.json', 'npcs'),
    dialogues: readNamed('data/dialogues/dialogues.json', 'dialogues'),
    shops: readNamed('data/shops/shops.json', 'shops'),
  };
}

function loadPlaytestRouteSummary(projectPath: string): PlaytestRouteSummary | undefined {
  const raw = readJson<Record<string, unknown>>(join(projectPath, 'playtest_route.json'));
  if (!raw) return undefined;

  const persona = raw.persona as { id?: string; displayName?: string } | undefined;
  return {
    reachable: Boolean(raw.reachable),
    startRoomId: String(raw.startRoomId ?? ''),
    victoryRoomId: String(raw.victoryRoomId ?? ''),
    victoryBossId: String(raw.victoryBossId ?? ''),
    transitionCount: Array.isArray(raw.transitions) ? raw.transitions.length : 0,
    personaId: persona?.id,
    personaDisplayName: persona?.displayName,
  };
}

function loadPlaytestTelemetryRecord(projectPath: string): PlaytestTelemetryRecord | undefined {
  return readJson<PlaytestTelemetryRecord>(join(projectPath, 'playtest_telemetry.json')) ?? undefined;
}

function loadProjectMemorySummary(projectPath: string): ProjectMemorySummary | undefined {
  const raw = readJson<{
    chunkCount?: number;
    provider?: string;
    model?: string;
    createdAt?: string;
  }>(join(projectPath, 'project_memory.json'));
  if (!raw?.chunkCount) return undefined;
  return {
    chunkCount: Number(raw.chunkCount),
    provider: String(raw.provider ?? ''),
    model: String(raw.model ?? ''),
    createdAt: String(raw.createdAt ?? ''),
  };
}

export function loadProjectContext(projectPath: string): LoadedProject {
  if (!existsSync(join(projectPath, 'project.godot'))) {
    throw new Error('Not a Godot project');
  }

  const gameDna = GameDNASchema.parse(readJson(join(projectPath, 'game_dna.json')));
  const worldGraph = WorldGraphSchema.parse(readJson(join(projectPath, 'world_graph.json')));
  const roomsJson = readJson<{ rooms?: Record<string, Record<string, unknown>> }>(
    join(projectPath, 'data', 'rooms', 'rooms.json'),
  );
  const roomsData = roomsJson?.rooms ?? {};
  const existingRoomIds = Object.keys(roomsData).sort(
    (a, b) => Number(roomsData[a]?.index ?? 0) - Number(roomsData[b]?.index ?? 0),
  );

  return {
    projectPath,
    gameDna,
    worldGraph,
    roomIds: deriveRoomIds(worldGraph, existingRoomIds.length ? existingRoomIds : undefined),
    gameContent: loadGameContent(projectPath),
    roomsData,
    manifest: readJson(join(projectPath, 'generation_manifest.json')) ?? { artifacts: [] },
    validationReport: readJson(join(projectPath, 'validation_report.json')) ?? undefined,
    projectMeta: readJson(join(projectPath, 'project.json')) ?? undefined,
    playtestRoute: loadPlaytestRouteSummary(projectPath),
    playtestTelemetry: loadPlaytestTelemetryRecord(projectPath),
    projectMemory: loadProjectMemorySummary(projectPath),
  };
}
