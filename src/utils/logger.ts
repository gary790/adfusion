// ============================================
// AD FUSION - Logger (Winston)
// ============================================
import winston from 'winston';
import config from '../config';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, ...metadata }) => {
  let msg = `${ts} [${level}] ${message}`;
  if (Object.keys(metadata).length > 0 && metadata.error !== undefined) {
    msg += ` | ${JSON.stringify(metadata)}`;
  } else if (Object.keys(metadata).length > 0) {
    const filtered = Object.fromEntries(
      Object.entries(metadata).filter(([k]) => !['service', 'splat'].includes(k))
    );
    if (Object.keys(filtered).length > 0) {
      msg += ` | ${JSON.stringify(filtered)}`;
    }
  }
  return msg;
});

export const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  defaultMeta: { service: 'ad-fusion' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
  ],
});

// In production, also log to files
if (config.env === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    })
  );
}
