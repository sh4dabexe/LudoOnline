/**
 * Ludo Online — Firebase Configuration
 *
 * ─────────────────────────────────────────────────────────────────
 *  HOW TO SET UP FIREBASE (5 minutes, completely free):
 * ─────────────────────────────────────────────────────────────────
 *  1. Go to https://console.firebase.google.com
 *  2. Click "Create a project" → give it a name (e.g. "ludo-game")
 *  3. Disable Google Analytics (optional) → Create project
 *  4. In sidebar → Build → Realtime Database → Create database
 *     → Choose a location → Start in TEST MODE → Enable
 *  5. Go to Project Settings (gear icon) → Your apps → Web (</>)
 *  6. Register app (any nickname) → Copy the config object below
 *  7. Replace the placeholder values in FIREBASE_CONFIG with yours
 * ─────────────────────────────────────────────────────────────────
 */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCzUVWQ-BYJcUML2_0Xs3HZbvjlOCclJa8",
  authDomain:        "ludo-game-6b094.firebaseapp.com",
  databaseURL:       "https://ludo-game-6b094-default-rtdb.firebaseio.com",
  projectId:         "ludo-game-6b094",
  storageBucket:     "ludo-game-6b094.firebasestorage.app",
  messagingSenderId: "939852111247",
  appId:             "1:939852111247:web:9b15b1e0ed5dc9a3b1bffa",
  measurementId:     "G-9W14JWMQLX",
};

// ─── DO NOT EDIT BELOW THIS LINE ──────────────────────────────────

window.FIREBASE_READY = false;

(function initFirebase() {
  if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.warn('⚠️  Firebase not configured. Please update js/firebase-config.js');
    window.FIREBASE_NOT_CONFIGURED = true;
    return;
  }

  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    window.db = firebase.database();
    window.FIREBASE_READY = true;
    console.log('✅ Firebase initialized');
  } catch (e) {
    console.error('❌ Firebase init failed:', e);
    window.FIREBASE_ERROR = e.message;
  }
})();
