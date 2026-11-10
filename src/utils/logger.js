import { env } from '../config/env.js';

const ts = () => new Date().toISOString();

export const logger = {
  info: (...args) => console.log(`[INFO]  ${ts()}`, ...args),
  warn: (...args) => console.warn(`[WARN]  ${ts()}`, ...args),
  error: (...args) => console.error(`[ERROR] ${ts()}`, ...args),
  debug: (...args) => {
    if (env.NODE_ENV === 'development') console.log(`[DEBUG] ${ts()}`, ...args);
  },
};