import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_NAV_ITEMS, type NavId } from './nav.js';
import { useStudio } from './StudioContext.js';

type PaletteRow =
  | { kind: 'screen'; id: NavId; label: string; hint: string }
  | { kind: 'project'; id: string; path: string; label: string; hint: string }
  | { kind: 'room'; id: string; label: string; hint: string }
  | { kind: 'asset'; id: string; label: string; hint: string };

function matches(query: string, ...parts: Array<string | undefined>) {
  if (!query) return true;
  return parts.some((part) => (part ?? '').toLowerCase().includes(query));
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
  const { projects, selectedPath, setSelectedPath, navigate, openRoom, openAsset } = useStudio();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [rooms, setRooms] = useState<Array<{ id: string }>>([]);
  const [assets, setAssets] = useState<Array<{ id: string; path: string; category: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !selectedPath) {
      setRooms([]);
      setAssets([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      window.metroforge?.listRooms?.(selectedPath),
      window.metroforge?.listAssets?.(selectedPath),
    ]).then(([roomList, assetList]) => {
      if (cancelled) return;
      setRooms((roomList ?? []).map((room) => ({ id: room.id })));
      setAssets(
        (assetList ?? []).map((asset) => ({
          id: asset.id,
          path: asset.path,
          category: asset.category,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, selectedPath]);

  const rows = useMemo<PaletteRow[]>(() => {
    const q = query.trim().toLowerCase();
    const cap = q ? 12 : 8;
    const screens: PaletteRow[] = ALL_NAV_ITEMS.filter(
      (item) => matches(q, item.label, item.id),
    ).map((item) => ({ kind: 'screen', id: item.id, label: item.label, hint: 'Screen' }));
    const projectRows: PaletteRow[] = projects
      .filter((project) => matches(q, project.title, project.slug, project.path))
      .map((project) => ({
        kind: 'project',
        id: project.slug,
        path: project.path,
        label: project.title ?? project.slug,
        hint: 'Project',
      }));
    const roomRows: PaletteRow[] = rooms
      .filter((room) => matches(q, room.id))
      .slice(0, cap)
      .map((room) => ({ kind: 'room', id: room.id, label: room.id, hint: 'Room' }));
    const assetRows: PaletteRow[] = assets
      .filter((asset) => matches(q, asset.id, asset.path, asset.category))
      .slice(0, cap)
      .map((asset) => ({
        kind: 'asset',
        id: asset.id,
        label: asset.id,
        hint: asset.category || 'Asset',
      }));
    return [...screens, ...projectRows, ...roomRows, ...assetRows];
  }, [query, projects, rooms, assets]);

  const grouped = useMemo(
    () =>
      (
        [
          { title: 'Screens', rows: rows.filter((r) => r.kind === 'screen') },
          { title: 'Projects', rows: rows.filter((r) => r.kind === 'project') },
          { title: 'Rooms', rows: rows.filter((r) => r.kind === 'room') },
          { title: 'Assets', rows: rows.filter((r) => r.kind === 'asset') },
        ] as Array<{ title: string; rows: PaletteRow[] }>
      ).filter((g) => g.rows.length > 0),
    [rows],
  );
  const flatRows = useMemo((): PaletteRow[] => grouped.flatMap((g) => g.rows), [grouped]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'input, button:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, flatRows.length]);

  const activate = (row: PaletteRow) => {
    if (row.kind === 'screen') onSelect(row.id);
    else if (row.kind === 'project') {
      setSelectedPath(row.path);
      navigate('Dashboard');
    } else if (row.kind === 'room') openRoom(row.id);
    else openAsset(row.id);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="goto-overlay" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="goto-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Go to screen, project, room, or asset…"
          aria-label="Filter screens, projects, rooms, and assets"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(flatRows.length - 1, i + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter' && flatRows[activeIndex]) {
              activate(flatRows[activeIndex]!);
            }
          }}
        />
        {flatRows.length === 0 ? (
          <p className="goto-empty">No matching screens, projects, rooms, or assets.</p>
        ) : (
          <div className="goto-groups">
            {grouped.map((group) => (
              <div key={group.title} className="goto-group">
                <p className="goto-group-label type-label">{group.title}</p>
                <ul>
                  {group.rows.map((row) => {
                    const index = flatRows.indexOf(row);
                    return (
                      <li key={`${row.kind}-${row.id}`}>
                        <button
                          type="button"
                          className={index === activeIndex ? 'goto-active' : undefined}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => activate(row)}
                        >
                          <strong>{row.label}</strong>
                          <span>{row.hint}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
