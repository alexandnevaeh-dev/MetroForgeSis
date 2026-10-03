import { useEffect, useMemo, useState } from 'react';
import { CommandBar } from './CommandBar.js';
import { NoProjectHint } from './NoProjectHint.js';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import { Button, EditorViewport, EditorWorkbench, EmptyState, TextArea } from './ui/index.js';

type StoryContent = NonNullable<Awaited<ReturnType<NonNullable<Window['metroforge']>['getStoryContent']>>>;

type GraphNode = {
  id: string;
  kind: 'narrative' | 'quest' | 'dialogue' | 'npc';
  label: string;
  x: number;
  y: number;
};

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export function StoryWorkspace() {
  const { selectedPath, hasActiveProject, focusStoryId, creationMode } = useStudio();
  const [story, setStory] = useState<StoryContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<'narrative' | 'quest' | 'dialogue'>('narrative');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const [proposed, setProposed] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);

  const load = async (path: string) => {
    if (!window.metroforge?.getStoryContent) {
      setError('Story IPC is unavailable in this build');
      return;
    }
    const data = await window.metroforge.getStoryContent(path);
    setStory(data);
    if (focusStoryId && data.quests.some((q) => q.id === focusStoryId)) {
      setSelectedKind('quest');
      setSelectedId(focusStoryId);
    } else if (focusStoryId && data.dialogues.some((d) => d.id === focusStoryId)) {
      setSelectedKind('dialogue');
      setSelectedId(focusStoryId);
    }
  };

  useEffect(() => {
    if (selectedPath) void load(selectedPath);
  }, [selectedPath, focusStoryId]);

  const selectedQuest = story?.quests.find((q) => q.id === selectedId);
  const selectedDialogue = story?.dialogues.find((d) => d.id === selectedId);

  useEffect(() => {
    if (selectedKind === 'narrative' && story) {
      setDraft(story.narrative.premise);
    } else if (selectedKind === 'quest' && selectedQuest) {
      setDraft(selectedQuest.description);
    } else if (selectedKind === 'dialogue' && selectedDialogue) {
      setDraft(selectedDialogue.lines.map((line) => line.text).join('\n'));
    }
    setProposed(null);
  }, [selectedKind, selectedId, story, selectedQuest, selectedDialogue]);

  const { nodes, edges } = useMemo(() => {
    if (!story) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const nextNodes: GraphNode[] = [
      { id: 'narrative', kind: 'narrative', label: 'Premise', x: 40, y: 40 },
      ...story.quests.map((quest, i) => ({
        id: quest.id,
        kind: 'quest' as const,
        label: quest.name,
        x: 220 + (i % 3) * 160,
        y: 40 + Math.floor(i / 3) * 90,
      })),
      ...story.dialogues.map((dialogue, i) => ({
        id: dialogue.id,
        kind: 'dialogue' as const,
        label: dialogue.id,
        x: 220 + (i % 3) * 160,
        y: 220 + Math.floor(i / 3) * 80,
      })),
      ...story.npcs.map((npc, i) => ({
        id: npc.id,
        kind: 'npc' as const,
        label: npc.name ?? npc.id,
        x: 40,
        y: 140 + i * 70,
      })),
    ];
    const byId = new Map(nextNodes.map((n) => [n.id, n]));
    const nextEdges: GraphEdge[] = [];

    for (const quest of story.quests) {
      if (quest.dialogueStartId && byId.has(quest.dialogueStartId)) {
        nextEdges.push({
          id: `${quest.id}->${quest.dialogueStartId}`,
          from: quest.id,
          to: quest.dialogueStartId,
          label: 'starts',
        });
      }
      for (const pre of quest.prerequisites ?? []) {
        if (byId.has(pre)) {
          nextEdges.push({
            id: `${pre}->${quest.id}:prereq`,
            from: pre,
            to: quest.id,
            label: 'prereq',
          });
        }
      }
    }

    for (const npc of story.npcs) {
      if (npc.dialogueId && byId.has(npc.dialogueId)) {
        nextEdges.push({
          id: `${npc.id}->${npc.dialogueId}`,
          from: npc.id,
          to: npc.dialogueId,
          label: 'speaks',
        });
      }
    }

    for (const dialogue of story.dialogues) {
      for (const line of dialogue.lines) {
        for (const choice of line.choices ?? []) {
          if (choice.nextDialogueId && byId.has(choice.nextDialogueId)) {
            nextEdges.push({
              id: `${dialogue.id}->${choice.nextDialogueId}:${choice.text.slice(0, 12)}`,
              from: dialogue.id,
              to: choice.nextDialogueId,
              label: 'choice',
            });
          }
        }
      }
    }

    return { nodes: nextNodes, edges: nextEdges };
  }, [story]);

  const save = async () => {
    if (!selectedPath || !story) return;
    setError(null);
    setMessage(null);
    if (selectedKind === 'narrative') {
      const result = await window.metroforge?.updateNarrative?.(selectedPath, { premise: draft });
      if (!result?.success) setError(result?.errors.join('; ') ?? 'Save failed');
      else setMessage('Premise saved to game_dna.json');
    } else if (selectedKind === 'quest' && selectedQuest) {
      const result = await window.metroforge?.updateQuest?.(selectedPath, {
        ...selectedQuest,
        description: draft,
      });
      if (!result?.success) setError(result?.errors.join('; ') ?? 'Save failed');
      else setMessage(`Saved quest ${selectedQuest.id} only`);
    } else if (selectedKind === 'dialogue' && selectedDialogue) {
      const lines = draft
        .split('\n')
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text, index) => ({
          speaker: selectedDialogue.lines[index]?.speaker,
          text,
          choices: selectedDialogue.lines[index]?.choices,
        }));
      const result = await window.metroforge?.updateDialogue?.(selectedPath, {
        ...selectedDialogue,
        lines: lines.length ? lines : [{ text: draft || '…' }],
      });
      if (!result?.success) setError(result?.errors.join('; ') ?? 'Save failed');
      else setMessage(`Saved dialogue ${selectedDialogue.id} only`);
    }
    await load(selectedPath);
    setProposed(null);
  };

  const proposeAssist = async () => {
    if (creationMode === 'manual') {
      setError('Switch to Assisted to draft an AI rewrite. Nothing is written until you apply it.');
      return;
    }
    if (!selectedPath || !window.metroforge?.proposeStoryRewrite) {
      setError('Story rewrite IPC is unavailable');
      return;
    }
    setProposing(true);
    setError(null);
    try {
      const result = await window.metroforge.proposeStoryRewrite(selectedPath, {
        kind: selectedKind,
        id: selectedKind === 'narrative' ? undefined : selectedId,
        draft,
      });
      if (!result.success || !result.proposal) {
        setError(result.errors?.join('; ') ?? 'Proposal failed');
        return;
      }
      setProposed(result.proposal);
      setMessage(
        `Proposed ${selectedKind} rewrite via ${result.source ?? 'generationRouter'}. Apply writes only this element.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
    }
  };

  const nodeCenter = (node: GraphNode) => ({ x: node.x + 70, y: node.y + 28 });

  return (
    <section className="workspace-screen story-workspace">
      <ScreenHeader
        compact
        eyebrow="Chronicle"
        title="Story & gameplay"
        description="Quests, dialogues, and narrative from the project JSON — edges follow real relationships."
      />
      <NoProjectHint />
      {hasActiveProject && (
        <>
          {creationMode !== 'manual' && (
            <CommandBar compact projectPath={selectedPath} placeholder="World/room commands still apply here…" />
          )}
          <EditorWorkbench className="story-workbench">
            <aside className="panel editor-hierarchy">
              <h3 className="type-label">Structure</h3>
              <button
                type="button"
                className={selectedKind === 'narrative' ? 'nav-item active' : 'nav-item'}
                onClick={() => {
                  setSelectedKind('narrative');
                  setSelectedId('');
                }}
              >
                Narrative
              </button>
              <p className="type-label">Quests</p>
              {(story?.quests ?? []).map((quest) => (
                <button
                  key={quest.id}
                  type="button"
                  className={selectedKind === 'quest' && selectedId === quest.id ? 'nav-item active' : 'nav-item'}
                  onClick={() => {
                    setSelectedKind('quest');
                    setSelectedId(quest.id);
                  }}
                >
                  {quest.name}
                </button>
              ))}
              <p className="type-label">Dialogues</p>
              {(story?.dialogues ?? []).map((dialogue) => (
                <button
                  key={dialogue.id}
                  type="button"
                  className={
                    selectedKind === 'dialogue' && selectedId === dialogue.id ? 'nav-item active' : 'nav-item'
                  }
                  onClick={() => {
                    setSelectedKind('dialogue');
                    setSelectedId(dialogue.id);
                  }}
                >
                  {dialogue.id}
                </button>
              ))}
              {story && story.quests.length === 0 && story.dialogues.length === 0 ? (
                <p className="hint">No quests or dialogues in this project yet.</p>
              ) : null}
            </aside>
            <EditorViewport>
              {story ? (
                <svg className="story-canvas" viewBox="0 0 720 420" role="img" aria-label="Story graph">
                  {edges.map((edge) => {
                    const from = nodes.find((n) => n.id === edge.from);
                    const to = nodes.find((n) => n.id === edge.to);
                    if (!from || !to) return null;
                    const a = nodeCenter(from);
                    const b = nodeCenter(to);
                    return (
                      <g key={edge.id}>
                        <line className="story-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                        {edge.label ? (
                          <text
                            x={(a.x + b.x) / 2}
                            y={(a.y + b.y) / 2 - 4}
                            fontSize={9}
                            fill="currentColor"
                            opacity={0.7}
                          >
                            {edge.label}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                  {nodes.map((node) => (
                    <g
                      key={`${node.kind}-${node.id}`}
                      className={
                        (node.kind === 'narrative' && selectedKind === 'narrative') ||
                        (node.kind !== 'narrative' &&
                          node.kind !== 'npc' &&
                          selectedId === node.id)
                          ? 'story-node selected'
                          : 'story-node'
                      }
                      onClick={() => {
                        if (node.kind === 'npc') return;
                        setSelectedKind(node.kind === 'narrative' ? 'narrative' : node.kind);
                        setSelectedId(node.kind === 'narrative' ? '' : node.id);
                      }}
                    >
                      <rect x={node.x} y={node.y} width={140} height={56} rx={8} />
                      <text x={node.x + 12} y={node.y + 22}>
                        {node.kind}
                      </text>
                      <text x={node.x + 12} y={node.y + 40}>
                        {node.label.slice(0, 16)}
                      </text>
                    </g>
                  ))}
                </svg>
              ) : (
                <EmptyState title="Loading chronicle" description="Reading quests and dialogues from disk." />
              )}
            </EditorViewport>
            <aside className="panel editor-inspector">
              <h3 className="type-label">Inspector</h3>
              {selectedKind === 'narrative' && story && (
                <>
                  <label className="create-field">
                    Premise
                    <TextArea className="resize-none" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  </label>
                  <p className="hint">
                    Protagonist: {story.narrative.protagonist}
                    {story.narrative.antagonist ? ` · Antagonist: ${story.narrative.antagonist}` : ''}
                  </p>
                </>
              )}
              {selectedKind === 'quest' && selectedQuest && (
                <>
                  <p className="mono">{selectedQuest.id}</p>
                  <label className="create-field">
                    Description
                    <TextArea className="resize-none" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  </label>
                  <ul className="hint">
                    {selectedQuest.objectives.map((obj) => (
                      <li key={obj.id ?? obj.description}>
                        {obj.type} {obj.target}
                      </li>
                    ))}
                  </ul>
                  {selectedQuest.dialogueStartId ? (
                    <p className="hint">Starts dialogue {selectedQuest.dialogueStartId}</p>
                  ) : null}
                  {(selectedQuest.prerequisites?.length ?? 0) > 0 ? (
                    <p className="hint">Prerequisites: {selectedQuest.prerequisites!.join(', ')}</p>
                  ) : null}
                </>
              )}
              {selectedKind === 'dialogue' && selectedDialogue && (
                <label className="create-field">
                  Lines (one per row)
                  <TextArea className="resize-none" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
                </label>
              )}
              {proposed ? (
                <div className="result warn">
                  <p className="type-label">Proposed rewrite</p>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{proposed}</pre>
                  <div className="row">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setDraft(proposed);
                        setProposed(null);
                      }}
                    >
                      Use proposal
                    </Button>
                    <Button size="sm" onClick={() => setProposed(null)}>
                      Discard
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="row">
                <Button size="sm" variant="primary" onClick={() => void save()}>
                  Save this element
                </Button>
                <Button
                  size="sm"
                  onClick={() => void proposeAssist()}
                  disabled={creationMode === 'manual' || proposing}
                >
                  {proposing ? 'Proposing…' : 'Propose AI rewrite'}
                </Button>
              </div>
              {message ? <p className="hint">{message}</p> : null}
              {error ? <p className="result error">{error}</p> : null}
              <p className="hint">
                Saving writes only the selected quest, dialogue, or premise. Graph edges use
                dialogueStartId, prerequisites, NPC dialogueId, and dialogue choice jumps.
              </p>
              {story?.npcs.length ? (
                <p className="hint">NPCs: {story.npcs.map((n) => n.name ?? n.id).join(', ')}</p>
              ) : null}
            </aside>
          </EditorWorkbench>
        </>
      )}
    </section>
  );
}
