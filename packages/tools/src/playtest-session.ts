import { prepareGodotGame } from './godot-prepare.js';
import { randomBytes } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, resolve as resolveProjectPath } from 'node:path';
import { terminateProcessTree } from '@metroforge/shared';
import {
  resolveGodotForProject,
  type LaunchGodotResult,
  type ResolveGodotOptions,
} from './godot-launcher.js';

export type PlaytestSession = {
  projectPath: string;
  pid: number;
  running: boolean;
  startedAt: string;
  pauseSupported: boolean;
  pauseReason: string;
  bridgePort?: number;
  embedSupported: false;
  embedReason: string;
  liveEdit?: {
    live: string[];
    requiresRestart: string[];
  };
};

const EMBED_REASON =
  'Godot 4.7 on macOS only embeds into the Godot Editor via CARemoteLayer / --wid (editor↔game IPC). ' +
  'There is no supported API to parent the native game process into an Electron BrowserWindow or NSView. ' +
  'Web export would not be the native runtime. Overlaying a separate Godot window is not embedded play.';

const LIVE_EDIT = {
  live: [
    'pause',
    'resume',
    'get_state',
    'pick_at / Ctrl+click viewport selection',
    'set_entity_position on nodes in the current room',
  ],
  requiresRestart: [
    'room geometry / disk recompilation',
    'quest / dialogue / narrative JSON already loaded by managers',
    'new rooms or world graph topology',
    'ability definitions and most autoload data',
    'tileset / texture replacements already cached by ResourceLoader',
  ],
};

type SessionEntry = {
  proc: ChildProcess;
  startedAt: string;
  token: string;
  bridgePort: number;
  server: Server;
  clients: Set<Socket>;
  authenticated: Set<Socket>;
  paused: boolean;
  pending: Map<string, { cmd: string; socket: Socket; finish: (reply: Record<string, unknown>) => void }>;
};

const sessions = new Map<string, SessionEntry>();
const pendingStarts = new Map<string, AbortController>();

const ALLOWED_COMMANDS = new Set([
  'ping',
  'auth',
  'pause',
  'resume',
  'get_state',
  'pick_at',
  'clear_selection',
  'reload_current_room',
  'set_entity_position',
]);

function assertGodotProject(projectPath: string): void {
  if (!existsSync(join(projectPath, 'project.godot'))) {
    throw new Error('Not a Godot project — project.godot is missing');
  }
}

function sessionFile(projectPath: string): string {
  return join(projectPath, '.metroforge', 'studio-bridge.json');
}

function writeSessionFile(
  projectPath: string,
  data: { port: number; token: string; pid: number },
): void {
  const dir = join(projectPath, '.metroforge');
  mkdirSync(dir, { recursive: true });
  writeFileSync(sessionFile(projectPath), JSON.stringify(data, null, 2));
}

function clearSessionFile(projectPath: string): void {
  try {
    unlinkSync(sessionFile(projectPath));
  } catch {
    // ignore
  }
}

function sendLine(socket: Socket, payload: Record<string, unknown>): void {
  socket.write(`${JSON.stringify(payload)}\n`);
}

function handleClientCommand(
  entry: SessionEntry,
  socket: Socket,
  message: Record<string, unknown>,
): void {
  const cmd = typeof message.cmd === 'string' ? message.cmd : '';
  if (!ALLOWED_COMMANDS.has(cmd)) {
    sendLine(socket, { ok: false, error: 'unknown_command', cmd });
    return;
  }

  if (cmd === 'auth') {
    const token = typeof message.token === 'string' ? message.token : '';
    if (token && token === entry.token) {
      entry.authenticated.add(socket);
      sendLine(socket, { ok: true, cmd: 'auth' });
    } else {
      sendLine(socket, { ok: false, error: 'auth_failed' });
      socket.destroy();
    }
    return;
  }

  if (!entry.authenticated.has(socket) && cmd !== 'ping') {
    sendLine(socket, { ok: false, error: 'unauthorized' });
    return;
  }

  // Forward validated commands to Godot clients (game process sockets tagged differently).
  // Studio Electron is the server; Godot connects as a client with role=runtime.
  if (message.role === 'runtime' || entry.clients.has(socket)) {
    // Runtime acknowledgements
    if (cmd === 'ping') {
      sendLine(socket, { ok: true, cmd: 'ping', pong: true });
      return;
    }
    if (cmd === 'get_state') {
      sendLine(socket, {
        ok: true,
        cmd: 'get_state',
        paused: entry.paused,
        liveEdit: LIVE_EDIT,
      });
      return;
    }
  }

  // Broadcast control commands to runtime sockets
  const runtimePayload = { ...message, token: undefined };
  for (const client of entry.clients) {
    if (client !== socket && entry.authenticated.has(client)) {
      sendLine(client, runtimePayload);
    }
  }

  if (cmd === 'pause') entry.paused = true;
  if (cmd === 'resume') entry.paused = false;

  sendLine(socket, {
    ok: true,
    cmd,
    paused: entry.paused,
    forwarded: true,
    live: LIVE_EDIT.live.includes(cmd) || cmd === 'ping' || cmd === 'get_state',
    requiresRestart: false,
  });
}

