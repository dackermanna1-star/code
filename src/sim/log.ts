type Level = 'debug' | 'info' | 'warn' | 'error' | 'audit';
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3, audit: 1 };

let minLevel: Level = 'info';
/** Recent audit events (kills, destroyed structures, cheat use) kept in memory for diagnostics. */
export const auditTrail: string[] = [];

export function setLogLevel(l: Level) {
  minLevel = l;
}

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[minLevel]) return;
  const line = `${level.toUpperCase()} ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  if (level === 'audit') {
    auditTrail.push(`${new Date().toISOString()} ${line}`);
    if (auditTrail.length > 500) auditTrail.shift();
  }
}

export const log = {
  debug: (m: string, d?: Record<string, unknown>) => emit('debug', m, d),
  info: (m: string, d?: Record<string, unknown>) => emit('info', m, d),
  warn: (m: string, d?: Record<string, unknown>) => emit('warn', m, d),
  error: (m: string, d?: Record<string, unknown>) => emit('error', m, d),
  audit: (m: string, d?: Record<string, unknown>) => emit('audit', m, d),
};
