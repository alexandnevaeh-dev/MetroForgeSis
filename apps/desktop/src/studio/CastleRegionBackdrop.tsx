import { useId } from 'react';
import { CastleRegionFurnishings } from './CastleRegionFurnishings.js';
import { validFurnishingAsset, type CastleFurnishing } from './castle-furnishing-layout.js';

export type CastleRegionPreview = {
  version: number;
  width: number;
  height: number;
  furnishings?: CastleFurnishing[];
  facadeModules?: Array<{id: string; x: number; y: number; width: number; height: number; collision: false}>;
  sections: Array<{
    id: string;
    name: string;
    x: number;
    width: number;
    floorY: number;
    ceilingY: number;
  }>;
};

/** Fixed 64 by 32 world-pixel courses match the native region material scale.
 * SVG is an authoring approximation of the shader, not a gameplay capture. */
export function CastleRegionBackdrop({ plan, projectPath }: { plan: CastleRegionPreview; projectPath?: string }) {
  const id = useId().replaceAll(':', '');
  return (
    <g aria-label="Castle region masonry preview" data-castle-profile="region" pointerEvents="none">
      <defs>
        <pattern id={`${id}-masonry`} width={512} height={64} patternUnits="userSpaceOnUse">
          <rect width={512} height={64} fill="#070a0d" />
          {Array.from({ length: 18 }, (_, i) => {
            const row = Math.floor(i / 9);
            const x = (i % 9) * 64 - row * 32;
            const shade = 22 + ((i * 13) % 11);
            return (
              <g key={i}>
                <rect
                  x={x + 2.24}
                  y={row * 32 + 2.24}
                  width={61.76}
                  height={29.76}
                  fill={`rgb(${shade}, ${shade + 8}, ${shade + 16})`}
                />
                <path d={`M ${x + 2.24} ${row * 32 + 3} h 61.76`} stroke="#283440" />
              </g>
            );
          })}
        </pattern>
      </defs>
      {plan.facadeModules ? plan.facadeModules.map(module => (
        <rect key={module.id} data-facade-module={module.id} x={module.x} y={module.y}
          width={module.width} height={module.height} fill={`url(#${id}-masonry)`} />
      )) : <rect width={plan.width} height={plan.height} fill={`url(#${id}-masonry)`} />}
      {plan.sections.map((section) => (
        <g key={section.id} data-chamber-id={section.id}>
          <title>{section.name}</title>
          <rect
            x={section.x}
            y={section.ceilingY + 32}
            width={section.width}
            height={Math.max(0, section.floorY - section.ceilingY - 32)}
            fill="#111b26"
            fillOpacity={0.35}
          />
        </g>
      ))}
      {projectPath && <CastleRegionFurnishings projectPath={projectPath} plan={plan} />}
    </g>
  );
}

export function validCastleRegionPreview(
  plan: CastleRegionPreview | undefined,
  width: number,
  height: number,
): plan is CastleRegionPreview {
  return (
    !!plan &&
    plan.version === 1 &&
    plan.width === width &&
    plan.height === height &&
    (plan.facadeModules === undefined || (Array.isArray(plan.facadeModules) && plan.facadeModules.length <= 1000 && plan.facadeModules.every(module =>
      !!module && typeof module.id === 'string' && module.collision === false &&
      [module.x, module.y, module.width, module.height].every(Number.isFinite) &&
      module.x >= 0 && module.y >= 0 && module.width > 0 && module.width <= 256 &&
      module.height > 0 && module.height <= 256 && module.x + module.width <= width && module.y + module.height <= height))) &&
    (plan.furnishings === undefined || (Array.isArray(plan.furnishings) && plan.furnishings.length <= 256 && plan.furnishings.every(validFurnishingAsset))) &&
    Array.isArray(plan.sections) &&
    plan.sections.length > 0 &&
    plan.sections.length <= 256 &&
    plan.sections.every(
      (s) =>
        !!s &&
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        [s.x, s.width, s.floorY, s.ceilingY].every(Number.isFinite) &&
        s.x >= 0 &&
        s.width > 0 &&
        s.x + s.width <= width &&
        s.ceilingY >= 0 &&
        s.floorY > s.ceilingY &&
        s.floorY <= height,
    )
  );
}
