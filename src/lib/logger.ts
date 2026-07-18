export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(scope: string): Logger {
  const write = (level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: Record<string, unknown>) => {
    const payload = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[${new Date().toISOString()}] [${level}] [${scope}] ${message}${payload}`);
  };

  return {
    info: (message, meta) => write('INFO', message, meta),
    warn: (message, meta) => write('WARN', message, meta),
    error: (message, meta) => write('ERROR', message, meta),
  };
}
