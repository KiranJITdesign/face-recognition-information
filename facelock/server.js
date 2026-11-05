const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');

const MIME_TYPES = {
  '.bin': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};
const PUBLIC_FILES = new Set(['app.js', 'face-lock.js', 'index.html', 'style.css']);

function createAppServer(root = __dirname) {
  const rooms = new Map();
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end('Invalid URL');
      return;
    }

    const relativePath = pathname === '/' ? 'index.html' : `.${pathname}`;
    const filePath = path.resolve(root, relativePath);
    const relative = path.relative(root, filePath);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const publicPath = relative.split(path.sep).join('/');
    if (!PUBLIC_FILES.has(publicPath) && !publicPath.startsWith('models/') && !publicPath.startsWith('vendor/')) {
      response.writeHead(404).end('Not found');
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      const target = !statError && stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;
      fs.readFile(target, (readError, contents) => {
        if (readError) {
          if (readError.code === 'ENOENT' || readError.code === 'ENOTDIR') {
            response.writeHead(404).end('Not found');
          } else {
            console.error(`Failed to read public file ${publicPath}:`, readError);
            response.writeHead(500).end('Internal server error');
          }
          return;
        }
        response.writeHead(200, {
          'Cache-Control': 'no-cache',
          'Content-Type': MIME_TYPES[path.extname(target)] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(request.method === 'HEAD' ? undefined : contents);
      });
    });
  });

  server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url, 'http://localhost').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, client => {
      webSocketServer.emit('connection', client, request);
    });
  });

  webSocketServer.on('connection', client => {
    let roomName = null;
    let displayName = null;
    let lastMessageAt = 0;

    const send = payload => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
    };
    const broadcastPresence = room => {
      const members = rooms.get(room);
      if (!members) return;
      const unlockedMembers = [...members]
        .filter(member => member.readyState === WebSocket.OPEN)
        .map(member => ({ name: member.displayName, unlocked: true }));
      const payload = JSON.stringify({ type: 'presence', count: unlockedMembers.length, members: unlockedMembers });
      for (const member of members) {
        if (member.readyState === WebSocket.OPEN) member.send(payload);
      }
    };

    client.on('message', (raw, isBinary) => {
      if (isBinary) {
        send({ type: 'error', message: 'Only text messages are supported.' });
        return;
      }

      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        send({ type: 'error', message: 'Invalid message format.' });
        return;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        send({ type: 'error', message: 'Invalid message format.' });
        return;
      }

      if (!roomName) {
        const room = typeof payload.room === 'string' ? payload.room.trim() : '';
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (payload.type !== 'join' || !/^[A-Za-z0-9_-]{6,32}$/.test(room)) {
          send({ type: 'error', message: 'Invalid room link. Create or open a valid invite link.' });
          return;
        }
        if (!name || name.length > 32 || /[\u0000-\u001f\u007f]/.test(name)) {
          send({ type: 'error', message: 'Choose a display name of 1 to 32 characters.' });
          return;
        }

        roomName = room;
        displayName = name;
        client.displayName = displayName;
        if (!rooms.has(roomName)) rooms.set(roomName, new Set());
        const members = rooms.get(roomName);
        for (const member of members) {
          if (member.readyState === WebSocket.OPEN) {
            member.send(JSON.stringify({ type: 'member_joined', name: displayName }));
          }
        }
        members.add(client);
        send({ type: 'joined', room: roomName });
        broadcastPresence(roomName);
        return;
      }

      if (payload.type !== 'message' || typeof payload.text !== 'string') {
        send({ type: 'error', message: 'Unsupported chat action.' });
        return;
      }

      const text = payload.text.trim();
      if (!text || text.length > 2000) {
        send({ type: 'error', message: 'Messages must be between 1 and 2000 characters.' });
        return;
      }

      const now = Date.now();
      if (now - lastMessageAt < 250) {
        send({ type: 'error', message: 'Please wait a moment before sending another message.' });
        return;
      }
      lastMessageAt = now;

      const message = {
        type: 'message',
        name: displayName,
        text,
        at: new Date(now).toISOString()
      };
      for (const member of rooms.get(roomName) || []) {
        if (member.readyState === WebSocket.OPEN) {
          member.send(JSON.stringify({ ...message, fromSelf: member === client }));
        }
      }
    });

    client.on('close', () => {
      if (!roomName) return;
      const members = rooms.get(roomName);
      members?.delete(client);
      if (members?.size) {
        const leftNotice = JSON.stringify({ type: 'member_left', name: displayName });
        for (const member of members) {
          if (member.readyState === WebSocket.OPEN) member.send(leftNotice);
        }
        broadcastPresence(roomName);
      }
      else rooms.delete(roomName);
    });
  });

  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`FaceLock is running at http://localhost:${port}`);
  });
}

module.exports = { createAppServer };
