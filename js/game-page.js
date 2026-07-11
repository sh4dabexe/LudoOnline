/**
 * Ludo Online — Game Page (v3)
 *
 * Changes vs v2:
 *  - Sound effects (SFX.*) throughout
 *  - Big dice face (Unicode ⚀-⚅) with reveal animation
 *  - Timer bar (fills/depletes with colour change)
 *  - Tick sounds in last 8s, urgent in last 3s
 *  - Canvas shake on dice roll, flash on capture
 *  - Sparkle effect on token move
 *  - Confetti rain on win
 *  - Firebase-backed chat with emoji bar
 *  - Game log removed
 */

// ─── State ─────────────────────────────────────────────────────────────────

let roomId      = null;
let myUid       = null;
let myColor     = null;
let myName      = null;
let roomData    = null;
let unsubRoom   = null;
let unsubChat   = null;

// Canvas
let canvas   = null;
let ctx      = null;
let cellSize = 40;

// Game UI
let pendingMoves  = [];
let selectedToken = null;
let isMoving      = false; // Bug 3: lock to prevent double-click moves

// Timer
let turnTimerInterval  = null;
let timerSecondsLeft   = 25;
let timerPhase         = 'idle'; // 'idle' | 'rolling' | 'moving'
const TIMER_TOTAL      = 25;
const TIMER_PICK       = 15;    // seconds to pick a token after rolling

// Observer watchdog — fires missPlayerTurn() when the current player goes offline
// Covers the full roll-phase + pick-phase window plus a 3s safety buffer
let watchdogTimer = null;
const WATCHDOG_MS  = (TIMER_TOTAL + TIMER_PICK + 3) * 1000; // 43 s

// Track previous Firebase state to detect transitions
let lastPlayerIndex    = -1;
let lastSeenDiceRolled = false; // previous value of gs.diceRolled

// Track previous token positions for animation detection
let prevTokenPositions = {}; // "uid_i" -> pos

// Chat
const CHAT_MAX_SHOWN = 40;

// ─── Dice faces (Unicode) ──────────────────────────────────────────────────

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ─── Init ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  roomId  = params.get('room');
  myUid   = sessionStorage.getItem('ludo_uid');
  myColor = sessionStorage.getItem('ludo_color');
  myName  = sessionStorage.getItem('ludo_name');

  if (!roomId || !myUid) {
    showError('Missing room or player info. <a href="index.html">Go back home</a>');
    return;
  }

  document.getElementById('roomCodeDisplay').textContent = roomId;

  // Canvas
  canvas = document.getElementById('gameBoard');
  ctx    = canvas.getContext('2d');

  // Dice overlay click to roll
  document.getElementById('diceOverlay')?.addEventListener('click', handleRollClick);

  // Mobile chat sheet open / close
  document.getElementById('chatToggleBtn')?.addEventListener('click', openChatSheet);
  document.getElementById('closeChatBtn')?.addEventListener('click', closeChatSheet);
  document.getElementById('chatOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeChatSheet();
  });

  // Delay resize to let flex layout compute
  setTimeout(() => { resizeCanvas(); window.addEventListener('resize', resizeCanvas); }, 80);

  // Share link buttons
  document.getElementById('copyLinkBtn').addEventListener('click', copyShareLink);
  document.getElementById('shareCopyBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('shareLink');
    if (inp) { inp.select(); navigator.clipboard.writeText(inp.value); }
    const btn = document.getElementById('shareCopyBtn');
    if (btn) { btn.textContent = '\u2713 Copied!'; setTimeout(() => btn.textContent = '\uD83D\uDCCB Copy', 2000); }
  });

  if (window.FIREBASE_NOT_CONFIGURED) {
    showError('Firebase not configured. Update <code>js/firebase-config.js</code>.');
    return;
  }
  if (!window.FIREBASE_READY) {
    showError('Firebase initialization failed. Check console.');
    return;
  }

  // Buttons
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('mousemove', handleCanvasHover);

  // Chat
  initChat();

  // Firebase room listener
  unsubRoom = onRoomChange(roomId, handleRoomUpdate);

  window.addEventListener('beforeunload', () => {
    stopTimer();
    clearWatchdog();
    if (unsubRoom) unsubRoom();
    if (unsubChat) unsubChat();
  });
});

// ─── Mobile chat sheet open/close ─────────────────────────────────────

function openChatSheet() {
  const overlay = document.getElementById('chatOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  // Scroll to bottom when opening
  const msgs = document.getElementById('chatMessagesSheet');
  if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);
}

