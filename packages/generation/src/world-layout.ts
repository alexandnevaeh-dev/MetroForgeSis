import { generateStormglassGalleryCampaign } from '@metroforge/godot';
import type { GameDNA } from '@metroforge/schemas';
export type WorldLayoutChoice = 'procedural' | 'stormglass-gallery' | 'stormglass-expanded-region' | 'stormglass-archive-wing';
export function selectAuthoredWorld(
  dna: GameDNA,
  request: {
    worldLayout?: WorldLayoutChoice;
    targetEngine?: string;
    seed: number;
    worldOverride?: { roomCount?: number; biomeCount?: number };
  },
) {
  if (!request.worldLayout || request.worldLayout === 'procedural') return null;
  if (!['stormglass-gallery', 'stormglass-expanded-region', 'stormglass-archive-wing'].includes(request.worldLayout))
    throw new Error('Unknown world layout');
  if (request.targetEngine && !['godot','unity','unreal'].includes(request.targetEngine))
    throw new Error('Unknown target engine for Stormglass Gallery');
  const campaign = generateStormglassGalleryCampaign(
    dna,
    request.seed,
    request.worldLayout === 'stormglass-archive-wing' ? 'archive-wing' : request.worldLayout === 'stormglass-expanded-region' ? 'expanded-region' : 'gallery',
  );
  if (!campaign)
    throw new Error(
      'Stormglass Gallery requires side-view Stormglass Reliquary, 32px tiles and its six movement abilities',
    );
  if (
    request.worldOverride?.roomCount !== undefined &&
    request.worldOverride.roomCount !== campaign.roomIds.length
  )
    throw new Error(`Selected Stormglass campaign has ${campaign.roomIds.length} authored rooms`);
  if (
    request.worldOverride?.biomeCount !== undefined &&
    request.worldOverride.biomeCount !== campaign.worldGraph.regions.length
  )
    throw new Error('Stormglass Gallery region count conflicts with requested topology');
  return campaign;
}