function startBridgeServer(
  projectPath: string,
): Promise<{ server: Server; port: number; clients: Set<Socket>; authenticated: Set<Socket> }> {
  return new Promise((resolve, reject) => {
    const clients = new Set<Socket>();
    const authenticated = new Set<Socket>();
    const buffers = new WeakMap<Socket, string>();
    const server = createServer((socket) => {
      clients.add(socket);
      buffers.set(socket, '');
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => {
        const entry = sessions.get(projectPath);
        if (!entry) return;
        const prev = buffers.get(socket) ?? '';
        const data = prev + chunk;
        if (data.length > 1048576) {
          socket.destroy();
          return;
        }
        const parts = data.split('\n');
        buffers.set(socket, parts.pop() ?? '');
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const message = JSON.parse(trimmed) as Record<string, unknown>;
            // Runtime acknowledgements include `ok` — do not re-dispatch as commands.
            if (typeof message.ok === 'boolean' && message.cmd !== 'auth') {
              const requestId = typeof message.requestId === 'string' ? message.requestId : '';
              const pending = entry.pending.get(requestId);
              if (entry.authenticated.has(socket) && pending?.socket === socket && pending.cmd === message.cmd) {
                pending.finish(message);
              }
              continue;
            }
            handleClientCommand(entry, socket, message);
          } catch {
            sendLine(socket, { ok: false, error: 'invalid_json' });
          }
        }
      });
      socket.on('close', () => {
        const entry = sessions.get(projectPath);
        for (const pending of entry?.pending.values() ?? []) {
          if (pending.socket === socket) pending.finish({ ok: false, error: 'Runtime disconnected' });
        }
        clients.delete(socket);
        authenticated.delete(socket);
      });
    });
    server.on('error', reject);
    // Bind loopback only — never 0.0.0.0
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Bridge failed to bind loopback'));
        return;
      }
      resolve({ server, port: addr.port, clients, authenticated });
    });
  });
}

export function getPlaytestSession(projectPath: string): PlaytestSession | null {
  projectPath = resolveProjectPath(projectPath);
  const entry = sessions.get(projectPath);
  if (!entry?.proc.pid) return null;
  const running = entry.proc.exitCode === null && !entry.proc.killed;
  if (!running) {
    void cleanupSession(projectPath);
    return null;
  }
  return {
    projectPath,
    pid: entry.proc.pid,
    running: true,
    startedAt: entry.startedAt,
    pauseSupported: true,
    pauseReason: entry.paused
      ? 'Playtest is paused via the studio runtime bridge.'
      : 'Pause/resume uses the authenticated loopback studio bridge.',
    bridgePort: entry.bridgePort,
    embedSupported: false,
    embedReason: EMBED_REASON,
    liveEdit: LIVE_EDIT,
  };
}

async function cleanupSession(projectPath: string): Promise<void> {
  const entry = sessions.get(projectPath);
  if (!entry) {
    clearSessionFile(projectPath);
    return;
  }
  for (const client of entry.clients) {
    try {
      client.destroy();
    } catch {
      // ignore
    }
  }
  await new Promise<void>((resolve) => {
    entry.server.close(() => resolve());
  });
  if (sessions.get(projectPath) === entry) {
    sessions.delete(projectPath);
    clearSessionFile(projectPath);
  }
}

export function stopPlaytest(projectPath: string): { success: boolean; message: string } {
  projectPath = resolveProjectPath(projectPath);
  pendingStarts.get(projectPath)?.abort();
  pendingStarts.delete(projectPath);
  const entry = sessions.get(projectPath);
  if (!entry) {
    clearSessionFile(projectPath);
    return { success: true, message: 'No playtest is running' };
  }
  const killed = terminateProcessTree(entry.proc);
  void cleanupSession(projectPath);
  return {
    success: killed,
    message: killed ? 'Stopped Godot playtest' : 'Could not stop the Godot playtest process',
  };
}

