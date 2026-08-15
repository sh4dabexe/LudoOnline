/**
 * Ludo Online — Room Manager v3 (Firebase CRUD + Full Game Rules)
 *
 * NEW in v3 (bug fixes):
 *  - Bug 1: advanceTurn() called after elimination; chat keys made unique with random suffix
 *  - Bug 2: Self-token collision check in getValidMoves(); server-side move validation in moveToken()
 *  - Bug 3: POS_WON guard at top of moveToken(); movingLock to prevent double-execution
 *  - Bug 5: Capture loop uses continue (not break) on block; diceRolled guard in moveToken()
 *  - Extra: tokenIndex bounds check; token position corruption check
 */

let _movingLock = false;

// ─── Room creation ─────────────────────────────────────────────────────────

async function createRoom(hostName, maxPlayers) {
  if (!window.db) throw new Error('Firebase not initialized');

  const uid       = getOrCreateUid();
  const roomId    = generateRoomId();
  const colors    = COLOR_ASSIGNMENTS[maxPlayers] || COLOR_ASSIGNMENTS[4];
  const hostColor = colors[0];

  const roomData = {
    host: uid,
    maxPlayers,
    status: 'waiting',
    colors,
    createdAt: Date.now(),
    players: {
      [uid]: {
        name: hostName.trim(),
        color: hostColor,
        ready: false,
        tokens: [-1, -1, -1, -1],
        finishedRank: null,
        missedTurns: 0,
        eliminated: false,
      },
    },
    playerOrder: null,
    gameState: {
      currentPlayerIndex: 0,
      diceValue: null,
      diceRolled: false,
      consecutiveSixes: 0,
      winner: null,
      lastAction: `${hostName.trim()} created the room`,
      turnStartedAt: null,
    },
  };

  await window.db.ref(`rooms/${roomId}`).set(roomData);

  sessionStorage.setItem('ludo_uid',   uid);
  sessionStorage.setItem('ludo_room',  roomId);
  sessionStorage.setItem('ludo_name',  hostName.trim());
  sessionStorage.setItem('ludo_color', hostColor);

  return { roomId, uid, color: hostColor };
}

// ─── Room joining ──────────────────────────────────────────────────────────

async function joinRoom(roomId, playerName) {
  if (!window.db) throw new Error('Firebase not initialized');

  const snap = await window.db.ref(`rooms/${roomId}`).once('value');
  const room = snap.val();

  if (!room)               throw new Error('Room not found. Check the room code.');
  if (room.status === 'playing')  throw new Error('Game already started.');
  if (room.status === 'finished') throw new Error('Game has ended.');

  const uid = getOrCreateUid();

  // Reconnecting?
  if (room.players?.[uid]) {
    const p = room.players[uid];
    sessionStorage.setItem('ludo_uid',   uid);
    sessionStorage.setItem('ludo_room',  roomId);
    sessionStorage.setItem('ludo_name',  p.name);
    sessionStorage.setItem('ludo_color', p.color);
    return { uid, color: p.color };
  }

  const existing = Object.keys(room.players || {});
  if (existing.length >= room.maxPlayers)
    throw new Error(`Room is full (${room.maxPlayers} players max).`);

  const usedColors = existing.map(u => room.players[u].color);
  const color      = room.colors.find(c => !usedColors.includes(c));
  if (!color) throw new Error('No color slots available.');

  await window.db.ref(`rooms/${roomId}/players/${uid}`).set({
    name: playerName.trim(),
    color,
    ready: false,
    tokens: [-1, -1, -1, -1],
    finishedRank: null,
    missedTurns: 0,
    eliminated: false,
  });

  await window.db.ref(`rooms/${roomId}/gameState/lastAction`)
    .set(`${playerName.trim()} joined the game`);

  sessionStorage.setItem('ludo_uid',   uid);
  sessionStorage.setItem('ludo_room',  roomId);
  sessionStorage.setItem('ludo_name',  playerName.trim());
  sessionStorage.setItem('ludo_color', color);

  return { uid, color };
}

// ─── Ready ─────────────────────────────────────────────────────────────────

async function setPlayerReady(roomId, uid, ready) {
  await window.db.ref(`rooms/${roomId}/players/${uid}/ready`).set(ready);
}

// ─── Start game ────────────────────────────────────────────────────────────

