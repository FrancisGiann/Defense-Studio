import { existsSync } from 'node:fs';
import path from 'node:path';
import { readConfig } from './config';
import { Repository } from './repository';
import { createApp, errorHandler } from './app';
import express from 'express';
import { createServer as httpServer } from 'node:http';
if (existsSync('.env')) process.loadEnvFile('.env');
const config = readConfig(),
  repo = new Repository(config.dataDir),
  app = createApp(config, repo),
  server = httpServer(app);
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('dist'), { index: false }));
  app.get('/', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, allowedHosts: ['localhost', '127.0.0.1'], hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
app.use(errorHandler);
server.listen(config.port, '127.0.0.1', () =>
  console.log(`Defense Studio • http://127.0.0.1:${config.port} • private personal mode`),
);
function shutdown() {
  server.close(() => {
    repo.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
