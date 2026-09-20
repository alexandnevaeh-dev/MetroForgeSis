export const NAV_GROUPS = [
  {
    id: 'create',
    label: 'The Floor',
    items: [
      { id: 'Dashboard', label: 'Hearth · Overview', shortcut: '1', forge: 'Hearth', functionLabel: 'Overview' },
      { id: 'Create', label: 'Commission · New Game', shortcut: '2', forge: 'Commission', functionLabel: 'New Game' },
      { id: 'Studio', label: 'Crucible · Generation', shortcut: '3', forge: 'Crucible', functionLabel: 'Generation' },
    ],
  },
  {
    id: 'library',
    label: 'The Vault',
    items: [
      { id: 'Projects', label: 'Vault · Projects', shortcut: '4', forge: 'Vault', functionLabel: 'Projects' },
      { id: 'Assets', label: 'Foundry · Assets', shortcut: '5', forge: 'Foundry', functionLabel: 'Assets' },
      { id: 'Generate Asset', label: 'Anvil · Generator', shortcut: '6', forge: 'Anvil', functionLabel: 'Generator' },
    ],
  },
  {
    id: 'world',
    label: 'The Workshop',
    items: [
      { id: 'World', label: 'World Map · Editor', forge: 'World Map', functionLabel: 'Editor' },
      { id: 'Rooms', label: 'Chambers · Rooms', forge: 'Chambers', functionLabel: 'Rooms' },
      { id: 'Dungeon', label: 'Deep Holds · Dungeon', forge: 'Deep Holds', functionLabel: 'Dungeon' },
      { id: 'Story', label: 'Chronicle · Story', forge: 'Chronicle', functionLabel: 'Story' },
      { id: 'Preview', label: 'Crucible Play · Playtest', forge: 'Crucible Play', functionLabel: 'Playtest' },
    ],
  },
  {
    id: 'ai',
    label: 'The Kiln',
    items: [
      { id: 'Models', label: 'Kiln · Models', forge: 'Kiln', functionLabel: 'Models' },
      { id: 'Providers', label: 'Bellows · Providers', forge: 'Bellows', functionLabel: 'Providers' },
      { id: 'Routing', label: 'Flues · Routing', forge: 'Flues', functionLabel: 'Routing' },
      { id: 'QA', label: 'Assay · QA', forge: 'Assay', functionLabel: 'QA' },
      { id: 'Visual Review', label: 'Quench · Visual Review', forge: 'Quench', functionLabel: 'Visual Review' },
    ],
  },
  {
    id: 'ship',
    label: 'Dispatch',
    items: [
      { id: 'Export', label: 'Dispatch · Export', forge: 'Dispatch', functionLabel: 'Export' },
      { id: 'Settings', label: 'Smithy · Settings', forge: 'Smithy', functionLabel: 'Settings' },
    ],
  },
] as const;

export type NavId = (typeof NAV_GROUPS)[number]['items'][number]['id'];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => [...group.items]);