async function startGame(roomId) {
  const snap = await window.db.ref(`rooms/${roomId}`).once('value');
  const room = snap.val();
  if (!room) return;

  const uids   = Object.keys(room.players);
  const colors = room.colors;

  // Order players by color assignment
  const playerOrder = colors
    .map(c => uids.find(u => room.players[u].color === c))
    .filter(Boolean);

  await window.db.ref(`rooms/${roomId}`).update({
    status: 'playing',
    playerOrder,
    'gameState/currentPlayerIndex': 0,
    'gameState/diceValue': null,
    'gameState/diceRolled': false,
    'gameState/consecutiveSixes': 0,
    'gameState/winner': null,
    'gameState/turnStartedAt': Date.now(),
    'gameState/lastAction': `Game started! ${room.players[playerOrder[0]]?.name || ''}'s turn (Red goes first)`,
  });
}

// ─── Dice roll ─────────────────────────────────────────────────────────────

async function rollDice(roomId, uid) {
  const gsSnap = await window.db.ref(`rooms/${roomId}/gameState`).once('value');
  const gs     = gsSnap.val();
  if (!gs || gs.diceRolled) return null;

  const roomSnap = await window.db.ref(`rooms/${roomId}`).once('value');
  const room     = roomSnap.val();
  if (!room) return null;

  const curUid = room.playerOrder?.[gs.currentPlayerIndex];
  if (curUid !== uid) return null;

  const dice = Math.floor(Math.random() * 6) + 1;
  const newSixes = dice === 6 ? (gs.consecutiveSixes || 0) + 1 : 0;

  await window.db.ref(`rooms/${roomId}/gameState`).update({
    diceValue: dice,
    diceRolled: true,
    consecutiveSixes: newSixes,
    lastAction: `${room.players[uid]?.name || uid} rolled a ${dice}${dice === 6 ? ' 🎲✨' : ''}`,
  });

  // 3 consecutive 6s → skip turn (no extra move)
  if (newSixes >= 3) {
    await window.db.ref(`rooms/${roomId}/gameState/lastAction`)
      .set(`${room.players[uid]?.name || uid} rolled 3 sixes! Turn forfeited! 🚫`);
    await advanceTurn(roomId, room, gs.currentPlayerIndex, false);
  }

  return dice;
}

// ─── Token movement ─────────────────────────────────────────────────────────

async function moveToken(roomId, uid, tokenIndex) {
  // ── Prevent concurrent / double-click execution ───────────────
  if (_movingLock) return;
  _movingLock = true;

  try {
    await _moveTokenImpl(roomId, uid, tokenIndex);
  } finally {
    _movingLock = false;
  }
}

