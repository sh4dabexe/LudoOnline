/**
 * Ludo Online — Board & Game Constants
 * 
 * Board is 15x15 grid. Coordinates are [row, col] (0-indexed).
 * 
 * Home areas (corners):
 *   Red    → rows 0-5, cols 0-5   (top-left)
 *   Green  → rows 0-5, cols 9-14  (top-right)
 *   Yellow → rows 9-14, cols 9-14 (bottom-right)
 *   Blue   → rows 9-14, cols 0-5  (bottom-left)
 *
 * Center cell: [7, 7]
 */

// ─── Color configuration ───────────────────────────────────────────────────

const COLOR_CONFIG = {
  red: {
    name: 'Red',
    emoji: '🔴',
    bg: '#ef4444',
    light: '#fee2e2',
    mid: '#fca5a5',
    dark: '#b91c1c',
    glow: 'rgba(239,68,68,0.45)',
    text: '#fff',
  },
  green: {
    name: 'Green',
    emoji: '🟢',
    bg: '#22c55e',
    light: '#dcfce7',
    mid: '#86efac',
    dark: '#15803d',
    glow: 'rgba(34,197,94,0.45)',
    text: '#fff',
  },
  yellow: {
    name: 'Yellow',
    emoji: '🟡',
    bg: '#eab308',
    light: '#fef9c3',
    mid: '#fde047',
    dark: '#a16207',
    glow: 'rgba(234,179,8,0.45)',
    text: '#1a1a1a',
  },
  blue: {
    name: 'Blue',
    emoji: '🔵',
    bg: '#3b82f6',
    light: '#dbeafe',
    mid: '#93c5fd',
    dark: '#1d4ed8',
    glow: 'rgba(59,130,246,0.45)',
    text: '#fff',
  },
};

// Colors assigned per player count
const COLOR_ASSIGNMENTS = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};

// ─── Main Path ─────────────────────────────────────────────────────────────
// 52 cells in clockwise order starting from Red's safe entry square (6,1).

const MAIN_PATH = [
  /* 0-4  */ [6,1],[6,2],[6,3],[6,4],[6,5],
  /* 5-10 */ [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  /* 11   */ [0,7],
  /* 12-17*/ [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],  // Green enters at idx 13 = [1,8]
  /* 18-23*/ [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  /* 24-25*/ [7,14],[8,14],
  /* 26-30*/ [8,13],[8,12],[8,11],[8,10],[8,9],    // Yellow enters at idx 26 = [8,13]
  /* 31-36*/ [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  /* 37   */ [14,7],
  /* 38-43*/ [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],  // Blue enters at idx 39 = [13,6]
  /* 44-49*/ [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  /* 50-51*/ [7,0],[6,0],
];

// Starting main-path indices for each color
const COLOR_START_INDEX = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// ─── Home Stretch ──────────────────────────────────────────────────────────
// 6 colored cells leading to center for each color.

const HOME_PATHS = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  blue:   [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};

// Winning cell (center)
const CENTER_CELL = [7, 7];

// ─── Yard (starting home) positions ───────────────────────────────────────
// 4 token-spot positions inside each colored home area.

// 4 token-spot positions inside each colored home area.
// Arranged as a centered 2×2 cluster (cells 2-3 within the 6×6 corner's 4×4 inner
// well) so the pieces sit centered with equal spacing instead of hugging corners.
const YARD_POSITIONS = {
  red:    [[2,2],[2,3],[3,2],[3,3]],
  green:  [[2,11],[2,12],[3,11],[3,12]],
  yellow: [[11,11],[11,12],[12,11],[12,12]],
  blue:   [[11,2],[11,3],[12,2],[12,3]],
};

// ─── Safe squares ─────────────────────────────────────────────────────────
// MAIN_PATH indices where tokens cannot be captured.
// Includes all 4 color start squares + 4 star squares.

const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// ─── Token position encoding ───────────────────────────────────────────────
//  -1       → in yard (not started)
//   0       → on color's safe starting square (spawn tile)
//   1..50   → on main path (steps from color's starting square)
//  51..55   → on home stretch (cells 0-4 of HOME_PATHS[color])
//  56       → WON / finished (HOME_PATHS[color][5] = last colored square adjacent to center)

const POS_YARD = -1;
const POS_WON  = 56;  // last colored home-lane cell (HOME_PATHS[color][5]) — pieces stop here
const HOME_STRETCH_START = 51;  // main path has 51 steps (positions 0-50); home lane is 51-56
const HOME_STRETCH_END   = 56;  // = POS_WON

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a token's position to actual board cell [row, col].
 * Returns null if in yard or won.
 */
function getTokenCell(color, pos) {
  if (pos === POS_YARD) return null;
  // pos >= HOME_STRETCH_START covers the home lane AND POS_WON (all = 51-56).
  // POS_WON (56) maps to HOME_PATHS[color][5] — the last colored square, NOT the center star.
  if (pos >= HOME_STRETCH_START) {
    const homeIdx = pos - HOME_STRETCH_START;
    return HOME_PATHS[color][homeIdx] ?? HOME_PATHS[color][5];
  }
  const startIdx = COLOR_START_INDEX[color];
  const mainIdx  = (startIdx + pos) % MAIN_PATH.length;
  return MAIN_PATH[mainIdx];
}

/**
 * Get the MAIN_PATH index for a token at given position.
 * Returns -1 if not on main path.
 */
function getMainPathIndex(color, pos) {
  if (pos < 0 || pos >= HOME_STRETCH_START) return -1;
  const startIdx = COLOR_START_INDEX[color];
  return (startIdx + pos) % MAIN_PATH.length;
}

/**
 * Check if position is a safe square.
 */
function isSafeSquare(color, pos) {
  if (pos < 0 || pos >= HOME_STRETCH_START) return true; // yard + home stretch always safe
  return SAFE_SQUARES.has(getMainPathIndex(color, pos));
}

/**
 * Calculate new position after rolling dice.
 * Returns null if move is invalid (overshoot).
 */
function calcNewPos(pos, dice) {
  if (pos === POS_YARD) {
    return dice === 6 ? 0 : null; // can only leave yard with 6
  }
  const newPos = pos + dice;
  if (newPos > POS_WON) return null; // overshoot — can't move
  return newPos;
}

/**
 * Get all valid token moves for the current player.
 * Returns array of { tokenIndex, fromPos, toPos }
 */
function getValidMoves(tokens, dice) {
  const moves = [];
  for (let i = 0; i < tokens.length; i++) {
    const from = tokens[i];
    if (from === POS_WON) continue;
    const to = calcNewPos(from, dice);
    if (to !== null) moves.push({ tokenIndex: i, fromPos: from, toPos: to });
  }
  return moves;
}

/**
 * Generate a random 6-character room ID (uppercase alphanumeric).
 */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Generate a unique user ID stored in sessionStorage.
 */
function getOrCreateUid() {
  let uid = sessionStorage.getItem('ludo_uid');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 11);
    sessionStorage.setItem('ludo_uid', uid);
  }
  return uid;
}
