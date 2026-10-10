/** Engine-neutral playable IR. Coordinates are Godot 2D pixels (origin top-left, +Y down). */
import type { Dialogue } from '@metroforge/schemas';

export interface GameplayNpc {
  id: string;
  definitionId: string;
  spriteId: string;
  name: string;
  role: string;
  x: number;
  y: number;
  dialogueIds: string[];
  questIds: string[];
  shopId?: string;
}

export interface GameplayRect {
  /** Jump-through ledge; omitted retains legacy solid collision. */
  oneWay?: boolean;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameplaySpriteClip {
  ownerId: string;
  clip: string;
  relativePath: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  /** Unity sprite pixels per world unit; omitted or invalid values use 1. */
  pixelsPerUnit?: number;
  /** Unity bilinear filtering for painted sprites; defaults to point filtering. */
  smoothFiltering?: boolean;
  fps: number;
  loop: boolean;
  /** Zero-based strike/release pose; defaults to the middle frame when absent. */
  impactFrame?: number;
  hasImpactFrame?: boolean;
  /** Normalized pivot. Characters use bottom-center (0.5, 0). */
  pivotX: number;
  pivotY: number;
}

export interface GameplayDoor {
  direction: 'left' | 'right' | 'up' | 'down';
  targetRoomId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spawnSide: string;
  spatial?: { authored: boolean; floorY: number; arrivalX?: number; hasArrivalX?: boolean };
  requirements: string[];
  optional: boolean;
}

export interface GameplayGate {
  requiredAbility: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetRoomId: string;
}

export interface GameplayActor {
  id: string;
  x: number;
  y: number;
  health?: number;
  damage?: number;
  movement?: string;
  combat?: string;
  /** Unity melee timings in seconds. Other engines may not consume these yet. */
  attackWindupSeconds?: number;
  attackRecoverySeconds?: number;
  attackCooldownSeconds?: number;
  isBoss?: boolean;
  name?: string;
  bossPhases?: Array<{ phase: number; healthThreshold: number; attacks: string[]; telegraphDuration: number; recoveryWindow: number }>;
}

export interface GameplayBackgrounds {
  /** Full-room interior plate, replacing generic outdoor parallax layers. */
  interior?: string;
  interiorTint?: number[];
  farCameraRelative?: boolean;
  farParallax?: number;
  far?: string;
  mid?: string;
  near?: string;
  foreground?: string;
}

export interface GameplayRoom {
  id: string;
  index: number;
  width: number;
  height: number;
  biomeId: string;
  archetype: string;
  tileSize: number;
  floorTop: number;
  spawnX: number;
  spawnY: number;
  solids: GameplayRect[];
  stairFlights?: { from: {x:number;y:number}; to: {x:number;y:number}; thickness: number; oneWay: boolean }[];
  doors: GameplayDoor[];
  gates: GameplayGate[];
  enemy?: GameplayActor;
  npcs?: GameplayNpc[];
  abilityPickup?: GameplayActor;
  abilityPickups?: GameplayActor[];
  /** Authored grapple anchor positions in room coordinates. */
  grappleAnchors?: Array<{ x: number; y: number }>;
  checkpoint?: { x: number; y: number };
  victory: boolean;
  backgrounds: GameplayBackgrounds;
}

export interface GameplayCombat {
  attackDamage: number;
  invulnerableSeconds: number;
  hitboxSeconds: number;
  comboWindowMul: number;
  cooldownMul: number;
  maxHealth?: number;
}

export interface GameplayPack {
  version: '1';
  title: string;
  seed: number;
  tileSize: number;
  resolution: { width: number; height: number };
  startRoomId: string;
  victoryRoomId: string;
  movement: {
    walkSpeed: number;
    runSpeed: number;
    jumpHeight: number;
    gravity: number;
    coyoteTime: number;
    jumpBufferTime: number;
    acceleration: number;
    deceleration: number;
    airAcceleration: number;
    maxFallSpeed: number;
    dashSpeed: number;
    dashDuration: number;
    dashCooldown: number;
  };
  combat: GameplayCombat;
  abilities: Array<{ id: string; name: string }>;
  rooms: GameplayRoom[];
  sprites: GameplaySpriteClip[];
  dialogues?: Dialogue[];
}

export interface EngineManifest {
  engine: 'godot' | 'unity' | 'unreal';
  engineVersion: string;
  generated: true;
  compiled: boolean;
  opened: boolean;
  playtested: boolean;
  visualCapture: boolean;
  standaloneBuild: boolean;
  acceptance: 'open' | 'closed';
  blocked: string[];
  gameplayPack: string;
  notes: string[];
}

export interface EngineAssemblyResult {
  success: boolean;
  projectPath: string;
  engine: 'godot' | 'unity' | 'unreal';
  errors: string[];
  warnings: string[];
}
