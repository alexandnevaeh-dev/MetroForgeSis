import { useId } from 'react';
import {RoomMasonryPreview,RoomStairPreview,validRoomMasonry,validStairFlights,type RoomMasonryRect,type RoomStairFlight} from './RoomMasonryPreview.js';
import {
  CastleRegionBackdrop,
  validCastleRegionPreview,
  type CastleRegionPreview,
} from './CastleRegionBackdrop.js';
import type { CastleBackgroundPreview } from './BiomeBackgroundEditor.js';

/** Shared SVG counterpart of the native castle panorama; no room or asset mutations. */
export function CastleBackdrop(props:Parameters<typeof CastleBackdropArtwork>[0]&{masonryRects?:RoomMasonryRect[];stairFlights?:RoomStairFlight[]}){
 return <svg x={0} y={0} width={props.width} height={props.height} viewBox={`0 0 ${props.width} ${props.height}`} overflow="hidden" pointerEvents="none">
  <CastleBackdropArtwork {...props}/>
  {validRoomMasonry(props.masonryRects,props.width,props.height)&&<RoomMasonryPreview rects={props.masonryRects}/>}
  {validStairFlights(props.stairFlights,props.width,props.height)&&props.stairFlights.map((flight,index)=><RoomStairPreview key={index} flight={flight} index={index}/>)}
 </svg>;
}
function CastleBackdropArtwork({
  background,
  roomId,
  width,
  height,
  tileSize,
  regionPlan,
  projectPath,
}: {
  background: CastleBackgroundPreview | null | undefined;
  roomId: string;
  width: number;
  height: number;
  tileSize: number;
  regionPlan?: CastleRegionPreview;
  projectPath?: string;
}) {
  const id = useId().replaceAll(':', '');
  if (validCastleRegionPreview(regionPlan, width, height))
    return <CastleRegionBackdrop plan={regionPlan} projectPath={projectPath} />;
  if (!background) return null;
  const profile = background.spatialProfile;
  if (!profile?.rooms.includes(roomId)) {
    const cover = Math.max(width / background.width, height / background.height);
    return (
      <image
        className="room-scene-background"
        aria-label="Saved castle background"
        href={background.dataUrl}
        x={(width - background.width * cover) * 0.5}
        y={(height - tileSize * 2 - background.height * cover) * background.anchorY}
        width={background.width * cover}
        height={background.height * cover}
        opacity={background.opacity}
      />
    );
  }
  const grade = profile.stoneGrade ?? [0.86, 0.9, 0.96];
  if (profile.panoramaMode === 'continuous') {
    const sourceHeight = background.height * (profile.sourceHeightFraction ?? 1);
    const cover = Math.max(width / background.width, height / sourceHeight);
    return (
      <g
        className="room-scene-background"
        aria-label="Saved castle background"
        data-castle-profile="continuous"
        data-stone-grade={JSON.stringify(grade)}
      >
        <defs>
          <filter id={`${id}-continuous-grade`} colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values={`${grade[0]} 0 0 0 0  0 ${grade[1]} 0 0 0  0 0 ${grade[2]} 0 0  0 0 0 1 0`}
            />
          </filter>
        </defs>
        <svg
          data-continuous-panorama="true"
          data-source-height={sourceHeight}
          x={(width - background.width * cover) * 0.5}
          y={(height - tileSize * 2 - sourceHeight * cover) * background.anchorY}
          width={background.width * cover}
          height={sourceHeight * cover}
          viewBox={`0 0 ${background.width} ${sourceHeight}`}
          overflow="hidden"
          filter={`url(#${id}-continuous-grade)`}
          opacity={background.opacity}
        >
          <image href={background.dataUrl} width={background.width} height={background.height} />
        </svg>
      </g>
    );
  }
  const bandHeight = profile.panoramaHeight;
  const tileWidth = (background.width * bandHeight) / background.height;
  const floor = height - tileSize * 2;
  const bands = Math.ceil(floor / bandHeight);
  return (
    <g
      className="room-scene-background"
      aria-label="Saved castle background"
      data-castle-profile="modular"
      data-stone-grade={JSON.stringify(grade)}
      data-band-height={bandHeight}
      data-tile-width={tileWidth}
    >
      <defs>
        <filter id={`${id}-stone-grade`} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={`${grade[0]} 0 0 0 0  0 ${grade[1]} 0 0 0  0 0 ${grade[2]} 0 0  0 0 0 1 0`}
          />
        </filter>
        {Array.from({ length: bands }, (_, index) => {
          const y = floor - (index + 1) * bandHeight;
          return (
            <pattern
              key={index}
              id={`${id}-band-${index}`}
              patternUnits="userSpaceOnUse"
              x={0}
              y={y}
              width={tileWidth * 2}
              height={bandHeight}
            >
              <image href={background.dataUrl} width={tileWidth} height={bandHeight} />
              <image
                href={background.dataUrl}
                width={tileWidth}
                height={bandHeight}
                transform={`translate(${tileWidth * 2},0) scale(-1,1)`}
              />
            </pattern>
          );
        })}
      </defs>
      {Array.from({ length: bands }, (_, index) => (
        <rect
          key={index}
          data-castle-band={index}
          x={0}
          y={floor - (index + 1) * bandHeight}
          width={width}
          height={bandHeight}
          fill={`url(#${id}-band-${index})`}
          filter={`url(#${id}-stone-grade)`}
          opacity={background.opacity * (index === 0 ? 1 : 0.68)}
        />
      ))}
    </g>
  );
}
