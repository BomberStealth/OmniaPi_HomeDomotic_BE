// ============================================
// LOGGER CENTRALIZZATO
// Sostituisce console.log con logging strutturato
// ============================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Livello minimo in base all'ambiente
const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

const formatLog = (entry: LogEntry): string => {
  const { timestamp, level, message, context, data } = entry;
  const levelEmoji: Record<LogLevel, string> = {
    debug: '🔍',
    info: '📘',
    warn: '⚠️',
    error: '❌',
  };

  let log = `${levelEmoji[level]} [${timestamp}] [${level.toUpperCase()}]`;
  if (context) log += ` [${context}]`;
  log += ` ${message}`;

  return log;
};

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
};

const createLogEntry = (level: LogLevel, message: string, context?: string, data?: any): LogEntry => ({
  timestamp: new Date().toISOString(),
  level,
  message,
  context,
  data,
});

const log = (level: LogLevel, message: string, context?: string, data?: any): void => {
  if (!shouldLog(level)) return;

  const entry = createLogEntry(level, message, context, data);
  const formatted = formatLog(entry);

  switch (level) {
    case 'error':
      console.error(formatted, data ? data : '');
      break;
    case 'warn':
      console.warn(formatted, data ? data : '');
      break;
    default:
      console.log(formatted, data ? data : '');
  }
};

// Logger con contesto predefinito
export const createLogger = (context: string) => ({
  debug: (message: string, data?: any) => log('debug', message, context, data),
  info: (message: string, data?: any) => log('info', message, context, data),
  warn: (message: string, data?: any) => log('warn', message, context, data),
  error: (message: string, data?: any) => log('error', message, context, data),
});

// Logger generico
export const logger = {
  debug: (message: string, data?: any) => log('debug', message, undefined, data),
  info: (message: string, data?: any) => log('info', message, undefined, data),
  warn: (message: string, data?: any) => log('warn', message, undefined, data),
  error: (message: string, data?: any) => log('error', message, undefined, data),
};

export default logger;
