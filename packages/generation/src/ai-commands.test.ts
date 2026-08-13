import { describe, expect, it } from 'vitest';
import { parseProjectCommand } from './ai-commands.js';

describe('parseProjectCommand', () => {
  const ctx = { roomIds: ['room_start', 'room_boss'], selectedRoomId: 'room_start' };

  it('parses connect rooms command', () => {
    const cmd = parseProjectCommand('connect room_start to room_boss', ctx);
    expect(cmd?.kind).toBe('world_edit');
    if (cmd?.kind === 'world_edit') {
      expect(cmd.command.type).toBe('connect_rooms');
    }
  });

  it('parses add treasure room command', () => {
    const cmd = parseProjectCommand('add optional treasure room connected to room_start', ctx);
    expect(cmd?.kind).toBe('world_edit');
    if (cmd?.kind === 'world_edit') {
      expect(cmd.command.type).toBe('add_room');
    }
  });

  it('parses make room harder when room selected', () => {
    const cmd = parseProjectCommand('make this room harder', ctx);
    expect(cmd?.kind).toBe('room_edit');
  });

  it('parses disconnect rooms command', () => {
    const cmd = parseProjectCommand('disconnect room_start from room_boss', ctx);
    expect(cmd?.kind).toBe('world_edit');
    if (cmd?.kind === 'world_edit') {
      expect(cmd.command.type).toBe('disconnect_rooms');
    }
  });

  it('returns null for unknown input', () => {
    expect(parseProjectCommand('hello world', ctx)).toBeNull();
  });
});
