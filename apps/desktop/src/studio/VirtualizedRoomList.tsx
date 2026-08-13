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
    <ul ref={ref} className="room-list panel virtualized-room-list" onScroll={onScroll}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visible.map((item, index) => {
          const row = start + index;
          return (
            <li
              key={item.id}
              style={{ position: 'absolute', top: row * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT - 4 }}
            >
              <button type="button" className="room-item-wrap" onClick={() => onSelect(item)}>
                {renderItem(item, item.id === selectedId)}
              </button>
            </li>
          );
        })}
      </div>
    </ul>
  );
}
