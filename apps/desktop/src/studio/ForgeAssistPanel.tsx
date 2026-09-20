import { CommandBar } from './CommandBar.js';
import { useStudio } from './StudioContext.js';
import { Button, InspectorPanel } from './ui/index.js';

export function ForgeAssistPanel({ activeNav }: { activeNav: string }) {
  const { selectedPath, hasActiveProject, creationMode, focusRoomId, navigate, openGenerator } = useStudio();

  if (creationMode === 'manual') {
    return (
      <InspectorPanel title="Assist · Manual" className="forge-assist">
        <p className="hint">
          Manual mode keeps AI off this panel. Switch to Assisted to command a selected room, asset,
          or story beat — or Full AI to commission a complete game. The same project stays loaded.
        </p>
        <Button size="sm" onClick={() => navigate('Create')}>
          Commission a template
        </Button>
      </InspectorPanel>
    );
  }

  return (
    <InspectorPanel
      title={creationMode === 'full-ai' ? 'Assist · Full AI' : 'Assist · Scoped'}
      className="forge-assist"
    >
      {!hasActiveProject ? (
        <p className="hint">Select a project to run scoped commands against it.</p>
      ) : (
        <>
          <p className="hint">
            {creationMode === 'full-ai'
              ? 'Full AI still writes into this project. Describe a whole game from Commission, then edit any result by hand.'
              : 'Commands apply to the current project and selected room when one is focused. Unrelated files stay untouched.'}
          </p>
          <CommandBar
            compact
            projectPath={selectedPath}
            selectedRoomId={focusRoomId || undefined}
            placeholder={
              activeNav === 'Assets'
                ? 'Try: generate a rusted enemy icon…'
                : 'Try: add treasure room, connect room_000 to room_001…'
            }
          />
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <Button size="sm" onClick={() => openGenerator()}>
              Generate selected asset
            </Button>
            <Button size="sm" onClick={() => navigate('Studio')}>
              Watch generation
            </Button>
          </div>
        </>
      )}
    </InspectorPanel>
  );
}
