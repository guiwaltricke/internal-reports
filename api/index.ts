/**
 * Vercel serverless entrypoint.
 *
 * vercel.json rewrites every /api/* and /r/* request here, preserving the
 * original URL, so the Express router in server/app.ts matches exactly the same
 * paths it does in local development.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { app, bootstrap } from '../server/app';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await bootstrap();
  return app(req as never, res as never);
}
