export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  jobId?: string;
  phase?: string;
  provider?: string;
  model?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(
  name: string,
  minLevel: LogLevel = 'info',
  baseContext: LogContext = {},
): Logger {
  const log = (level: LogLevel, message: string, context?: LogContext) => {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      logger: name,
      message,
      ...baseContext,
      ...context,
    };
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (m, c) => log('debug', m, c),
    info: (m, c) => log('info', m, c),
    warn: (m, c) => log('warn', m, c),
    error: (m, c) => log('error', m, c),
    child: (ctx) => createLogger(name, minLevel, { ...baseContext, ...ctx }),
  };
}