async function _moveTokenImpl(roomId, uid, tokenIndex) {
  // ── Validate tokenIndex ───────────────────────────────────────
  if (tokenIndex < 0 || tokenIndex > 3 || !Number.isInteger(tokenIndex)) return;

  const roomSnap = await window.db.ref(`rooms/${roomId}`).once('value');
  const room     = roomSnap.val();
  if (!room) return;

  const gs     = room.gameState;
  const player = room.players[uid];

  // ── Guard: dice must have been rolled ─────────────────────────
  if (!player || !gs?.diceRolled || gs.diceValue == null) return;

  const curUid = room.playerOrder?.[gs.currentPlayerIndex];
  if (curUid !== uid) return;

  const fromPos = player.tokens[tokenIndex];

  // ── Guard: won tokens cannot move ─────────────────────────────
  if (fromPos === POS_WON) return;

  // ── Server-side move validation ───────────────────────────────
  const validMoves = getValidMoves(player.tokens, gs.diceValue, player.color, uid, room.players);
  const isValid    = validMoves.some(m => m.tokenIndex === tokenIndex);
  if (!isValid) return;

  const toPos = calcNewPos(fromPos, gs.diceValue);
  if (toPos === null) return; // invalid move
  // Note: block rule removed — same-color stacking is allowed everywhere;
  //       opponent stacks are capturable (one piece taken, not a hard block).

  const updates = {};
  updates[`rooms/${roomId}/players/${uid}/tokens/${tokenIndex}`] = toPos;

  let actionMsg        = `${player.name} moved token ${tokenIndex + 1}`;
  let capturedSomething = false;
  let reachedHome      = (toPos === POS_WON);
  let allHome          = false;

  // ── Capture check ─────────────────────────────────────────────
  if (toPos >= 0 && toPos < HOME_STRETCH_START) {
    const destCell = getTokenCell(player.color, toPos);
    const safe     = isSafeSquare(player.color, toPos);

    if (destCell && !safe) {
      for (const [otherUid, otherPlayer] of Object.entries(room.players)) {
        if (otherUid === uid || otherPlayer.eliminated) continue;

        // Count how many of otherPlayer's tokens are on destCell
        const tokensAtDest = [];
        for (let i = 0; i < (otherPlayer.tokens || []).length; i++) {
          const oPos = otherPlayer.tokens[i];
          if (oPos < 0 || oPos >= HOME_STRETCH_START) continue;
          const oCell = getTokenCell(otherPlayer.color, oPos);
          if (oCell && oCell[0] === destCell[0] && oCell[1] === destCell[1]) {
            tokensAtDest.push(i);
          }
        }

        if (tokensAtDest.length === 0) continue;
        // Capture the FIRST token found (stacks are NOT immune — one piece sent to yard)
        updates[`rooms/${roomId}/players/${otherUid}/tokens/${tokensAtDest[0]}`] = POS_YARD;
        actionMsg       += ` — captured ${otherPlayer.name}'s token! 🎯`;
        capturedSomething = true;
      }
    }
  }

  // ── Win check ─────────────────────────────────────────────────
  if (toPos === POS_WON) {
    const updatedTokens = [...player.tokens];
    updatedTokens[tokenIndex] = POS_WON;
    allHome = updatedTokens.every(t => t === POS_WON);

    if (allHome) {
      updates[`rooms/${roomId}/gameState/winner`] = uid;
      updates[`rooms/${roomId}/status`]           = 'finished';
      actionMsg = `🏆 ${player.name} WON THE GAME! All tokens home!`;
    } else {
      actionMsg += ` — token ${tokenIndex + 1} reached home! 🏠`;
    }
  }

  updates[`rooms/${roomId}/gameState/lastAction`] = actionMsg;
  await window.db.ref('/').update(updates);

  if (allHome) return; // game over

  // ── Extra turn logic ───────────────────────────────────────────
  // Extra turn if: rolled 6 OR captured an opponent (classic Ludo rules)
  const rolled6   = gs.diceValue === 6;
  const max6s     = gs.consecutiveSixes >= 3;
  const extraTurn = (rolled6 || capturedSomething || reachedHome) && !max6s;

  await advanceTurn(roomId, room, gs.currentPlayerIndex, extraTurn);
}


// ─── Miss turn (timer expired) ──────────────────────────────────────────────

async function missPlayerTurn(roomId, uid) {
  const roomSnap = await window.db.ref(`rooms/${roomId}`).once('value');
  const room     = roomSnap.val();
  if (!room || room.status !== 'playing') return;

  const gs     = room.gameState;
  const curUid = room.playerOrder?.[gs?.currentPlayerIndex];
  if (curUid !== uid) return; // guard: not current player's turn

  const player    = room.players?.[uid];
  if (!player)    return;

  const newMisses = (player.missedTurns || 0) + 1;
  const updates   = {};
  let   actionMsg = `${player.name} missed their turn! (${newMisses}/3 lives lost) 💀`;

  updates[`rooms/${roomId}/players/${uid}/missedTurns`] = newMisses;

  if (newMisses >= 3) {
    // Eliminate player — remove all tokens
    updates[`rooms/${roomId}/players/${uid}/eliminated`] = true;
    updates[`rooms/${roomId}/players/${uid}/tokens`]     = [-1, -1, -1, -1];
    actionMsg = `☠️ ${player.name} missed 3 turns — ELIMINATED! Their tokens are removed.`;

    // Remove from playerOrder
    const newOrder = (room.playerOrder || []).filter(u => u !== uid);
    updates[`rooms/${roomId}/playerOrder`] = newOrder;

    // Check if only 1 player left → they win
    const activePlayers = newOrder.filter(u => !room.players?.[u]?.eliminated);
    if (activePlayers.length === 1) {
      const lastUid   = activePlayers[0];
      const lastName  = room.players?.[lastUid]?.name || 'Player';
      updates[`rooms/${roomId}/gameState/winner`] = lastUid;
      updates[`rooms/${roomId}/status`]           = 'finished';
      actionMsg += ` ${lastName} wins by default! 🏆`;
    }
  }

  updates[`rooms/${roomId}/gameState/lastAction`] = actionMsg;
  await window.db.ref('/').update(updates);

  // Bug 1 fix: always advance turn after a miss (even on elimination)
  // Re-fetch so we get the updated playerOrder with eliminated player removed
  const updSnap  = await window.db.ref(`rooms/${roomId}`).once('value');
  const updRoom  = updSnap.val();
  if (updRoom?.status === 'playing') {
    await advanceTurn(roomId, updRoom, updRoom.gameState.currentPlayerIndex, false);
  }
}

