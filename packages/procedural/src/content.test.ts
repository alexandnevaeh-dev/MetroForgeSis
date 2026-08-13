import { describe, it, expect } from 'vitest';
import { generateGameContent, enemyCombatTypeForIndex, enemyMovementForIndex, collectibleCountForProfile } from '../src/content.js';
import { GameDNASchema } from '@metroforge/schemas';

const testDna = GameDNASchema.parse({
  version: '0.1.0',
  identity: {
    title: 'Test Game',
    genre: 'Metroidvania',
    tone: 'dark',
    visualStyle: 'pixel',
  },
  technical: {
    resolution: { width: 1920, height: 1080 },
    tileSize: 16,
    targetPlaytimeHours: 1,
    difficulty: 'normal',
  },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 8 },
  narrative: {
    premise: 'Test',
    protagonist: 'Hero',
    centralConflict: 'Conflict',
  },
  seed: 42,
  profile: 'TINY_TEST',
});

const testRoomIds = Array.from({ length: 8 }, (_, i) => `room_${i.toString().padStart(3, '0')}`);

describe('generateGameContent', () => {
  it('generates tiny test content counts', () => {
    const content = generateGameContent(testDna, 'TINY_TEST', 42, 'room_007', testRoomIds);
    expect(content.enemies).toHaveLength(2);
    expect(content.bosses).toHaveLength(1);
    expect(content.quests).toHaveLength(1);
    expect(content.items.some((item) => item.category === 'currency')).toBe(true);
    expect(content.items.some((item) => item.category === 'consumable')).toBe(true);
    expect(content.items.some((item) => item.category === 'relic')).toBe(true);
    expect(content.items.some((item) => item.category === 'charm')).toBe(true);
    expect(content.items.some((item) => item.category === 'key')).toBe(true);
    expect(content.items.some((item) => item.category === 'upgrade_material')).toBe(true);
    expect(content.items.some((item) => item.category === 'weapon')).toBe(true);
    expect(content.items.some((item) => item.category === 'quest')).toBe(true);
    expect(content.items.some((item) => item.category === 'collectible')).toBe(true);
    expect(content.items.some((item) => item.id === 'lost_echo')).toBe(true);
    expect(content.items.filter((item) => item.category === 'collectible')).toHaveLength(
      collectibleCountForProfile('TINY_TEST'),
    );
    expect(content.npcs).toHaveLength(1);
    expect(content.dialogues.length).toBeGreaterThan(0);
    expect(content.shops.length).toBeGreaterThanOrEqual(0);
  });

	it('first quest rewards a quest item', () => {
		const content = generateGameContent(testDna, 'TINY_TEST', 42, 'room_007', testRoomIds);
		expect(content.quests[0]?.rewards.some((r) => r.type === 'item' && r.id === 'warden_seal')).toBe(
			true,
		);
	});

	it('TINY_TEST first two enemies are melee then projectile', () => {
		const content = generateGameContent(testDna, 'TINY_TEST', 42, 'room_007', testRoomIds);
		expect(content.enemies[0]?.combat.type).toBe('melee');
		expect(content.enemies[1]?.combat.type).toBe('projectile');
		expect(content.enemies[0]?.movement).toBe('patrol');
		expect(content.enemies[1]?.movement).toBe('hop');
	});

	it('rotates extra combat types after melee and projectile', () => {
		expect(enemyCombatTypeForIndex(0)).toBe('melee');
		expect(enemyCombatTypeForIndex(1)).toBe('projectile');
		expect(enemyCombatTypeForIndex(2)).toBe('burst');
		expect(enemyCombatTypeForIndex(3)).toBe('beam');
		expect(enemyCombatTypeForIndex(4)).toBe('area');
		expect(enemyCombatTypeForIndex(5)).toBe('summon');
		expect(enemyCombatTypeForIndex(6)).toBe('trap');
		expect(enemyCombatTypeForIndex(7)).toBe('burst');
	});

	it('assigns grounded then extra movement types, with traps staying stationary', () => {
		expect(enemyMovementForIndex(0, 'melee')).toBe('patrol');
		expect(enemyMovementForIndex(1, 'projectile')).toBe('hop');
		expect(enemyMovementForIndex(2, 'burst')).toBe('crawl');
		expect(enemyMovementForIndex(3, 'beam')).toBe('fly');
		expect(enemyMovementForIndex(4, 'area')).toBe('hover');
		expect(enemyMovementForIndex(5, 'summon')).toBe('charge');
		expect(enemyMovementForIndex(6, 'trap')).toBe('stationary');
		expect(enemyMovementForIndex(7, 'burst')).toBe('teleport');
		expect(enemyMovementForIndex(8, 'beam')).toBe('burrow');
	});

	it('SMALL profile generates every schema combat type', () => {
		const smallDna = { ...testDna, profile: 'SMALL' as const, world: { biomeCount: 3, roomCount: 42 } };
		const smallRooms = Array.from({ length: 42 }, (_, i) => `room_${i.toString().padStart(3, '0')}`);
		const content = generateGameContent(
			GameDNASchema.parse(smallDna),
			'SMALL',
			42,
			'room_041',
			smallRooms,
		);
		const types = new Set(content.enemies.map((e) => e.combat.type));
		for (const combatType of ['melee', 'projectile', 'burst', 'beam', 'area', 'summon', 'trap'] as const) {
			expect(types.has(combatType)).toBe(true);
		}
		for (const enemy of content.enemies) {
			if (enemy.combat.type === 'trap') {
				expect(enemy.movement).toBe('stationary');
			}
		}
		const movements = new Set(content.enemies.map((e) => e.movement));
		for (const movement of ['patrol', 'hop', 'crawl', 'fly', 'hover', 'charge', 'teleport', 'burrow', 'stationary'] as const) {
			expect(movements.has(movement)).toBe(true);
		}
	});

  it('final boss has boss_final id', () => {
    const content = generateGameContent(testDna, 'TINY_TEST', 42, 'room_007', testRoomIds);
    expect(content.bosses[0]?.id).toBe('boss_final');
  });

  it('NPCs are placed in interior rooms, not the start or boss room', () => {
    const content = generateGameContent(testDna, 'TINY_TEST', 42, 'room_007', testRoomIds);
    for (const npc of content.npcs) {
      expect(npc.roomId).not.toBe('room_000');
      expect(npc.roomId).not.toBe('room_007');
      expect(npc.spriteId).toBe(npc.id);
    }
  });

  it('quest_giver NPCs reference a real generated quest id', () => {
    const content = generateGameContent(testDna, 'TINY_TEST', 42, 'room_007', testRoomIds);
    const questIds = new Set(content.quests.map((q) => q.id));
    for (const npc of content.npcs) {
      if (npc.role === 'quest_giver') {
        for (const qid of npc.questIds) {
          expect(questIds.has(qid)).toBe(true);
        }
      }
    }
  });

  it('SMALL profile rotates intermediate quest objective types before a final BossKill', () => {
    const smallDna = { ...testDna, profile: 'SMALL' as const, world: { biomeCount: 3, roomCount: 42 } };
    const smallRooms = Array.from({ length: 42 }, (_, i) => `room_${i.toString().padStart(3, '0')}`);
    const content = generateGameContent(
      GameDNASchema.parse(smallDna),
      'SMALL',
      42,
      'room_041',
      smallRooms,
    );
    expect(content.quests).toHaveLength(4);
    expect(content.quests[0]?.objectives[0]?.type).toBe('Reach');
    expect(content.quests[1]?.objectives[0]?.type).toBe('Kill');
    expect(content.quests[2]?.objectives[0]?.type).toBe('Collect');
    expect(content.quests[2]?.objectives[0]?.target).toBe('lost_echo');
    expect(content.quests[3]?.objectives[0]?.type).toBe('BossKill');
    expect(content.quests[3]?.objectives[0]?.target).toBe('boss_final');
  });

  it('MEDIUM profile rotates extended quest objective types before BossKill', () => {
    const mediumDna = {
      ...testDna,
      profile: 'MEDIUM' as const,
      world: { biomeCount: 5, roomCount: 120 },
      abilities: [
        { id: 'dash', name: 'Dash', category: 'movement', enabled: true },
        { id: 'double_jump', name: 'Double Jump', category: 'movement', enabled: true },
      ],
    };
    const mediumRooms = Array.from({ length: 120 }, (_, i) => `room_${i.toString().padStart(3, '0')}`);
    const content = generateGameContent(
      GameDNASchema.parse(mediumDna),
      'MEDIUM',
      42,
      'room_119',
      mediumRooms,
    );
    expect(content.quests).toHaveLength(10);
    expect(content.quests[5]?.objectives[0]?.type).toBe('Discover');
    expect(content.quests[6]?.objectives[0]?.type).toBe('Activate');
    expect(content.quests[6]?.objectives[0]?.target).toMatch(/^save_room_/);
    expect(content.quests[7]?.objectives[0]?.type).toBe('Interact');
    expect(content.quests[7]?.objectives[0]?.target).toBe('shop_npc_001');
    expect(content.quests[8]?.objectives[0]?.type).toBe('Choice');
    expect(content.quests[8]?.objectives[0]?.target).toBe('quest_008_accept');
    const offer = content.dialogues.find((dlg) => dlg.id === 'quest_008_offer');
    const choiceLine = offer?.lines.find((line) => (line.choices?.length ?? 0) > 0);
    expect(choiceLine?.choices?.[0]?.id).toBe('quest_008_accept');
    expect(content.quests[9]?.objectives[0]?.type).toBe('BossKill');
  });

  it('SMALL profile generates merchant shops and quest dialogue ids', () => {
    const smallDna = { ...testDna, profile: 'SMALL' as const, world: { biomeCount: 3, roomCount: 42 } };
    const smallRooms = Array.from({ length: 42 }, (_, i) => `room_${i.toString().padStart(3, '0')}`);
    const content = generateGameContent(
      GameDNASchema.parse(smallDna),
      'SMALL',
      42,
      'room_041',
      smallRooms,
    );
    const merchant = content.npcs.find((npc) => npc.role === 'merchant');
    expect(merchant?.shopId).toBeTruthy();
    expect(content.shops.some((shop) => shop.id === merchant?.shopId)).toBe(true);
    const merchantShop = content.shops.find((shop) => shop.id === merchant?.shopId);
    expect(merchantShop?.entries.some((entry) => entry.itemId === 'power_charm')).toBe(true);
    expect(merchantShop?.entries.some((entry) => entry.itemId === 'forged_blade')).toBe(true);
    expect(content.quests[0]?.dialogueStartId).toBe('quest_000_offer');
    expect(content.dialogues.some((dlg) => dlg.id === 'quest_000_offer')).toBe(true);
    const offer = content.dialogues.find((dlg) => dlg.id === 'quest_000_offer');
    expect(offer?.lines.some((line) => (line.choices?.length ?? 0) > 0)).toBe(true);
  });

  it('assigns unique visualPrompt to each boss for AI art generation', () => {
    const smallDna = { ...testDna, profile: 'SMALL' as const, world: { biomeCount: 3, roomCount: 42 } };
    const smallRooms = Array.from({ length: 42 }, (_, i) => `room_${i.toString().padStart(3, '0')}`);
    const content = generateGameContent(
      GameDNASchema.parse(smallDna),
      'SMALL',
      42,
      'room_041',
      smallRooms,
    );
    expect(content.bosses.length).toBeGreaterThan(1);
    for (const boss of content.bosses) {
      expect(boss.visualPrompt).toBeTruthy();
      expect(boss.visualPrompt).toContain(boss.name);
    }
    const prompts = content.bosses.map((b) => b.visualPrompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('SMALL profile generates multiple unique collectibles', () => {
    const smallDna = { ...testDna, profile: 'SMALL' as const, world: { biomeCount: 3, roomCount: 42 } };
    const smallRooms = Array.from({ length: 42 }, (_, i) => `room_${i.toString().padStart(3, '0')}`);
    const content = generateGameContent(
      GameDNASchema.parse(smallDna),
      'SMALL',
      42,
      'room_041',
      smallRooms,
    );
    const collectibles = content.items.filter((item) => item.category === 'collectible');
    expect(collectibles).toHaveLength(collectibleCountForProfile('SMALL'));
    expect(new Set(collectibles.map((item) => item.id)).size).toBe(collectibles.length);
    expect(collectibles[0]?.id).toBe('lost_echo');
  });
});
