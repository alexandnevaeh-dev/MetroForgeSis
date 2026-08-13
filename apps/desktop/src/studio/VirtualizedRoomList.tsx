import { useCallback, useEffect, useRef, useState } from 'react';

const ROW_HEIGHT = 52;
const OVERSCAN = 6;

interface VirtualizedRoomListProps<T extends { id: string }> {
  items: T[];
  selectedId?: string;
  onSelect: (item: T) => void;
  renderItem: (item: T, selected: boolean) => React.ReactNode;
}

export function VirtualizedRoomList<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  renderItem,
}: VirtualizedRoomListProps<T>) {
  const ref = useRef<HTMLUListElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const totalHeight = items.length * ROW_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const visible = items.slice(start, end);

  const onScroll = useCallback(() => {
    if (ref.current) setScrollTop(ref.current.scrollTop);
  }, []);

  return (
    <ul
      ref={ref}
      className="room-list panel virtualized-room-list"
      tabIndex={0}
      role="listbox"
      aria-label="Rooms"
      aria-activedescendant={selectedId ? `room-row-${selectedId}` : undefined}
      onScroll={onScroll}
      onKeyDown={(event) => {
        if (!items.length) return;
        const current = Math.max(0, items.findIndex((item) => item.id === selectedId));
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          const next = items[Math.min(items.length - 1, current + 1)];
          if (next) {
            onSelect(next);
            ref.current?.scrollTo({ top: Math.min(items.length - 1, current + 1) * ROW_HEIGHT });
          }
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          const prev = items[Math.max(0, current - 1)];
          if (prev) {
            onSelect(prev);
            ref.current?.scrollTo({ top: Math.max(0, current - 1) * ROW_HEIGHT });
          }
        }
        if (event.key === 'Home') {
          event.preventDefault();
          onSelect(items[0]!);
          ref.current?.scrollTo({ top: 0 });
        }
        if (event.key === 'End') {
          event.preventDefault();
          onSelect(items[items.length - 1]!);
          ref.current?.scrollTo({ top: (items.length - 1) * ROW_HEIGHT });
        }
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visible.map((item, index) => {
          const row = start + index;
          return (
            <li
              key={item.id}
              style={{ position: 'absolute', top: row * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT - 4 }}
            >
              <button
                type="button"
                id={`room-row-${item.id}`}
                role="option"
                aria-selected={item.id === selectedId}
                className="room-item-wrap"
                onClick={() => onSelect(item)}
              >
                {renderItem(item, item.id === selectedId)}
              </button>
            </li>
          );
        })}
      </div>
    </ul>
  );
}