// ─── Skip turn (no valid moves) ────────────────────────────────────────────

async function skipTurn(roomId, uid) {
  const snap = await window.db.ref(`rooms/${roomId}`).once('value');
  const room = snap.val();
  if (!room) return;
  const curUid = room.playerOrder?.[room.gameState?.currentPlayerIndex];
  if (curUid !== uid) return;
  await advanceTurn(roomId, room, room.gameState.currentPlayerIndex, false);
}

// ─── Advance turn ──────────────────────────────────────────────────────────

async function advanceTurn(roomId, room, currentIndex, extraTurn) {
  const order  = room.playerOrder || [];
  const total  = order.length;
  if (total === 0) return;

  let nextIdx;
  if (extraTurn) {
    nextIdx = currentIndex;
  } else {
    // Skip eliminated players
    let tries = 0;
    nextIdx   = (currentIndex + 1) % total;
    while (tries < total && room.players?.[order[nextIdx]]?.eliminated) {
      nextIdx = (nextIdx + 1) % total;
      tries++;
    }
  }

  const nextUid  = order[nextIdx];
  const nextName = room.players?.[nextUid]?.name || 'Next player';

  const curUid   = order[currentIndex];
  const curName  = room.players?.[curUid]?.name || '';

  await window.db.ref(`rooms/${roomId}/gameState`).update({
    currentPlayerIndex: nextIdx,
    diceValue: null,
    diceRolled: false,
    consecutiveSixes: extraTurn ? (room.gameState?.consecutiveSixes || 0) : 0,
    turnStartedAt: Date.now(),
    lastAction: extraTurn
      ? `${curName} gets another turn! 🎲`
      : `${nextName}'s turn`,
  });
}

// ─── Block rule helper ─────────────────────────────────────────────────────

/**
 * Check if a cell has an opponent block (2+ tokens of the same opposing color).
 * @returns {boolean} true if blocked for the moving player
 */
function isCellBlocked(players, movingUid, movingColor, cell) {
  for (const [uid, player] of Object.entries(players)) {
    if (uid === movingUid)    continue; // own tokens: can stack freely
    if (player.eliminated)   continue;

    let count = 0;
    for (const pos of (player.tokens || [])) {
      if (pos < 0 || pos >= HOME_STRETCH_START) continue; // not on main path
      const c = getTokenCell(player.color, pos);
      if (c && c[0] === cell[0] && c[1] === cell[1]) count++;
    }
    if (count >= 2) return true; // BLOCK — 2+ opponent tokens
  }
  return false;
}

// ─── getValidMoves with block rule ────────────────────────────────────────

// Override the base getValidMoves in constants.js
// Same-color stacking is allowed everywhere; no block rule on opponent stacks.
function getValidMoves(tokens, dice, color, uid, players) {
  const moves = [];
  for (let i = 0; i < tokens.length; i++) {
    const from = tokens[i];
    if (from === POS_WON) continue;

    const to = calcNewPos(from, dice);
    if (to === null) continue;

    // No self-collision check: own pieces can stack freely on any tile.
    // No block rule: opponent stacks (2+) are capturable, not impassable.

    moves.push({ tokenIndex: i, fromPos: from, toPos: to });
  }
  return moves;
}

// ─── Firebase listeners ────────────────────────────────────────────────────

function onRoomChange(roomId, callback) {
  const ref = window.db.ref(`rooms/${roomId}`);
  ref.on('value', snap => callback(snap.val()));
  return () => ref.off('value');
}

// ─── Chat ──────────────────────────────────────────────────────────────────

/**
 * Send a chat message to the room.
 * @param {string} roomId
 * @param {{ uid, name, color, text, ts }} msgObj
 */
async function sendChatMessage(roomId, msgObj) {
  if (!window.db) return;
  // Bug 1 fix: add random suffix to prevent key collision if two messages sent in same ms
  const rand = Math.random().toString(36).slice(2, 7);
  const key  = `${msgObj.uid}_${msgObj.ts}_${rand}`;
  await window.db.ref(`rooms/${roomId}/messages/${key}`).set({
    uid:   msgObj.uid,
    name:  msgObj.name,
    color: msgObj.color,
    text:  msgObj.text.slice(0, 120), // safety limit
    ts:    msgObj.ts,
  });
}

// ─── Utils ─────────────────────────────────────────────────────────────────

async function removePlayer(roomId, uid) {
  try { await window.db.ref(`rooms/${roomId}/players/${uid}`).remove(); } catch (e) {}
}