function closeChatSheet() {
  const overlay = document.getElementById('chatOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

// ─── Canvas sizing ──────────────────────────────────────────────────────────

function resizeCanvas() {
  const boardWrap = document.getElementById('boardArea');
  const boardCol  = document.querySelector('.board-col');
  const colW = boardCol ? boardCol.clientWidth  - 16 : window.innerWidth  - 16;
  const colH = boardCol ? boardCol.clientHeight - 40 : window.innerHeight - 140;

  const maxSide = Math.min(colW, colH, 620);
  const size    = Math.max(Math.floor(maxSide / 15) * 15, 270);

  canvas.width  = size;
  canvas.height = size;
  cellSize      = size / 15;

  // Sync corner-names row width to canvas size
  document.querySelectorAll('.corner-names').forEach(el => {
    el.style.maxWidth = size + 'px';
  });

  if (roomData) renderBoard();
}

// ─── Dice colour tracks current player ──────────────────────────────────────

function updateDiceColor(color) {
  const cfg = COLOR_CONFIG[color];
  if (!cfg) return;
  document.documentElement.style.setProperty('--cur-color', cfg.bg);
  document.documentElement.style.setProperty('--cur-glow', cfg.glow || 'rgba(99,102,241,0.5)');
}

// ─── Firebase room update ───────────────────────────────────────────────────

function handleRoomUpdate(room) {
  if (!room) { showError('Room not found or deleted.'); return; }

  if (room.players?.[myUid]?.color) {
    myColor = room.players[myUid].color;
    sessionStorage.setItem('ludo_color', myColor);
  }

  const prev = roomData;
  roomData   = room;

  if (cellSize <= 0) resizeCanvas();

  renderPlayerList(room);
  updateCornerNames(room);
  detectAndAnimateMoves(prev, room);

  if (room.status === 'waiting') {
    renderLobby(room);
  } else if (room.status === 'playing' || room.status === 'finished') {
    hideLobby();
    renderGame(room);
    if (room.status === 'finished') renderWinner(room);
  }
}

// ─── Move animation detection ───────────────────────────────────────────────

// boardRef passed to animateTokenPath / animateCaptureToYard
const boardRef = { renderBoard: (opts) => renderBoard(opts) };

function detectAndAnimateMoves(prev, room) {
  if (!prev?.players || !room?.players) return;

  for (const [uid, player] of Object.entries(room.players)) {
    const prevPlayer = prev.players[uid];
    if (!player?.tokens || !prevPlayer?.tokens) continue;

    for (let i = 0; i < player.tokens.length; i++) {
      const was = prevPlayer.tokens[i];
      const now = player.tokens[i];
      if (was === now) continue;

      // ── Piece captured — slide it back to yard (all players see this) ──
      if (now === POS_YARD && was >= 0) {
        SFX.capture();
        canvas.classList.add('capture-flash');
        setTimeout(() => canvas.classList.remove('capture-flash'), 450);

        animateCaptureToYard(
          ctx, cellSize, boardRef,
          player.color, uid, i, was,
          () => { /* board will settle from Firebase state */ }
        );
        continue;
      }

      // ── My own piece — already animated by executeMoveToken, skip ──
      if (uid === myUid) {
        if (now === POS_WON) SFX.home();
        continue;
      }

      // ── Other player's forward move — animate cell-by-cell for everyone ──
      const animColor    = player.color;
      const animUid      = uid;
      const animTokenIdx = i;
      const animFrom     = was;
      const animTo       = now;

      animateTokenPath(
        ctx, cellSize, boardRef, null,
        animColor, animUid, animTokenIdx,
        animFrom, animTo,
        () => {
          // Sparkle at destination after animation completes
          const destCell = getTokenCell(animColor, animTo);
          if (destCell && animTo !== POS_YARD) {
            const boardRect = canvas.getBoundingClientRect();
            const containerRect = document.getElementById('boardContainer').getBoundingClientRect();
            const offsetX = boardRect.left - containerRect.left;
            const offsetY = boardRect.top  - containerRect.top;
            const px = offsetX + (destCell[1] + 0.5) * cellSize * (boardRect.width / canvas.width);
            const py = offsetY + (destCell[0] + 0.5) * cellSize * (boardRect.height / canvas.height);
            spawnSparkle(px, py, COLOR_CONFIG[animColor]?.bg || '#fff');
          }
          if (animTo === POS_WON) SFX.home();
          else SFX.move();
        }
      );
    }
  }
}

// ─── Sparkle effect ─────────────────────────────────────────────────────────

function spawnSparkle(x, y, color) {
  const overlay = document.getElementById('sparkleOverlay');
  if (!overlay) return;

  for (let k = 0; k < 6; k++) {
    const s  = document.createElement('div');
    s.className = 'sparkle';
    const size = 8 + Math.random() * 10;
    const dx   = (Math.random() - 0.5) * 30;
    const dy   = (Math.random() - 0.5) * 30;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      left:${x + dx}px; top:${y + dy}px;
      background:${color};
      opacity:0.9;
      animation-duration:${0.4 + Math.random() * 0.25}s;
      animation-delay:${k * 0.04}s;
    `;
    overlay.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

// ─── Board render ───────────────────────────────────────────────────────────

function renderBoard(opts = {}) {
  if (!ctx || !roomData || cellSize <= 0) return;

  drawLudoBoard(ctx, cellSize);

  if (roomData.status === 'playing' && pendingMoves.length > 0) {
    drawValidMoveCells(ctx, cellSize, myColor, pendingMoves);
  }

  const validKeys = pendingMoves.map(m => `${myUid}_${m.tokenIndex}`);
  const selKey    = selectedToken ? `${myUid}_${selectedToken.tokenIndex}` : null;
  const hideKey   = opts.hideTokenKey || null;
  drawTokens(ctx, cellSize, roomData.players, myUid, validKeys, selKey, hideKey);

  // Draw the in-flight animated token on top (during move animation).
  if (opts && opts.movingToken) {
    drawMovingToken(ctx, cellSize, opts.movingToken.color, opts.movingToken.x, opts.movingToken.y, opts.movingToken.lift);
  }
}

// ─── Lobby ──────────────────────────────────────────────────────────────────

function renderLobby(room) {
  stopTimer();
  const overlay = document.getElementById('lobbyOverlay');
  if (overlay) overlay.classList.remove('hidden');

  if (cellSize > 0) renderBoard();
  else setTimeout(() => { resizeCanvas(); renderBoard(); }, 200);

  const slots  = document.getElementById('lobbySlots');
  const colors = room.colors || COLOR_ASSIGNMENTS[room.maxPlayers] || [];
  if (slots) {
    slots.innerHTML = '';
    for (const color of colors) {
      const player = Object.values(room.players || {}).find(p => p.color === color);
      const div    = document.createElement('div');
      div.className = 'lobby-slot' + (player ? ' filled' : '');
      const cfg = COLOR_CONFIG[color];
      div.innerHTML = player
        ? `<div class="slot-dot" style="background:${cfg.bg}"></div>
           <span class="slot-name">${escHtml(player.name)}</span>
           <span class="slot-ready ${player.ready ? 'ready-yes' : 'ready-no'}">${player.ready ? '✓ Ready' : 'Not ready'}</span>`
        : `<div class="slot-dot empty" style="border:2px solid ${cfg.bg}"></div>
           <span class="slot-name empty">Waiting…</span>
           <span class="slot-color-label" style="color:${cfg.bg}">${color.toUpperCase()}</span>`;
      slots.appendChild(div);
    }
  }

  const myPlayer = room.players?.[myUid];
  const isReady  = myPlayer?.ready || false;
  const readyBtn = document.getElementById('readyBtn');
  if (readyBtn) {
    readyBtn.textContent = isReady ? '✓ Ready!' : 'Ready Up';
    readyBtn.className   = isReady ? 'btn-ready active' : 'btn-ready';
    readyBtn.onclick     = () => setPlayerReady(roomId, myUid, !isReady);
  }

  const players  = Object.values(room.players || {});
  const allReady = players.length >= 2 && players.every(p => p.ready);
  const isHost   = room.host === myUid;
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.style.display = isHost ? '' : 'none';
    startBtn.disabled      = !allReady;
    startBtn.textContent   = allReady
      ? '🚀 Start Game'
      : `Waiting (${players.filter(p => p.ready).length}/${players.length} ready)`;
    startBtn.onclick = () => startGame(roomId);
  }

  const shareInput = document.getElementById('shareLink');
  if (shareInput) shareInput.value = buildShareLink();
}

function hideLobby() {
  const overlay = document.getElementById('lobbyOverlay');
  if (overlay) overlay.classList.add('hidden');
}

// ─── Game render ─────────────────────────────────────────────────────────────

function renderGame(room) {
  const gs = room.gameState;
  if (!gs) return;
  renderBoard();
  renderDice(gs.diceValue, gs.diceRolled);

  // Update dice colour to current player's colour
  const curUid = room.playerOrder?.[gs.currentPlayerIndex];
  const curColor = room.players?.[curUid]?.color;
  if (curColor) updateDiceColor(curColor);

  // Update corner player names + active highlights
  updateCornerNames(room);

  checkMyTurn(room);
}

// ─── Dice display ────────────────────────────────────────────────────────────

function renderDice(value, rolled) {
  const faceEl = document.getElementById('diceResult');
  if (!faceEl) return;
  // data-value drives CSS pip visibility:
  // 0 = idle (shows "?"), 1-6 = shows correct pips
  faceEl.setAttribute('data-value', (rolled && value >= 1 && value <= 6) ? value : 0);
}

// ─── Turn management ─────────────────────────────────────────────────────────

function checkMyTurn(room) {
  const gs = room.gameState;
  if (!gs || !room.playerOrder || room.status !== 'playing') return;

  const curUid     = room.playerOrder[gs.currentPlayerIndex];
  const isMyTurn   = (curUid === myUid);
  const diceRolled = gs.diceRolled;
  const curIndex   = gs.currentPlayerIndex;

  // ── Detect Firebase state transitions ──────────────────────────
  const turnChanged    = curIndex !== lastPlayerIndex;
  const diceJustRolled = !lastSeenDiceRolled && diceRolled;  // false → true
  const diceWasReset   = lastSeenDiceRolled && !diceRolled;  // true → false (extra turn)

  // Persist tracking — must happen BEFORE any early returns
  lastPlayerIndex    = curIndex;
  lastSeenDiceRolled = diceRolled;

  // ── Timer resets based on detected transitions ──────────────────
  if (turnChanged) {
    // New player's turn → fresh 25 s rolling timer
    stopTimer();
    clearWatchdog(); // I may have been watching someone else — cancel that now
    timerSecondsLeft = TIMER_TOTAL;
    timerPhase       = 'idle';
    if (isMyTurn) SFX.yourTurn();

  } else if (diceWasReset) {
    // Same player's extra turn (rolled 6 / captured / reached home)
    // dice went true→false → give them fresh 25 s to roll again
    stopTimer();
    timerSecondsLeft = TIMER_TOTAL;
    timerPhase       = 'idle';

  } else if (diceJustRolled && isMyTurn) {
    // Dice just landed → switch to pick-token phase (15 s)
    // Only start if handleRollClick hasn't already started it
    if (!turnTimerInterval) {
      timerPhase       = 'moving';
      timerSecondsLeft = TIMER_PICK;
      startTimer();
    }
  }

  // ── UI updates ─────────────────────────────────────────────────
  updateRollBtn(isMyTurn, diceRolled);
  updateTurnMessage(room, isMyTurn, diceRolled, curUid);

  if (isMyTurn && diceRolled && gs.diceValue) {
    const myTokens = room.players?.[myUid]?.tokens || [-1, -1, -1, -1];
    pendingMoves   = getValidMoves(myTokens, gs.diceValue, myColor, myUid, room.players);

    if (pendingMoves.length === 0) {
      // No valid moves → auto-skip after short pause
      stopTimer();
      setTimeout(() => {
        if (roomData?.gameState?.diceRolled &&
            roomData?.playerOrder?.[roomData?.gameState?.currentPlayerIndex] === myUid) {
          skipTurn(roomId, myUid);
        }
      }, 1500);
    }
    // Timer for token-pick already handled in diceJustRolled block above

  } else if (isMyTurn && !diceRolled) {
    // My turn, waiting to roll → start rolling timer if not already running
    pendingMoves  = [];
    selectedToken = null;
    if (!turnTimerInterval) {
      timerPhase = 'rolling';
      // timerSecondsLeft already set to TIMER_TOTAL by the reset above
      startTimer();
    }

  } else {
    // Not my turn — run a watchdog so an offline current player's turn auto-expires
    pendingMoves  = [];
    selectedToken = null;
    stopTimer();
    startWatchdog(curUid, curIndex, gs.turnStartedAt);
  }

  renderBoard();
}

function updateRollBtn(isMyTurn, diceRolled) {
  const overlay = document.getElementById('diceOverlay');
  if (!overlay) return;

  if (isMyTurn && !diceRolled) {
    overlay.classList.add('pulse');
    overlay.classList.remove('disabled');
    overlay.style.pointerEvents = 'auto';
    overlay.style.cursor = 'pointer';
  } else {
    overlay.classList.remove('pulse');
    overlay.classList.toggle('disabled', !isMyTurn);
    overlay.style.pointerEvents = (isMyTurn && !diceRolled) ? 'auto' : 'none';
    overlay.style.cursor = 'default';
  }
}

function updateTurnMessage(room, isMyTurn, diceRolled, curUid) {
  const el = document.getElementById('turnMessage');
  if (!el) return;
  if (room.status === 'finished') { el.textContent = 'Game over!'; return; }

  if (isMyTurn) {
    if (!diceRolled)          el.textContent = '🎲 Your turn — roll!';
    else if (!pendingMoves.length) el.textContent = '⏭ No valid moves…';
    else                      el.textContent = '👆 Click a token to move';
  } else {
    const p = room.players?.[curUid];
    const cfg = COLOR_CONFIG[p?.color];
    el.innerHTML = p
      ? `⏳ <span style="color:${cfg?.bg}">${escHtml(p.name)}</span>'s turn`
      : 'Waiting…';
  }
}

// ─── Timer ───────────────────────────────────────────────────────────────────

function startTimer() {
  stopTimer();
  showTimerWrap(true);
  updateTimerDisplay();

  turnTimerInterval = setInterval(() => {
    timerSecondsLeft = Math.max(0, timerSecondsLeft - 1);
    updateTimerDisplay();

    // Sound effects
    if (timerSecondsLeft <= 3 && timerSecondsLeft > 0) SFX.urgent();
    else if (timerSecondsLeft <= 8 && timerSecondsLeft > 0) SFX.tick();

    if (timerSecondsLeft <= 0) {
      stopTimer();
      handleTimerExpired();
    }
  }, 1000);
}

function stopTimer() {
  if (turnTimerInterval) { clearInterval(turnTimerInterval); turnTimerInterval = null; }
  timerPhase = 'idle';
  showTimerWrap(false);
}

function showTimerWrap(show) {
  const wrap = document.getElementById('timerWrap');
  if (!wrap) return;
  if (show) wrap.classList.remove('hidden');
  else      wrap.classList.add('hidden');
}

function updateTimerDisplay() {
  const fill    = document.getElementById('timerFill');
  const countEl = document.getElementById('timerDisplay');
  if (!fill || !countEl) return;

  const total   = timerPhase === 'rolling' ? TIMER_TOTAL : 15;
  const pct     = Math.max(0, (timerSecondsLeft / total) * 100);
  const isUrgent = timerSecondsLeft <= 3;
  const isWarn   = timerSecondsLeft <= 8 && !isUrgent;

  fill.style.width = pct + '%';
  fill.className = `timer-fill${isUrgent ? ' urgent' : isWarn ? ' warn' : ''}`;

  countEl.textContent = `⏱ ${timerSecondsLeft}s`;
  countEl.className   = `timer-count${isUrgent ? ' urgent' : isWarn ? ' warn' : ''}`;
}

async function handleTimerExpired() {
  const gs  = roomData?.gameState;
  const cur = roomData?.playerOrder?.[gs?.currentPlayerIndex];
  if (cur !== myUid) return;
  await missPlayerTurn(roomId, myUid);
}

// ─── Observer watchdog ────────────────────────────────────────────────────────
// When it's NOT my turn, every online player monitors the current player's
// turnStartedAt. If the current player closes their browser and their client
// timer stops, the watchdog detects the expired turn and advances it.

function clearWatchdog() {
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
}

function startWatchdog(targetUid, targetIndex, turnStartedAt) {
  clearWatchdog();
  if (!targetUid || !turnStartedAt || !roomId) return;

  const elapsed   = Date.now() - turnStartedAt;
  const remaining = WATCHDOG_MS - elapsed;

  if (remaining <= 0) {
    // Turn already overdue — fire immediately (handles page-load after a stale state)
    fireWatchdog(targetUid, targetIndex);
    return;
  }

  watchdogTimer = setTimeout(() => fireWatchdog(targetUid, targetIndex), remaining);
}

async function fireWatchdog(expectedUid, expectedIndex) {
  watchdogTimer = null;
  // Re-validate against local roomData before writing to Firebase
  // If the turn already advanced (Firebase updated us), bail out silently
  const gs     = roomData?.gameState;
  const curUid = roomData?.playerOrder?.[gs?.currentPlayerIndex];
  if (!gs || roomData?.status !== 'playing') return;
  if (curUid !== expectedUid)                return; // turn already moved on
  if (gs.currentPlayerIndex !== expectedIndex) return; // safety check

  // missPlayerTurn() re-reads Firebase before acting, so even if two observers
  // race here, the second one will see curUid !== uid and return harmlessly.
  await missPlayerTurn(roomId, expectedUid);
}


// ─── Dice roll ────────────────────────────────────────────────────────────────

async function handleRollClick() {
  const gs  = roomData?.gameState;
  const cur = roomData?.playerOrder?.[gs?.currentPlayerIndex];
  if (cur !== myUid || gs?.diceRolled) return;

  // Disable overlay while rolling
  const overlay = document.getElementById('diceOverlay');
  if (overlay) {
    overlay.style.pointerEvents = 'none';
    overlay.classList.remove('pulse');
    overlay.classList.add('rolling');
  }

  // Stop the rolling-phase countdown — player acted in time
  stopTimer();

  // Board shake + smooth roll sound
  canvas.classList.add('shake');
  setTimeout(() => canvas.classList.remove('shake'), 380);
  SFX.roll();

  await animateDiceVisual();

  SFX.land();

  // Remove rolling class + trigger pop-reveal
  if (overlay) {
    overlay.classList.remove('rolling');
    overlay.classList.add('revealed');
    setTimeout(() => overlay.classList.remove('revealed'), 320);
  }

  // Pre-set pick-phase state so checkMyTurn sees it on Firebase callback
  timerPhase       = 'moving';
  timerSecondsLeft = TIMER_PICK;

  await rollDice(roomId, myUid);
  // checkMyTurn will be called by Firebase update → diceJustRolled=true
}

function animateDiceVisual() {
  return new Promise(resolve => {
    const faceEl = document.getElementById('diceResult');
    let n = 0;
    const iv = setInterval(() => {
      const rnd = Math.floor(Math.random() * 6) + 1;
      if (faceEl) faceEl.setAttribute('data-value', rnd);
      if (++n >= 12) { clearInterval(iv); resolve(); }
    }, 55);
  });
}

// ─── Canvas click — token selection & movement ────────────────────────────────

function handleCanvasClick(e) {
  if (!roomData || roomData.status !== 'playing') return;
  if (cellSize <= 0) { resizeCanvas(); return; }
  if (isMoving) return; // Bug 3: ignore clicks while a move is in progress

  const gs  = roomData.gameState;
  if (!gs?.diceRolled || pendingMoves.length === 0) return;

  const cur = roomData.playerOrder?.[gs.currentPlayerIndex];
  if (cur !== myUid) return;

  const [col, row] = getClickCell(e);

  for (const move of pendingMoves) {
    const pos  = roomData.players?.[myUid]?.tokens?.[move.tokenIndex];
    const cell = (pos === POS_YARD)
      ? YARD_POSITIONS[myColor]?.[move.tokenIndex]
      : getTokenCell(myColor, pos);

    if (cell && cell[0] === row && cell[1] === col) {
      executeMoveToken(move);
      return;
    }
  }
}

function handleCanvasHover(e) {
  if (!roomData || roomData.status !== 'playing') return;
  if (!roomData.gameState?.diceRolled || pendingMoves.length === 0) {
    canvas.style.cursor = 'default';
    return;
  }

  const cur = roomData.playerOrder?.[roomData.gameState.currentPlayerIndex];
  if (cur !== myUid) { canvas.style.cursor = 'default'; return; }

  const [col, row] = getClickCell(e);
  let hovering = false;

  for (const move of pendingMoves) {
    const pos  = roomData.players?.[myUid]?.tokens?.[move.tokenIndex];
    const cell = (pos === POS_YARD)
      ? YARD_POSITIONS[myColor]?.[move.tokenIndex]
      : getTokenCell(myColor, pos);

    if (cell && cell[0] === row && cell[1] === col) {
      hovering      = true;
      selectedToken = { tokenIndex: move.tokenIndex };
      break;
    }
  }

  if (!hovering) selectedToken = null;
  canvas.style.cursor = hovering ? 'pointer' : 'default';
  renderBoard();
}

function getClickCell(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / (rect.width  || canvas.width);
  const scaleY = canvas.height / (rect.height || canvas.height);
  const px     = (e.clientX - rect.left) * scaleX;
  const py     = (e.clientY - rect.top)  * scaleY;
  return [Math.floor(px / cellSize), Math.floor(py / cellSize)];
}

async function executeMoveToken(move) {
  if (isMoving) return; // Bug 3: guard against re-entrant calls
  isMoving = true;
  stopTimer();
  pendingMoves  = [];
  selectedToken = null;
  renderBoard();

  // Get the current position of the token BEFORE committing to Firebase
  const fromPos = roomData?.players?.[myUid]?.tokens?.[move.tokenIndex];
  const toPos   = move.toPos;

  // Play the cell-by-cell slide animation first, then commit
  try {
    await new Promise(resolve => {
      animateTokenPath(
        ctx, cellSize, boardRef, null,
        myColor, myUid, move.tokenIndex,
        fromPos, toPos,
        resolve
      );
    });

    // Spawn sparkle at destination after animation completes
    const destCell = getTokenCell(myColor, toPos);
    if (destCell) {
      const boardRect = canvas.getBoundingClientRect();
      const containerRect = document.getElementById('boardContainer').getBoundingClientRect();
      const offsetX = boardRect.left - containerRect.left;
      const offsetY = boardRect.top  - containerRect.top;
      const px = offsetX + (destCell[1] + 0.5) * cellSize * (boardRect.width / canvas.width);
      const py = offsetY + (destCell[0] + 0.5) * cellSize * (boardRect.height / canvas.height);
      spawnSparkle(px, py, COLOR_CONFIG[myColor]?.bg || '#fff');
    }
    SFX.move();

    await moveToken(roomId, myUid, move.tokenIndex);
  } finally {
    isMoving = false;
  }
}

// ─── Player list sidebar ──────────────────────────────────────────────────────

function renderPlayerList(room) {
  // Render into both desktop sidebar and mobile strip
  const lists = [
    document.getElementById('playerList'),
    document.getElementById('playerListMobile'),
  ].filter(Boolean);
  if (lists.length === 0) return;

  const gs     = room.gameState;
  const curUid = room.playerOrder?.[gs?.currentPlayerIndex];

  // Build card elements once, then clone into each container
  const cards = [];
  for (const [uid, player] of Object.entries(room.players || {})) {
    if (!player) continue;
    const cfg        = COLOR_CONFIG[player.color] || {};
    const isCurrent  = uid === curUid && room.status === 'playing';
    const isMe       = uid === myUid;
    const wonCount   = (player.tokens || []).filter(t => t === POS_WON).length;
    const lives      = 3 - (player.missedTurns || 0);
    const hearts     = '\u2764\uFE0F'.repeat(Math.max(lives, 0)) + '\uD83D\uDDA4'.repeat(Math.max(3 - lives, 0));
    const eliminated = player.eliminated;

    const div = document.createElement('div');
    div.className = `player-card ${isCurrent ? 'active' : ''} ${isMe ? 'me' : ''} ${eliminated ? 'eliminated' : ''}`;
    div.style.setProperty('--pcol', cfg.bg || '#888');
    div.innerHTML = `
      <div class="pc-dot" style="background:${cfg.bg}${eliminated ? ';opacity:0.3' : ''}"></div>
      <div class="pc-info">
        <div class="pc-name">${escHtml(player.name)}${isMe ? ' <span class="me-tag">(You)</span>' : ''}${eliminated ? ' \u2620\uFE0F' : ''}</div>
        <div class="pc-tokens">${eliminated ? 'Out' : `${wonCount}/4 \uD83C\uDFE0 ${hearts}`}</div>
      </div>
      ${isCurrent && !eliminated ? '<div class="pc-turn">\uD83C\uDFB2</div>' : ''}
    `;
    cards.push(div);
  }

  lists.forEach((list, i) => {
    list.innerHTML = '';
    cards.forEach(card => list.appendChild(i === 0 ? card : card.cloneNode(true)));
  });
}

// ─── Corner player names (next to home areas) ─────────────────────────────

function updateCornerNames(room) {
  // Color layout (constants.js):
  //   Red=top-left, Green=top-right, Blue=bottom-left, Yellow=bottom-right
  const gs     = room.gameState;
  const curUid = room.playerOrder?.[gs?.currentPlayerIndex];

  const colorPlayer = {};
  for (const [uid, player] of Object.entries(room.players || {})) {
    if (player?.color) colorPlayer[player.color] = { uid, player };
  }

  for (const color of ['red','green','blue','yellow']) {
    const el = document.getElementById(`cn-${color}`);
    if (!el) continue;
    const entry = colorPlayer[color];
    if (!entry) { el.innerHTML = ''; el.style.display = 'none'; continue; }
    const { uid, player } = entry;
    const cfg       = COLOR_CONFIG[color];
    const isCurrent = uid === curUid && room.status === 'playing';
    el.style.display = '';
    // Vertical layout: color dot on top, name below
    const label = escHtml(player.name) + (uid === myUid ? '<br>(You)' : '');
    el.innerHTML = `<span class="cn-dot" style="background:${cfg.bg}"></span><span class="cn-text">${label}</span>`;
    el.classList.toggle('active-turn', isCurrent);
    el.style.setProperty('--cur-color', isCurrent ? cfg.bg : 'var(--border)');
  }
}

// ─── Winner overlay + confetti ────────────────────────────────────────────────

function renderWinner(room) {
  const overlay = document.getElementById('winnerOverlay');
  if (!overlay || overlay.dataset.shown) return;
  overlay.dataset.shown = '1';

  const winnerUid = room.gameState?.winner;
  if (!winnerUid) return;
  const winner = room.players?.[winnerUid];
  if (!winner) return;

  const cfg  = COLOR_CONFIG[winner.color];
  const isMe = winnerUid === myUid;

  overlay.innerHTML = `
    <div class="winner-card" style="--wcol:${cfg.bg};--wglow:${cfg.glow}">
      <div class="winner-crown">👑</div>
      <div class="winner-name" style="color:${cfg.bg}">${escHtml(winner.name)}</div>
      <div class="winner-sub">${isMe ? '🎉 YOU WON! Incredible!' : 'Wins the game!'}</div>
      <div class="winner-emoji">${isMe ? '🎊🏆🎊' : '🥲'}</div>
      <button class="btn-create" onclick="window.location.href='index.html'">Play Again</button>
    </div>`;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));

  SFX.win();
  if (isMe) spawnConfetti();
  stopTimer();
}

