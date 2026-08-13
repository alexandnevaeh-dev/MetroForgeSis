import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_NAV_ITEMS, type NavId } from './nav';

export function GoToPalette({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: NavId) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      inputRef.current?.focus();
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_NAV_ITEMS;
    return ALL_NAV_ITEMS.filter(
      (item) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q),
    );
  }, [query]);

  if (!open) return null;

  return (
    <div className="goto-overlay" role="dialog" aria-modal="true" aria-label="Go to screen" onClick={onClose}>
      <div className="goto-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Go to screen…"
          aria-label="Filter screens"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && matches[0]) {
              onSelect(matches[0].id);
              onClose();
            }
          }}
        />
        <ul>
          {matches.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
              >
                <strong>{item.label}</strong>
                <span>{item.id}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
