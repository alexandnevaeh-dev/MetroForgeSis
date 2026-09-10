import type { AssetFamily, AssetFamilyMember, AssetFamilyStatus, AssetFamilyType, VisualConstitution } from '@metroforge/schemas';
import { PRODUCTION_FAMILY_REQUIREMENTS } from '@metroforge/schemas';

export interface FamilyAssetInput {
  id: string;
  path: string;
  fallbackGenerated?: boolean;
  maturity?: string;
  productionReady?: boolean;
  critiquePassed?: boolean;
  provider?: string;
  modelId?: string;
  technicalValid?: boolean;
  defects?: string[];
}

const PATHS: Record<string, string> = {
  player: 'assets/characters/player.png',
  player_walk: 'assets/characters/player_walk.png',
  player_attack: 'assets/characters/player_attack.png',
  player_hurt: 'assets/characters/player_hurt.png',
  player_death: 'assets/characters/player_death.png',
  enemy_000: 'assets/enemies/enemy_000.png',
  enemy_000_attack: 'assets/enemies/enemy_000_attack.png',
  enemy_000_hurt: 'assets/enemies/enemy_000_hurt.png',
  enemy_000_death: 'assets/enemies/enemy_000_death.png',
  boss_final: 'assets/bosses/boss_final.png',
  boss_final_attack: 'assets/bosses/boss_final_attack.png',
  boss_final_hurt: 'assets/bosses/boss_final_hurt.png',
  boss_final_death: 'assets/bosses/boss_final_death.png',
  biome_0_source: 'assets/tilesets/biome_0/source.png',
  biome_0_prop: 'assets/props/biome_0_prop.png',
  biome_0_tileset: 'assets/tilesets/biome_0/source.png',
  biome_0_far: 'assets/backgrounds/biome_0/far.png',
  biome_0_mid: 'assets/backgrounds/biome_0/mid.png',
  biome_0_near: 'assets/backgrounds/biome_0/near.png',
};

function statusFor(members: AssetFamilyMember[], defects: string[]): AssetFamilyStatus {
  if (defects.length > 0 || members.some((member) => member.placeholder || !member.present)) return 'FAMILY_REVIEW_REQUIRED';
  if (members.every((member) => member.productionReady && member.visuallyValid)) return 'FAMILY_PRODUCTION_READY';
  if (members.every((member) => member.visuallyValid)) return 'FAMILY_CONSISTENT';
  if (members.every((member) => member.technicalValid)) return 'FAMILY_NORMALIZED';
  return 'FAMILY_DRAFT';
}

export function buildProductionAssetFamilies(
  constitution: VisualConstitution,
  assets: FamilyAssetInput[],
  seed: number,
): AssetFamily[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const definitions: Array<{ type: AssetFamilyType; id: string; rules: string[]; strategy: string }> = [
    { type: 'player', id: 'player-family', rules: ['stable feet baseline', 'preserve canonical silhouette', 'same palette and viewpoint'], strategy: 'canonical reference -> identity-preserving provider -> normalized animation sheets' },
    { type: 'enemy', id: 'enemy-family-000', rules: ['biome palette inheritance', 'distinct hostile silhouette', 'attack readability'], strategy: 'biome reference -> provider generation -> animation family' },
    { type: 'boss', id: 'boss-family-final', rules: ['boss-scale hierarchy', 'telegraph-readable silhouette', 'unique accent palette'], strategy: 'biome reference -> boss provider generation -> attack/phase family' },
    { type: 'biome', id: 'biome-family-0', rules: ['shared materials', 'foreground/background separation', 'consistent lighting'], strategy: 'biome identity -> environment kit -> props and terrain' },
    { type: 'tileset', id: 'tileset-family-0', rules: ['tile-grid alignment', 'role coverage', 'seam-free repetition'], strategy: 'terrain request -> tile compiler -> repeated preview QA' },
    { type: 'background', id: 'background-family-0', rules: ['far/mid/near depth separation', 'shared palette', 'gameplay silhouette contrast'], strategy: 'biome reference -> parallax layer generation -> composition QA' },
  ];
  return definitions.map((definition) => {
    const required = PRODUCTION_FAMILY_REQUIREMENTS[definition.type];
    const members = required.map((id) => {
      const asset = byId.get(id);
      const present = Boolean(asset);
      const placeholder = asset?.maturity
        ? asset.maturity === 'PLACEHOLDER' || asset.maturity === 'BLOCKOUT' || asset.maturity === 'REJECTED'
        : asset?.fallbackGenerated === true;
      const technicalValid = asset?.technicalValid ?? present;
      const visuallyValid = asset?.critiquePassed === true;
      return {
        id,
        path: asset?.path ?? PATHS[id] ?? id,
        required: true,
        present,
        placeholder,
        technicalValid,
        visuallyValid,
        productionReady: asset?.productionReady === true && !placeholder,
        provider: asset?.provider,
        model: asset?.modelId,
        defects: [
          ...(!present ? ['missing required member'] : []),
          ...(placeholder ? ['procedural placeholder'] : []),
          ...(asset?.critiquePassed === false ? ['visual QA failed'] : []),
          ...(asset?.defects ?? []),
        ],
      };
    });
    const defects = [...new Set(members.flatMap((member) => member.defects))];
    const technical = members.length ? Math.round((members.filter((member) => member.technicalValid).length / members.length) * 100) : 0;
    const visual = members.length ? Math.round((members.filter((member) => member.visuallyValid).length / members.length) * 100) : 0;
    const consistency = members.length ? Math.round((members.filter((member) => !member.placeholder && member.visuallyValid).length / members.length) * 100) : 0;
    return {
      familyId: definition.id,
      familyType: definition.type,
      constitutionId: constitution.id,
      constitutionVersion: constitution.version,
      canonicalReferenceIds: [definition.type === 'player' ? 'player' : 'biome_0'],
      members,
      identityRules: definition.rules,
      providerStrategy: definition.strategy,
      status: statusFor(members, defects),
      qualityScores: { technical, visual, consistency },
      defects,
      provenance: { generatedAt: new Date().toISOString(), seed },
    } satisfies AssetFamily;
  });
}

export function productionSliceReady(families: AssetFamily[]): boolean {
  return families.every((family) => family.status === 'FAMILY_PRODUCTION_READY');
}