function spawnConfetti() {
  const colors = ['#6366f1','#f59e0b','#22c55e','#ef4444','#a78bfa','#34d399','#fbbf24'];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `
      left:${Math.random() * 100}vw;
      top:-10px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      width:${6 + Math.random() * 8}px;
      height:${6 + Math.random() * 8}px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      animation: confettiFall ${1.5 + Math.random() * 2}s ${Math.random() * 1.5}s linear forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

let chatSeen = new Set();

function initChat() {
  // ── Desktop sidebar inputs
  const inputD   = document.getElementById('chatInput');
  const sendBtnD = document.getElementById('chatSendBtn');
  if (inputD && sendBtnD) {
    sendBtnD.addEventListener('click', () => doSendChat('chatInput'));
    inputD.addEventListener('keydown', e => { if (e.key === 'Enter') doSendChat('chatInput'); });
  }

  // ── Mobile sheet inputs
  const inputM   = document.getElementById('chatInputSheet');
  const sendBtnM = document.getElementById('chatSendBtnSheet');
  if (inputM && sendBtnM) {
    sendBtnM.addEventListener('click', () => doSendChat('chatInputSheet'));
    inputM.addEventListener('keydown', e => { if (e.key === 'Enter') doSendChat('chatInputSheet'); });
  }

  // ── All emoji buttons (sidebar + sheet)
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji  = btn.dataset.e;
      const target = btn.dataset.target === 'sheet' ? 'chatInputSheet' : 'chatInput';
      const inp    = document.getElementById(target);
      if (inp) { inp.value = (inp.value + emoji).slice(0, 80); inp.focus(); }
    });
  });

  // ── Firebase chat listener
  if (!window.db || !roomId) return;
  const chatRef = window.db.ref(`rooms/${roomId}/messages`).limitToLast(CHAT_MAX_SHOWN);
  chatRef.on('value', snap => renderChatMessages(snap.val()));
  unsubChat = () => chatRef.off('value');

  // Bug 1 fix: periodically trim chatSeen to prevent unbounded growth
  setInterval(() => {
    if (chatSeen.size > 200) {
      const entries = [...chatSeen];
      chatSeen = new Set(entries.slice(-100));
    }
  }, 60_000);
}

async function doSendChat(inputId = 'chatInput') {
  const input = document.getElementById(inputId);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  const player = roomData?.players?.[myUid];
  if (!player) return;

  await sendChatMessage(roomId, {
    uid:   myUid,
    name:  player.name,
    color: player.color,
    text,
    ts:    Date.now(),
  });
}

function renderChatMessages(msgs) {
  // Render into BOTH desktop sidebar and mobile sheet containers
  const containers = [
    document.getElementById('chatMessages'),
    document.getElementById('chatMessagesSheet'),
  ].filter(Boolean);

  if (!msgs) {
    containers.forEach(c => c.innerHTML = '');
    return;
  }

  const entries = Object.entries(msgs).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
  let hasNew = false;

  // Rebuild both containers
  containers.forEach(container => {
    container.innerHTML = '';
    for (const [key, msg] of entries) {
      const isMe  = msg.uid === myUid;
      const cfg   = COLOR_CONFIG[msg.color];
      const div   = document.createElement('div');
      div.className = `chat-msg ${isMe ? 'mine' : 'other'}`;
      div.innerHTML = `
        ${!isMe ? `<div class="chat-sender" style="color:${cfg?.bg || '#888'}">${escHtml(msg.name)}</div>` : ''}
        <div class="chat-bubble">${escHtml(msg.text)}</div>
      `;
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  });

  // Sound for new messages
  for (const [key, msg] of entries) {
    if (!chatSeen.has(key)) {
      chatSeen.add(key);
      hasNew = true;
      if (msg.uid !== myUid) {
        SFX.chat();
        showChatNotif(msg);
      }
    }
  }
}

// ─── Chat message notification ────────────────────────────────────────────────

function showChatNotif(msg) {
  // On desktop the sidebar is always visible — no notification needed
  if (window.innerWidth > 768) return;

  // Don't show if the chat sheet is already open
  const overlay = document.getElementById('chatOverlay');
  if (overlay?.classList.contains('open')) return;

  const notifEl = document.getElementById('chatNotif');
  if (!notifEl) return;

  // Build a short preview: "Name: text…"
  const preview = msg.text.length > 26 ? msg.text.slice(0, 26) + '\u2026' : msg.text;
  notifEl.textContent = `\uD83D\uDCAC ${msg.name}: ${preview}`;

  // Restart animation (force reflow to replay)
  notifEl.classList.remove('show');
  void notifEl.offsetWidth;
  notifEl.classList.add('show');

  // Clean up class after animation completes
  clearTimeout(notifEl._t);
  notifEl._t = setTimeout(() => notifEl.classList.remove('show'), 3300);
}


// ─── Share link ───────────────────────────────────────────────────────────────

function buildShareLink() {
  const base = window.location.href.replace('game.html', 'index.html').split('?')[0];
  return `${base}?room=${roomId}`;
}

function copyShareLink() {
  navigator.clipboard.writeText(buildShareLink()).then(() => {
    const btn = document.getElementById('copyLinkBtn');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = '🔗 Copy Link', 2000); }
  });
}

// ─── Error display ────────────────────────────────────────────────────────────

function showError(html) {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;
      background:#0f0f1a;color:#e2e8f0;font-family:Outfit,sans-serif;text-align:center;padding:2rem">
      <div>
        <div style="font-size:3rem;margin-bottom:1rem">⚠️</div>
        <p style="font-size:1.1rem">${html}</p>
        <a href="index.html" style="color:#818cf8;margin-top:1.5rem;display:inline-block">← Go Home</a>
      </div>
    </div>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
