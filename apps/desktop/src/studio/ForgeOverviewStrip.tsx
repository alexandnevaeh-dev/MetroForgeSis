import { useEffect, useState } from 'react';
import { WorldMapPreview } from './WorldMapPreview.js';
import { useStudio } from './StudioContext.js';
import type { ProjectPreview } from './metroforge-api.js';
import { Button, Panel } from './ui/index.js';

export function ForgeOverviewStrip({
  questCount,
  roomCount,
  assetCount,
}: {
  questCount?: number;
  roomCount?: number;
  assetCount?: number;
}) {
  const { selectedPath, openRoom, openAsset, openStory, navigate } = useStudio();
  const [preview, setPreview] = useState<ProjectPreview | null>(null);

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.getProjectPreview) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void window.metroforge.getProjectPreview(selectedPath).then((data) => {
      if (!cancelled) setPreview(data?.error ? null : data);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  return (
    <div className="forge-overview-strip">
      <Panel level={1} className="forge-overview-map" title="World">
        <WorldMapPreview
          worldGraph={preview?.worldGraph}
          view="graph"
          fitView
          onActivate={openRoom}
          emptyTitle="No rooms yet"
          emptyDescription="Commission a template or generate a world to see chambers here."
        />
        <Button size="sm" onClick={() => navigate('World')}>
          Open World Map
        </Button>
      </Panel>
      <Panel level={1} title="Cast & assets">
        <div className="forge-overview-thumbs">
          {(preview?.assetPreviews ?? []).slice(0, 8).map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="forge-thumb"
              onClick={() => openAsset(asset.id)}
              title={asset.id}
            >
              <img src={asset.dataUrl} alt="" />
            </button>
          ))}
          {(preview?.assetPreviews?.length ?? 0) === 0 ? (
            <p className="hint">No texture previews in the manifest yet.</p>
          ) : null}
        </div>
        <div className="row">
          <Button size="sm" onClick={() => navigate('Assets')}>
            Foundry · {assetCount ?? preview?.assetPreviews?.length ?? 0}
          </Button>
          <Button size="sm" onClick={() => openStory()}>
            Chronicle · {questCount ?? 0}
          </Button>
          <Button size="sm" onClick={() => navigate('Preview')}>
            Playtest · {roomCount ?? preview?.worldGraph?.nodes?.length ?? 0} rooms
          </Button>
        </div>
      </Panel>
    </div>
  );
}
