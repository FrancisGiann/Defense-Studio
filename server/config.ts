import path from 'node:path';
export type ServerConfig = {
  port: number;
  dataDir: string;
  groqEnabled: boolean;
  apiKey: string;
  model: string;
  dailyCallLimit: number;
  requestGapMs: number;
  maxQuestions: number;
};
export function readConfig(): ServerConfig {
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const n = Number(process.env[name] || fallback);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`Invalid ${name} configuration.`);
    return n;
  };
  if (process.env.HOST && !['127.0.0.1', 'localhost'].includes(process.env.HOST))
    throw new Error(
      'Personal mode only binds to 127.0.0.1. Remote hosting requires authenticated multi-user implementation.',
    );
  return {
    port: integer('PORT', 4317, 1024, 65535),
    dataDir: path.resolve(process.env.DEFENSE_DATA_DIR || '.data'),
    groqEnabled: process.env.GROQ_ENABLED === 'true',
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    dailyCallLimit: integer('GROQ_DAILY_CALL_LIMIT', 30, 1, 100),
    requestGapMs: integer('GROQ_REQUEST_GAP_MS', 30000, 1000, 300000),
    maxQuestions: 10,
  };
}
