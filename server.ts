/**
 * Local development entrypoint.
 *
 * Runs the Express API from server/app.ts behind Vite's dev middleware. In
 * production this file is not used: Vercel serves the built SPA from `dist/` as
 * static files and routes /api/* and /r/* to the serverless function in
 * api/index.ts, which mounts the very same Express app.
 */
import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { app, bootstrap } from './server/app';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  await bootstrap();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Next Fit Reports rodando na porta ${PORT}`);
  });
}

start();
