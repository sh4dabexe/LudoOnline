const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// In-memory database of rooms
const rooms = new Map();

// Helper to deep set a value in an object given a path array
function deepSet(obj, pathArray, value) {
  let current = obj;
  for (let i = 0; i < pathArray.length - 1; i++) {
    const key = pathArray[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  const leaf = pathArray[pathArray.length - 1];
  if (value === null) {
    if (Array.isArray(current)) {
      const idx = parseInt(leaf);
      if (!isNaN(idx)) {
        current[idx] = null;
      } else {
        delete current[leaf];
      }
    } else {
      delete current[leaf];
    }
  } else {
    current[leaf] = value;
  }
}

// Helper to deep get a value from an object given a path array
function deepGet(obj, pathArray) {
  let current = obj;
  for (const key of pathArray) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

// Serve static assets from the root directory
app.use(express.static(__dirname));

// API to check server status or get public config
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', roomsCount: rooms.size });
});

// Fallback to index.html for frontend routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io Connection
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Track room subscriptions for this socket
  const subscriptions = new Set();

  socket.on('db_subscribe', ({ path: dbPath }) => {
    const parts = dbPath.split('/').filter(Boolean);
    if (parts[0] === 'rooms' && parts[1]) {
      const roomId = parts[1];
      socket.join(`room_${roomId}`);
      subscriptions.add(dbPath);
      console.log(`👁️  Socket ${socket.id} subscribed to ${dbPath} (Room: ${roomId})`);
      
      // Send initial data immediately
      const room = rooms.get(roomId);
      if (room) {
        const val = deepGet({ rooms: { [roomId]: room } }, parts);
        socket.emit('db_value', { path: dbPath, value: val });
      }
    }
  });

  socket.on('db_unsubscribe', ({ path: dbPath }) => {
    subscriptions.delete(dbPath);
    const parts = dbPath.split('/').filter(Boolean);
    if (parts[0] === 'rooms' && parts[1]) {
      const roomId = parts[1];
      let stillSubscribed = false;
      for (const sub of subscriptions) {
        if (sub.startsWith(`rooms/${roomId}`)) {
          stillSubscribed = true;
          break;
        }
      }
      if (!stillSubscribed) {
        socket.leave(`room_${roomId}`);
      }
      console.log(`🚫 Socket ${socket.id} unsubscribed from ${dbPath}`);
    }
  });

  socket.on('db_write', async ({ path: dbPath, action, value }, callback) => {
    try {
      const parts = dbPath.split('/').filter(Boolean);
      
      if (parts.length === 0 && action === 'update') {
        // Root update, e.g. {"rooms/ABCD/players/uid/ready": true}
        const updates = value;
        const modifiedRooms = new Set();
        
        for (const [updPath, updVal] of Object.entries(updates)) {
          const updParts = updPath.split('/').filter(Boolean);
          if (updParts[0] === 'rooms' && updParts[1]) {
            const roomId = updParts[1];
            let room = rooms.get(roomId);
            if (!room) {
              room = {};
              rooms.set(roomId, room);
            }
            
            const rootObj = { rooms: Object.fromEntries(rooms.entries()) };
            deepSet(rootObj, updParts, updVal);
            rooms.set(roomId, rootObj.rooms[roomId]);
            modifiedRooms.add(roomId);
          }
        }
        
        for (const roomId of modifiedRooms) {
          const room = rooms.get(roomId);
          io.to(`room_${roomId}`).emit('room_update_broadcast', { roomId, room });
        }
      } else if (parts[0] === 'rooms' && parts[1]) {
        const roomId = parts[1];
        let room = rooms.get(roomId);
        if (!room) {
          room = {};
          rooms.set(roomId, room);
        }

        const rootObj = { rooms: Object.fromEntries(rooms.entries()) };
        
        if (action === 'set') {
          deepSet(rootObj, parts, value);
        } else if (action === 'update') {
          for (const [subKey, subVal] of Object.entries(value)) {
            const subParts = [...parts, ...subKey.split('/').filter(Boolean)];
            deepSet(rootObj, subParts, subVal);
          }
        } else if (action === 'remove') {
          deepSet(rootObj, parts, null);
        }

        // Sync back to map
        if (rootObj.rooms[roomId] === null || Object.keys(rootObj.rooms[roomId] || {}).length === 0) {
          rooms.delete(roomId);
        } else {
          rooms.set(roomId, rootObj.rooms[roomId]);
        }
        
        const updatedRoom = rooms.get(roomId);
        io.to(`room_${roomId}`).emit('room_update_broadcast', { roomId, room: updatedRoom || null });
      }

      if (callback) callback({ success: true });
    } catch (err) {
      console.error('❌ Error executing db_write:', err);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  socket.on('db_once', ({ path: dbPath }, callback) => {
    try {
      const parts = dbPath.split('/').filter(Boolean);
      const rootObj = { rooms: Object.fromEntries(rooms.entries()) };
      const val = deepGet(rootObj, parts);
      if (callback) callback({ success: true, value: val });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Ludo Online Server running at http://localhost:${PORT}`);
});
