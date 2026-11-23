import http from 'node:http';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './src/server/createApiRouter.ts';
import type { PlayerAvatarState } from './src/types/eduverse.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // ==================== REALTIME MULTIPLAYER ROOMS ====================
  interface SocketClient {
    ws: WebSocket;
    sessionId: string;
    studentId: string;
    displayName: string;
    role: 'guru' | 'siswa' | 'super_admin';
    playerState?: PlayerAvatarState;
  }

  const clients = new Map<WebSocket, SocketClient>();

  const broadcastToRoom = (sessionId: string, payload: unknown, excludeWs?: WebSocket) => {
    const serialized = JSON.stringify(payload);
    for (const [sock, info] of clients.entries()) {
      if (info.sessionId === sessionId && sock !== excludeWs && sock.readyState === WebSocket.OPEN) {
        sock.send(serialized);
      }
    }
  };

  const getRoomPlayers = (sessionId: string): PlayerAvatarState[] => {
    const list: PlayerAvatarState[] = [];
    for (const info of clients.values()) {
      if (info.sessionId === sessionId && info.playerState) {
        list.push(info.playerState);
      }
    }
    return list;
  };

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'join_room') {
          const sessionId = String(msg.sessionId || 'lobby');
          const studentId = String(msg.studentId || `guest_${Date.now()}`);
          const displayName = String(msg.displayName || 'Penjelajah').slice(0, 60);
          const role = msg.role === 'guru' || msg.role === 'super_admin' ? msg.role : 'siswa';
          const avatarColor = String(msg.avatarColor || '#3B82F6');
          const skinId = typeof msg.skinId === 'string' ? msg.skinId : undefined;

          const playerState: PlayerAvatarState | undefined =
            role === 'siswa'
              ? {
                  id: `ps_${sessionId}_${studentId}`,
                  sessionId,
                  studentId,
                  displayName,
                  avatarColor,
                  ...(skinId ? { skinId: skinId as PlayerAvatarState['skinId'] } : {}),
                  x: Number(msg.x ?? 0),
                  y: Number(msg.y ?? 0),
                  z: Number(msg.z ?? 18),
                  rotY: Number(msg.rotY ?? 0),
                  animState: 'idle',
                  currentZone: 'sekolah',
                  isOnline: true,
                  updatedAt: new Date().toISOString(),
                }
              : undefined;

          clients.set(ws, { ws, sessionId, studentId, displayName, role, playerState });

          // Send initial room snapshot to newly connected client
          ws.send(
            JSON.stringify({
              type: 'room_init',
              players: getRoomPlayers(sessionId),
            })
          );

          if (playerState) {
            broadcastToRoom(sessionId, { type: 'player_joined', player: playerState }, ws);
          }
        } else if (msg.type === 'player_move') {
          const info = clients.get(ws);
          if (!info || !info.playerState) return;
          info.playerState = {
            ...info.playerState,
            x: Number(msg.x ?? info.playerState.x),
            y: Number(msg.y ?? info.playerState.y),
            z: Number(msg.z ?? info.playerState.z),
            rotY: Number(msg.rotY ?? info.playerState.rotY),
            animState: msg.animState || 'idle',
            currentZone: msg.currentZone || info.playerState.currentZone,
            updatedAt: new Date().toISOString(),
          };
          broadcastToRoom(info.sessionId, { type: 'player_moved', player: info.playerState }, ws);
        }
      } catch {
        // Ignore malformed websocket packets
      }
    });

    ws.on('close', () => {
      const info = clients.get(ws);
      if (info) {
        clients.delete(ws);
        broadcastToRoom(info.sessionId, {
          type: 'player_left',
          studentId: info.studentId,
        });
      }
    });
  });

  // ==================== SHARED REST API ====================
  const apiApp = createApiApp({
    onBroadcastRoom: (sessionId, payload) => broadcastToRoom(sessionId, payload),
    getOnlineCount: (sessionId) => getRoomPlayers(sessionId).length,
  });
  app.use(apiApp);

  // ==================== VITE DEV / PROD STATIC SERVING ====================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`EDUVERSE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
