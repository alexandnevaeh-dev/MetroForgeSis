import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ALL_NAV_ITEMS, type NavId } from './nav.js';
import { useStudio } from './StudioContext.js';
import { Button, Modal, SearchField } from './ui/index.js';

type Kind = 'screen' | 'project' | 'room' | 'asset';
type PaletteRow = { kind: Kind; id: string; label: string; detail: string; path?: string };
type Room = { id: string };
type Asset = { id: string; path: string; category: string };
type Index<T> = { path: string; items: T[]; loading: boolean; error: string | null };
const initial = <T,>(): Index<T> => ({ path: '', items: [], loading: false, error: null });
const scopes = [
  { id: 'all', label: 'All' },
  { id: 'screen', label: 'Screens' },
  { id: 'project', label: 'Projects' },
  { id: 'room', label: 'Rooms' },
  { id: 'asset', label: 'Assets' },
] as const;
function matches(query: string, ...parts: Array<string | undefined>) {
  const text = parts.join(' ').toLowerCase();
  return query.split(/\s+/).every((word) => text.includes(word));
}

export function GoToPalette({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: NavId) => void;
}) {
  const {
    projects,
    selectedPath,
    selectedProject,
    setSelectedPath,
    navigate,
    openRoom,
    openAsset,
    projectsLoading,
    projectsError,
    refreshProjects,
  } = useStudio();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<(typeof scopes)[number]['id']>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [roomIndex, setRoomIndex] = useState<Index<Room>>(initial);
  const [assetIndex, setAssetIndex] = useState<Index<Asset>>(initial);
  const [reload, setReload] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const retryLock = useRef(false);
  const prefix = useId();

  useEffect(() => {
    if (!open || !selectedPath) {
      retryLock.current = false;
      return;
    }
    let cancelled = false;
    retryLock.current = true;
    const reset = <T,>(old: Index<T>): Index<T> => ({
      path: selectedPath,
      items: old.path === selectedPath ? old.items : [],
      loading: true,
      error: null,
    });
    setRoomIndex(reset);
    setAssetIndex(reset);
    const readRooms = Promise.resolve()
      .then(async () => {
        if (!window.metroforge?.listRooms) throw new Error('Room search unavailable');
        return window.metroforge.listRooms(selectedPath);
      })
      .then((items) => {
        if (!cancelled) setRoomIndex({ path: selectedPath, items, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setRoomIndex((old) => ({ ...old, loading: false, error: 'Rooms could not be loaded.' }));
      });
    const readAssets = Promise.resolve()
      .then(async () => {
        if (!window.metroforge?.listAssets) throw new Error('Asset search unavailable');
        return window.metroforge.listAssets(selectedPath);
      })
      .then((items) => {
        if (!cancelled) setAssetIndex({ path: selectedPath, items, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setAssetIndex((old) => ({
            ...old,
            loading: false,
            error: 'Assets could not be loaded.',
          }));
      });
    void Promise.all([readRooms, readAssets]).then(() => {
      if (!cancelled) retryLock.current = false;
    });
    return () => {
      cancelled = true;
    };
  }, [open, selectedPath, reload]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setScope('all');
      setActiveIndex(0);
    }
  }, [open]);
  useEffect(() => {
    setActiveIndex(0);
  }, [query, scope, selectedPath]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rooms = roomIndex.path === selectedPath ? roomIndex.items : [];
    const assets = assetIndex.path === selectedPath ? assetIndex.items : [];
    const categories: Array<{ id: Kind; label: string; rows: PaletteRow[] }> = [
      {
        id: 'screen',
        label: 'Screens',
        rows: ALL_NAV_ITEMS.filter((item) => matches(q, item.label, item.id)).map((item) => ({
          kind: 'screen',
          id: item.id,
          label: item.functionLabel,
          detail: item.forge,
        })),
      },
      {
        id: 'project',
        label: 'Projects',
        rows: projects
          .filter((project) => matches(q, project.title, project.slug, project.path))
          .map((project) => ({
            kind: 'project',
            id: project.path,
            path: project.path,
            label: project.title ?? project.slug,
            detail: project.path,
          })),
      },
      {
        id: 'room',
        label: 'Rooms',
        rows: rooms
          .filter((room) => matches(q, room.id))
          .map((room) => ({
            kind: 'room',
            id: room.id,
            label: room.id,
            detail: selectedProject?.title ?? 'Current project',
          })),
      },
      {
        id: 'asset',
        label: 'Assets',
        rows: assets
          .filter((asset) => matches(q, asset.id, asset.path, asset.category))
          .map((asset) => ({ kind: 'asset', id: asset.id, label: asset.id, detail: asset.path })),
      },
    ];
    return categories
      .filter((group) => scope === 'all' || group.id === scope)
      .map((group) => ({ ...group, total: group.rows.length, rows: group.rows.slice(0, 12) }));
  }, [query, scope, projects, selectedPath, selectedProject, roomIndex, assetIndex]);
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const selectedIndex = Math.max(0, Math.min(activeIndex, rows.length - 1));
  const activeId = rows.length ? `${prefix}-option-${selectedIndex}` : undefined;
  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeId, query, scope, rows]);
  const roomLoading = !!selectedPath && (roomIndex.path !== selectedPath || roomIndex.loading);
  const assetLoading = !!selectedPath && (assetIndex.path !== selectedPath || assetIndex.loading);
  const loading = projectsLoading || roomLoading || assetLoading;
  const errors = [
    projectsError ? 'Projects could not be loaded.' : null,
    roomIndex.path === selectedPath ? roomIndex.error : null,
    assetIndex.path === selectedPath ? assetIndex.error : null,
  ].filter(Boolean);

  const activate = (row: PaletteRow) => {
    if (row.kind === 'screen') onSelect(row.id as NavId);
    else if (row.kind === 'project') {
      setSelectedPath(row.path!);
      navigate('Dashboard');
    } else if (row.kind === 'room') openRoom(row.id);
    else openAsset(row.id);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="goto-palette"
      labelledBy={`${prefix}-title`}
      describedBy={`${prefix}-help`}
      initialFocus={inputRef}
    >
      <div className="goto-heading">
        <div>
          <h2 id={`${prefix}-title`}>Jump to your work</h2>
          <p>{selectedProject?.title ?? 'MetroForge workspace'}</p>
        </div>
        <Button variant="ghost" size="compact" onClick={onClose} aria-label="Close Jump">
          Esc <span aria-hidden="true">×</span>
        </Button>
      </div>
      <SearchField
        inputRef={inputRef}
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery('')}
        placeholder="Search screens, projects, rooms or assets"
        aria-label="Filter screens, projects, rooms, and assets"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${prefix}-results`}
        aria-activedescendant={activeId}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(
              Math.max(
                0,
                Math.min(rows.length - 1, selectedIndex + (event.key === 'ArrowDown' ? 1 : -1)),
              ),
            );
          } else if (event.key === 'Enter' && rows[selectedIndex]) {
            event.preventDefault();
            activate(rows[selectedIndex]!);
          }
        }}
      />
      <div className="goto-scopes" role="group" aria-label="Search category">
        {scopes.map((item) => (
          <Button
            key={item.id}
            size="compact"
            variant="ghost"
            aria-pressed={scope === item.id}
            onClick={() => {
              setScope(item.id);
              inputRef.current?.focus();
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="goto-recovery" role="alert">
          <span>{errors.join(' ')} Available results are shown.</span>
          <Button
            size="compact"
            disabled={loading}
            aria-busy={loading}
            onClick={() => {
              if (retryLock.current) return;
              retryLock.current = true;
              if (projectsError)
                void refreshProjects()
                  .catch(() => {})
                  .finally(() => {
                    if (!selectedPath) retryLock.current = false;
                  });
              setReload((value) => value + 1);
            }}
          >
            Retry search
          </Button>
        </div>
      )}
      <div
        id={`${prefix}-results`}
        className="goto-results"
        role="listbox"
        aria-label="Jump results"
      >
        {groups
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <div key={group.id} role="group" aria-label={group.label}>
              <p className="goto-group-label type-label">
                {group.label}{' '}
                <span>
                  {group.total > 12 ? `12 of ${group.total} · Refine search for more` : group.total}
                </span>
              </p>
              {group.rows.map((row) => {
                const index = rows.indexOf(row);
                return (
                  <Button
                    key={`${row.kind}-${row.id}`}
                    id={`${prefix}-option-${index}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === selectedIndex}
                    className="goto-option"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => activate(row)}
                  >
                    <span className="goto-row-copy">
                      <strong>{row.label}</strong>
                      <span>{row.detail}</span>
                    </span>
                    <span className="goto-row-kind">
                      {group.label === 'Screens'
                        ? 'Open'
                        : group.label === 'Projects'
                          ? 'Switch'
                          : group.label === 'Rooms'
                            ? 'Edit room'
                            : 'Inspect'}
                    </span>
                  </Button>
                );
              })}
            </div>
          ))}
        {rows.length === 0 && (
          <p className="goto-empty">
            {loading
              ? 'Loading search results…'
              : 'No matching results. Try a different search or category.'}
          </p>
        )}
        {!selectedPath && (scope === 'room' || scope === 'asset') && (
          <p className="goto-empty">
            Select a project to search its {scope === 'room' ? 'rooms' : 'assets'}.
          </p>
        )}
      </div>
      <footer className="goto-footer">
        <span role="status">
          {loading ? 'Loading project content…' : `${rows.length} results shown`}
        </span>
        <span id={`${prefix}-help`}>
          <kbd>↑ ↓</kbd> Select <kbd>Enter</kbd> Open
        </span>
      </footer>
    </Modal>
  );
}
