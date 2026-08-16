import { GENERATION_PROFILES } from '@metroforge/shared/constants';

export { GENERATION_PROFILES };
export const GENERATION_MODES = [
  'FREE_ONLY',
  'LOCAL_ONLY',
  'HYBRID_FREE',
  'CUSTOM',
  'NVIDIA_ONLY',
  'OFFLINE',
  'FASTEST',
  'HIGHEST_QUALITY',
  'LOWEST_COST',
  'BALANCED',
  'COMMERCIAL_SAFE',
] as const;
