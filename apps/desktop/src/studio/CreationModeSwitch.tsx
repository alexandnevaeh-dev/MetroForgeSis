import { useStudio, type CreationMode } from './StudioContext.js';
import { SegmentedTabs } from './ui/index.js';

const MODES: Array<{ id: CreationMode; label: string }> = [
  { id: 'manual', label: 'Manual' },
  { id: 'assisted', label: 'Assisted' },
  { id: 'full-ai', label: 'Full AI' },
];

export function CreationModeSwitch() {
  const { creationMode, setCreationMode } = useStudio();
  return (
    <div className="creation-mode-switch" title="Same project. Switch how you build.">
      <SegmentedTabs
        label="Creation mode"
        items={MODES}
        value={creationMode}
        onChange={(id) => setCreationMode(id as CreationMode)}
      />
    </div>
  );
}
