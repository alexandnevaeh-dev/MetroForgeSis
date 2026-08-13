export const NAV_GROUPS = [
  {
    id: 'create',
    label: 'Create',
    items: [
      { id: 'Dashboard', label: 'Dashboard', shortcut: '1' },
      { id: 'Create', label: 'New Game', shortcut: '2' },
      { id: 'Studio', label: 'Generation Studio', shortcut: '3' },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    items: [
      { id: 'Projects', label: 'Projects', shortcut: '4' },
      { id: 'Assets', label: 'Asset Gallery', shortcut: '5' },
      { id: 'Generate Asset', label: 'Manual Generator', shortcut: '6' },
    ],
  },
  {
    id: 'world',
    label: 'World',
    items: [
      { id: 'World', label: 'World Editor' },
      { id: 'Rooms', label: 'Room Editor' },
      { id: 'Dungeon', label: 'Dungeon Editor' },
      { id: 'Preview', label: 'Game Preview' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    items: [
      { id: 'Models', label: 'Models' },
      { id: 'Providers', label: 'Providers' },
      { id: 'Routing', label: 'Routing Inspector' },
      { id: 'QA', label: 'QA' },
    ],
  },
  {
    id: 'ship',
    label: 'Ship',
    items: [
      { id: 'Export', label: 'Export' },
      { id: 'Settings', label: 'Settings' },
    ],
  },
] as const;

export type NavId = (typeof NAV_GROUPS)[number]['items'][number]['id'];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => [...group.items]);
