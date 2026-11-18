import type { IncomingMessage, ServerResponse } from 'node:http';
import dotenv from 'dotenv';
import { createApiApp } from '../src/server/createApiRouter.ts';
import { normalizeVercelApiUrl } from '../src/server/vercelUrl.ts';

dotenv.config();

const apiApp = createApiApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = normalizeVercelApiUrl(req.url || '/api');
  return apiApp(req as Parameters<typeof apiApp>[0], res as Parameters<typeof apiApp>[1]);
}
