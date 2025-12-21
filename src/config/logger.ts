import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom format
const customFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

// File transport with daily rotation
const fileRotateTransport = new DailyRotateFile({
  filename: 'logs/omniapi-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d', // Keep logs for 14 days
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), customFormat)
});

// Console transport (solo in development)
const consoleTransport = new winston.transports.Console({
  format: combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss' }),
    customFormat
  )
});

// Create logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    fileRotateTransport,
    ...(process.env.NODE_ENV !== 'production' ? [consoleTransport] : [])
  ]
});

export default logger;
