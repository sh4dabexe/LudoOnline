/**
 * Ludo Online — Socket.io Mock Firebase Client Config
 * 
 * This file replaces the client-side Firebase library calls with Socket.io events.
 * It exposes the exact same API (window.firebase and window.db) so the game logic
 * in room-manager.js and game-page.js functions without modification.
 */

(function() {
  console.log('🔌 Connecting to WebSocket server...');
  const socket = io();
  window.socket = socket;

  // Active path listeners: Map of dbPath -> Set of callbacks
  const listeners = new Map();

  // Helper to deep get a value relative to roomData
  function resolvePath(roomData, dbPath, targetRoomId) {
    const parts = dbPath.split('/').filter(Boolean);
    if (parts.length === 0) return { rooms: { [targetRoomId]: roomData } };
    
    if (parts[0] === 'rooms') {
      if (parts[1] !== targetRoomId) return undefined;
      let current = roomData;
      for (let i = 2; i < parts.length; i++) {
        if (current === null || current === undefined || typeof current !== 'object') {
          return undefined;
        }
        current = current[parts[i]];
      }
      return current;
    }
    return undefined;
  }

  // Handle incoming broadcast updates from server
  socket.on('room_update_broadcast', ({ roomId, room }) => {
    for (const [dbPath, callbacks] of listeners.entries()) {
      const parts = dbPath.split('/').filter(Boolean);
      if (parts[0] === 'rooms' && parts[1] === roomId) {
        const val = resolvePath(room, dbPath, roomId);
        const snap = {
          val: () => val,
          exists: () => val !== undefined && val !== null
        };
        callbacks.forEach(cb => {
          try { cb(snap); } catch(e) { console.error(e); }
        });
      }
    }
  });

  // Handle initial value returned directly on subscription
  socket.on('db_value', ({ path: dbPath, value }) => {
    const callbacks = listeners.get(dbPath);
    if (callbacks) {
      const snap = {
        val: () => value,
        exists: () => value !== undefined && value !== null
      };
      callbacks.forEach(cb => {
        try { cb(snap); } catch(e) { console.error(e); }
      });
    }
  });

  // Mock Database Reference Class
  class DatabaseRef {
    constructor(dbPath) {
      this.dbPath = dbPath;
    }

    async set(value) {
      return new Promise((resolve, reject) => {
        socket.emit('db_write', { path: this.dbPath, action: 'set', value }, (res) => {
          if (res && res.success) resolve();
          else reject(new Error(res ? res.error : 'Write failed'));
        });
      });
    }

    async update(value) {
      return new Promise((resolve, reject) => {
        socket.emit('db_write', { path: this.dbPath, action: 'update', value }, (res) => {
          if (res && res.success) resolve();
          else reject(new Error(res ? res.error : 'Update failed'));
        });
      });
    }

    async remove() {
      return new Promise((resolve, reject) => {
        socket.emit('db_write', { path: this.dbPath, action: 'remove' }, (res) => {
          if (res && res.success) resolve();
          else reject(new Error(res ? res.error : 'Remove failed'));
        });
      });
    }

    async once(type) {
      if (type !== 'value') throw new Error('Only value type is supported in mock');
      return new Promise((resolve, reject) => {
        socket.emit('db_once', { path: this.dbPath }, (res) => {
          if (res && res.success) {
            resolve({
              val: () => res.value,
              exists: () => res.value !== undefined && res.value !== null
            });
          } else {
            reject(new Error(res ? res.error : 'Read failed'));
          }
        });
      });
    }

    on(type, callback) {
      if (type !== 'value') throw new Error('Only value type is supported in mock');
      
      let pathCallbacks = listeners.get(this.dbPath);
      if (!pathCallbacks) {
        pathCallbacks = new Set();
        listeners.set(this.dbPath, pathCallbacks);
        socket.emit('db_subscribe', { path: this.dbPath });
      }
      pathCallbacks.add(callback);
    }

    off(type, callback) {
      let pathCallbacks = listeners.get(this.dbPath);
      if (pathCallbacks) {
        if (callback) {
          pathCallbacks.delete(callback);
        } else {
          pathCallbacks.clear();
        }
        if (pathCallbacks.size === 0) {
          listeners.delete(this.dbPath);
          socket.emit('db_unsubscribe', { path: this.dbPath });
        }
      }
    }

    limitToLast(n) {
      return this; // mock query filter
    }
  }

  // Expose the Firebase mock interface
  window.firebase = {
    initializeApp: () => {
      console.log('✅ Mock Firebase Initialized successfully');
    },
    database: () => {
      return {
        ref: (path) => new DatabaseRef(path || '/')
      };
    }
  };

  window.db = window.firebase.database();
  window.FIREBASE_READY = true;
  window.FIREBASE_NOT_CONFIGURED = false;
  console.log('✅ Firebase Socket.io proxy initialized successfully');
})();