export async function sendPlaytestCommand(
  projectPath: string,
  cmd: string,
  payload: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string; result?: Record<string, unknown> }> {
  projectPath = resolveProjectPath(projectPath);
  const entry = sessions.get(projectPath);
  if (!entry) return { ok: false, error: 'No playtest session' };
  if (!ALLOWED_COMMANDS.has(cmd) || cmd === 'auth') {
    return { ok: false, error: 'Command not allowed' };
  }

  // Prefer an authenticated runtime client
  const runtime = [...entry.clients].find((c) => entry.authenticated.has(c));
  if (!runtime) {
    // Bridge server may still be waiting for Godot to connect — apply local pause flag for resume-while-paused bookkeeping
    if (cmd === 'pause') entry.paused = true;
    if (cmd === 'resume') entry.paused = false;
    return {
      ok: false,
      error:
        'Runtime bridge client not connected yet. Godot must load StudioRuntimeBridge with METROFORGE_STUDIO_BRIDGE=1.',
    };
  }

  return await new Promise((resolve) => {
    const requestId = randomBytes(16).toString('hex');
    const finish = (reply: Record<string, unknown>) => {
      if (!entry.pending.delete(requestId)) return;
      clearTimeout(timer);
      if (reply.ok === true && (cmd === 'pause' || cmd === 'resume')) entry.paused = reply.paused === true;
      resolve({ ok: reply.ok === true, error: typeof reply.error === 'string' ? reply.error : undefined, result: reply });
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'Bridge command timed out' }), 2500);
    entry.pending.set(requestId, { cmd, socket: runtime, finish });
    // Caller payload must never replace the command or its correlation ID.
    sendLine(runtime, { ...payload, cmd, requestId });
  });
}

async function startPreparedPlaytest(
  projectPath: string,
  options: ResolveGodotOptions & { godotPath?: string | null; headless?: boolean } = {},
  signal?: AbortSignal,
): Promise<LaunchGodotResult & { session?: PlaytestSession }> {
  projectPath = resolveProjectPath(projectPath);
  assertGodotProject(projectPath);
  const resolve = resolveGodotForProject({
    preference: options.preference ?? options.godotPath,
    projectOverride: options.projectOverride,
    envPath: options.envPath,
    projectPath,
    extraKnownPaths: options.extraKnownPaths,
  });
  if (!resolve.path) {
    return {
      success: false,
      message: 'Godot not found — install Godot 4.x, set Settings path, or GODOT_EXECUTABLE',
      resolve,
    };
  }

  try {
    await prepareGodotGame(resolve.path, projectPath, signal);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error), resolve };
  }
  if (signal?.aborted) return { success: false, message: 'Preview launch cancelled', resolve };
  const token = randomBytes(24).toString('hex');
  const { server, port, clients, authenticated } = await startBridgeServer(projectPath);

  if (signal?.aborted) {
    server.close();
    return { success: false, message: 'Preview launch cancelled', resolve };
  }
  const proc = spawn(
    resolve.path,
    [...(options.headless ? ['--headless'] : []), '--path', projectPath],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: options.headless === true,
      env: {
        ...process.env,
        METROFORGE_STUDIO_BRIDGE: '1',
        METROFORGE_BRIDGE_HOST: '127.0.0.1',
        METROFORGE_BRIDGE_PORT: String(port),
        METROFORGE_BRIDGE_TOKEN: token,
      },
    },
  );
  if (!proc.pid) {
    server.close();
    return { success: false, message: 'Godot failed to start', resolve };
  }

  const startedAt = new Date().toISOString();
  const entry: SessionEntry = {
    proc,
    startedAt,
    token,
    bridgePort: port,
    server,
    clients,
    authenticated,
    paused: false,
    pending: new Map(),
  };
  sessions.set(projectPath, entry);
  writeSessionFile(projectPath, { port, token, pid: proc.pid });

  proc.on('exit', () => {
    const current = sessions.get(projectPath);
    if (current?.proc === proc) void cleanupSession(projectPath);
  });

  return {
    success: true,
    message:
      `Launched game in Godot (${resolve.sourceLabel}). External window — not embedded. ` +
      `Studio bridge on 127.0.0.1:${port} (pause/live-edit). ${EMBED_REASON}`,
    resolve,
    session: {
      projectPath,
      pid: proc.pid,
      running: true,
      startedAt,
      pauseSupported: true,
      pauseReason: 'Pause/resume uses the authenticated loopback studio bridge.',
      bridgePort: port,
      embedSupported: false,
      embedReason: EMBED_REASON,
      liveEdit: LIVE_EDIT,
    },
  };
}

export async function startPlaytest(
  projectPath: string,
  options: ResolveGodotOptions & { godotPath?: string | null; headless?: boolean } = {},
): Promise<LaunchGodotResult & { session?: PlaytestSession }> {
  projectPath = resolveProjectPath(projectPath);
  stopPlaytest(projectPath);
  const controller = new AbortController();
  pendingStarts.set(projectPath, controller);
  try {
    return await startPreparedPlaytest(projectPath, options, controller.signal);
  } finally {
    if (pendingStarts.get(projectPath) === controller) pendingStarts.delete(projectPath);
  }
}