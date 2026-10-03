import { z } from 'zod';

/** Portable runtime configuration, deliberately independent of room-template fields. */
export const QuantumProjectSpecSchema = z.object({
  version: z.literal(1),
  archetype: z.literal('QUANTUM_SIMULATION_ROGUELITE'),
  title: z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/),
  prompt: z.string().max(4000),
  seed: z.number().int().min(0).max(2147483647),
  biome: z.literal('probability-mines'),
  candidateOnly: z.literal(true),
  productionApproved: z.literal(false),
}).strict();
export type QuantumProjectSpec = z.infer<typeof QuantumProjectSpecSchema>;

export const QuantumTemplateManifestSchema = z.object({
  version: z.literal(1),
  archetype: z.literal('QUANTUM_SIMULATION_ROGUELITE'),
  entryScene: z.literal('scenes/GeneratedMines.tscn'),
  candidateOnly: z.literal(true),
  productionApproved: z.literal(false),
  hashes: z.record(z.string().regex(/^[a-zA-Z0-9_./-]+$/),z.string().regex(/^[a-f0-9]{64}$/)),
}).strict();
