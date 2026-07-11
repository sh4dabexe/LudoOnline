/**
 * Ludo Online — Canvas Board Renderer
 *
 * Draws the 15×15 Ludo board and all tokens onto an HTML5 Canvas.
 * All coordinates are in grid units (rows/cols); pixel conversion
 * uses the `cs` (cell size) parameter passed to each function.
 */

// ─── Drawing helpers ───────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const spikes = 5;
  const innerR = r * 0.4;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const radius = i % 2 === 0 ? r : innerR;
    if (i === 0) ctx.moveTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    else ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawArrow(ctx, cx, cy, cs, direction, color) {
  // direction: 'right','left','up','down'
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const s = cs * 0.28;
  ctx.translate(cx, cy);
  const angles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  ctx.rotate(angles[direction] || 0);
  ctx.moveTo(s, 0);
  ctx.lineTo(-s * 0.5, -s * 0.7);
  ctx.lineTo(-s * 0.5, s * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Board drawing ─────────────────────────────────────────────────────────

/**
 * Draw the full static Ludo board.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cs  Cell size in pixels
 */
function drawLudoBoard(ctx, cs) {
  const BOARD = 15 * cs;

  // ── Board background (soft base + subtle vignette) ───────────
  ctx.save();
  const bgGrad = ctx.createLinearGradient(0, 0, BOARD, BOARD);
  bgGrad.addColorStop(0, '#fdfdff');
  bgGrad.addColorStop(1, '#eef1f6');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, BOARD, BOARD);
  ctx.restore();

  // ── Home corner areas ─────────────────────────────────────────
  const homes = [
    { color: COLOR_CONFIG.red,    r: 0, c: 0 },
    { color: COLOR_CONFIG.green,  r: 0, c: 9 },
    { color: COLOR_CONFIG.yellow, r: 9, c: 9 },
    { color: COLOR_CONFIG.blue,   r: 9, c: 0 },
  ];

  for (const h of homes) {
    const x0 = h.c * cs, y0 = h.r * cs, s = 6 * cs;

    // Outer colored area — diagonal gloss gradient
    const grad = ctx.createLinearGradient(x0, y0, x0 + s, y0 + s);
    grad.addColorStop(0, h.color.mid || h.color.bg);
    grad.addColorStop(1, h.color.dark);
    ctx.fillStyle = grad;
    ctx.fillRect(x0, y0, s, s);

    // Inner white yard rectangle (glossy)
    const ix = (h.c + 1) * cs + 2;
    const iy = (h.r + 1) * cs + 2;
    const iw = 4 * cs - 4;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur  = cs * 0.35;
    ctx.shadowOffsetY = cs * 0.05;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(ctx, ix, iy, iw, iw, cs * 0.4);
    ctx.fill();
    ctx.restore();

    // subtle top sheen on the yard
    const sheen = ctx.createLinearGradient(ix, iy, ix, iy + iw * 0.5);
    sheen.addColorStop(0, 'rgba(255,255,255,0.55)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    roundRect(ctx, ix, iy, iw, iw, cs * 0.4);
    ctx.fill();

    // Token spots (4 circles) — recessed wells
    const spots =
      h.color === COLOR_CONFIG.red    ? YARD_POSITIONS.red    :
      h.color === COLOR_CONFIG.green  ? YARD_POSITIONS.green  :
      h.color === COLOR_CONFIG.yellow ? YARD_POSITIONS.yellow :
                                        YARD_POSITIONS.blue;
    const spotR = cs * 0.32;
    for (const [sr, sc] of spots) {
      const cxw = (sc + 0.5) * cs, cyw = (sr + 0.5) * cs;
      // soft well shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur  = cs * 0.12;
      ctx.shadowOffsetY = cs * 0.03;
      ctx.fillStyle   = h.color.light;
      ctx.beginPath();
      ctx.arc(cxw, cyw, spotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = h.color.bg;
      ctx.lineWidth   = cs * 0.05;
      ctx.beginPath();
      ctx.arc(cxw, cyw, spotR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── Path cells ────────────────────────────────────────────────
  // Color the 3-wide channels
  const channelH = [ // horizontal rows 6,7,8
    { rows: [6], cols: [0,14], fill: '#f9f9f9' },
    { rows: [7], cols: [0,14], fill: '#f5f5f5' },
    { rows: [8], cols: [0,14], fill: '#f9f9f9' },
  ];
  const channelV = [
    { cols: [6], rows: [0,14], fill: '#f9f9f9' },
    { cols: [7], rows: [0,14], fill: '#f5f5f5' },
    { cols: [8], rows: [0,14], fill: '#f9f9f9' },
  ];

  for (const { rows, cols, fill } of [...channelH, ...channelV]) {
    ctx.fillStyle = fill;
    for (const r of rows) {
      for (let c = cols[0]; c <= cols[1]; c++) {
        if (r >= 6 && r <= 8 && c >= 6 && c <= 8) continue; // skip center
        ctx.fillRect(c * cs + 0.5, r * cs + 0.5, cs - 1, cs - 1);
      }
    }
    for (const col of cols) {
      for (let r = rows[0]; r <= rows[1]; r++) {
        if (r >= 6 && r <= 8 && col >= 6 && col <= 8) continue;
        ctx.fillRect(col * cs + 0.5, r * cs + 0.5, cs - 1, cs - 1);
      }
    }
  }

  // Draw all main path cells (white, with soft inner shadow + rounded feel)
  for (const [r, c] of MAIN_PATH) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(c * cs + 0.5, r * cs + 0.5, cs - 1, cs - 1);
    ctx.strokeStyle = '#e6e9ef';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(c * cs + 0.5, r * cs + 0.5, cs - 1, cs - 1);
  }

  // ── Safe squares (colored starting squares + star squares) ────
  const safeInfo = [
    { idx: 0,  color: COLOR_CONFIG.red,    dir: 'right' },
    { idx: 13, color: COLOR_CONFIG.green,  dir: 'down'  },
    { idx: 26, color: COLOR_CONFIG.yellow, dir: 'left'  },
    { idx: 39, color: COLOR_CONFIG.blue,   dir: 'up'    },
  ];
  const starSquares = [8, 21, 34, 47];

  for (const { idx, color, dir } of safeInfo) {
    const [r, c] = MAIN_PATH[idx];
    const cx0 = c * cs, cy0 = r * cs;
    // glow underlay
    ctx.save();
    ctx.shadowColor = color.glow;
    ctx.shadowBlur  = cs * 0.5;
    const g = ctx.createLinearGradient(cx0, cy0, cx0 + cs, cy0 + cs);
    g.addColorStop(0, color.mid || color.bg);
    g.addColorStop(1, color.dark);
    ctx.fillStyle = g;
    ctx.fillRect(cx0 + 0.5, cy0 + 0.5, cs - 1, cs - 1);
    ctx.restore();
    drawArrow(ctx, (c + 0.5) * cs, (r + 0.5) * cs, cs, dir, 'rgba(255,255,255,0.85)');
  }

  for (const idx of starSquares) {
    const [r, c] = MAIN_PATH[idx];
    const cx0 = c * cs, cy0 = r * cs;
    const g = ctx.createLinearGradient(cx0, cy0, cx0 + cs, cy0 + cs);
    g.addColorStop(0, '#e9e9ef');
    g.addColorStop(1, '#c7c7d4');
    ctx.fillStyle = g;
    ctx.fillRect(cx0 + 0.5, cy0 + 0.5, cs - 1, cs - 1);
    drawStar(ctx, (c + 0.5) * cs, (r + 0.5) * cs, cs * 0.28, 'white');
  }

  // ── Home stretch (colored paths) ──────────────────────────────
  for (const [color, path] of Object.entries(HOME_PATHS)) {
    const cfg = COLOR_CONFIG[color];
    for (let i = 0; i < path.length; i++) {
      const [r, c] = path[i];
      const cx0 = c * cs, cy0 = r * cs;
      // brighter near the entrance, fading toward center
      const g = ctx.createLinearGradient(cx0, cy0, cx0 + cs, cy0 + cs);
      g.addColorStop(0, cfg.mid || cfg.bg);
      g.addColorStop(1, cfg.dark);
      ctx.save();
      ctx.shadowColor = cfg.glow;
      ctx.shadowBlur  = cs * 0.25;
      ctx.fillStyle = g;
      ctx.fillRect(cx0 + 0.5, cy0 + 0.5, cs - 1, cs - 1);
      ctx.restore();
    }
  }

  // ── Center triangles ──────────────────────────────────────────
  const cx = 7.5 * cs;
  const cy = 7.5 * cs;
  const hs = 1.5 * cs; // half-side of triangle

  // Bug 4 fix: triangle colors match each home-stretch entry direction:
  //   Top    → Green  (home stretch enters from top:   col 7, rows 1–6)
  //   Right  → Yellow (home stretch enters from right:  row 7, cols 13–8)
  //   Bottom → Blue   (home stretch enters from bottom: col 7, rows 13–8)
  //   Left   → Red    (home stretch enters from left:   row 7, cols 1–6)
  const triangles = [
    { cfg: COLOR_CONFIG.green,  points: [[6*cs,6*cs],[9*cs,6*cs],[cx,cy]] }, // Top
    { cfg: COLOR_CONFIG.yellow, points: [[9*cs,6*cs],[9*cs,9*cs],[cx,cy]] }, // Right
    { cfg: COLOR_CONFIG.blue,   points: [[6*cs,9*cs],[9*cs,9*cs],[cx,cy]] }, // Bottom
    { cfg: COLOR_CONFIG.red,    points: [[6*cs,6*cs],[6*cs,9*cs],[cx,cy]] }, // Left
  ];

  for (const { cfg, points } of triangles) {
    const g = ctx.createLinearGradient(points[0][0], points[0][1], cx, cy);
    g.addColorStop(0, cfg.bg);
    g.addColorStop(1, cfg.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineTo(points[2][0], points[2][1]);
    ctx.closePath();
    ctx.fill();
  }

  // Center home star
  drawStar(ctx, cx, cy, cs * 0.55, 'rgba(255,255,255,0.85)');

  // ── Grid border ───────────────────────────────────────────────
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, BOARD - 2, BOARD - 2);

  // Inner grid lines (light)
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 15; i++) {
    ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, BOARD); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(BOARD, i * cs); ctx.stroke();
  }

  // Separator lines between zones
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1.5;
  const sep = [6, 9];
  for (const s of sep) {
    ctx.beginPath(); ctx.moveTo(s * cs, 0); ctx.lineTo(s * cs, BOARD); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, s * cs); ctx.lineTo(BOARD, s * cs); ctx.stroke();
  }
}

// ─── Token rendering ───────────────────────────────────────────────────────

const TOKEN_ANIM = {}; // { tokenKey: { x, y, targetX, targetY, progress } }

/**
 * Draw all tokens for all players.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cs
 * @param {Object} players  { uid: { color, tokens: [pos0,pos1,pos2,pos3] } }
 * @param {string} myUid
 * @param {string[]} validTokenKeys  e.g. ['uid_0','uid_2'] for highlightable tokens
 * @param {string|null} selectedKey  currently selected token key
 */
function drawTokens(ctx, cs, players, myUid, validTokenKeys = [], selectedKey = null, hideTokenKey = null) {
  if (!players) return;

  // Count how many tokens share each cell (for stacking display)
  const cellMap = {}; // "r,c" → [{ uid, tokenIdx, color }]
  for (const [uid, player] of Object.entries(players)) {
    if (!player || !player.tokens || !player.color) continue;
    for (let i = 0; i < 4; i++) {
      const pos = player.tokens[i];
      if (pos === undefined) continue;
      const cell = getTokenCell(player.color, pos);
      if (!cell) continue; // null only for POS_YARD (in-yard tokens drawn separately below)
      // POS_WON (56) now maps to HOME_PATHS[color][5] — finished pieces stay visible on board


      const key = `${cell[0]},${cell[1]}`;
      if (!cellMap[key]) cellMap[key] = [];
      cellMap[key].push({ uid, tokenIdx: i, color: player.color, pos });
    }
  }

  // Draw tokens in yard
  for (const [uid, player] of Object.entries(players)) {
    if (!player || !player.tokens || !player.color) continue;
    for (let i = 0; i < 4; i++) {
      const pos = player.tokens[i];
      if (pos !== POS_YARD) continue;
      const tokenKey = `${uid}_${i}`;
      if (hideTokenKey && hideTokenKey === tokenKey) continue; // skip the in-flight token
      const yardCell = YARD_POSITIONS[player.color][i];
      const isValid = validTokenKeys.includes(tokenKey);
      const isSelected = selectedKey === tokenKey;
      drawSingleToken(ctx, cs, yardCell, player.color, i + 1, isValid, isSelected, false);
    }
  }

  // Draw tokens on board
  for (const [cellKey, tokens] of Object.entries(cellMap)) {
    const [r, c] = cellKey.split(',').map(Number);
    // Filter out the currently-animating token
    const visibleTokens = hideTokenKey
      ? tokens.filter(t => `${t.uid}_${t.tokenIdx}` !== hideTokenKey)
      : tokens;
    if (visibleTokens.length === 0) continue;
    const count = visibleTokens.length;

    if (count === 1) {
      const { uid, tokenIdx, color } = visibleTokens[0];
      const tokenKey = `${uid}_${tokenIdx}`;
      const isValid    = validTokenKeys.includes(tokenKey);
      const isSelected = selectedKey === tokenKey;
      drawSingleToken(ctx, cs, [r, c], color, tokenIdx + 1, isValid, isSelected, true);
    } else {
      // Multiple tokens on same cell — draw stacked
      const offsets = [
        [-0.22, -0.22], [0.22, -0.22],
        [-0.22,  0.22], [0.22,  0.22],
      ];
      for (let k = 0; k < Math.min(count, 4); k++) {
        const { uid, tokenIdx, color } = visibleTokens[k];
        const tokenKey = `${uid}_${tokenIdx}`;
        const isValid    = validTokenKeys.includes(tokenKey);
        const isSelected = selectedKey === tokenKey;
        const off = offsets[k] || [0, 0];
        const adjCell = [r + off[0], c + off[1]];
        drawSingleToken(ctx, cs, adjCell, color, tokenIdx + 1, isValid, isSelected, true, 0.75);
      }
    }
  }

  // Draw won tokens in center (small, layered)
  for (const [uid, player] of Object.entries(players)) {
    if (!player || !player.tokens || !player.color) continue;
    let wonCount = 0;
    for (let i = 0; i < 4; i++) {
      if (player.tokens[i] === POS_WON) wonCount++;
    }
    if (wonCount > 0) {
      // Draw a small badge in center area
      // (Shown via separate UI, not on canvas to avoid clutter)
    }
  }
}

/**
 * Draw a single token circle at a grid cell [r, c].
 */
function drawSingleToken(ctx, cs, [r, c], color, num, isValid, isSelected, onBoard, scale = 1, lift = 0) {
  const x = (c + 0.5) * cs;
  const y = (r + 0.5) * cs - lift;
  drawTokenAtPixel(ctx, cs, x, y, color, num, isValid, isSelected, onBoard, scale, lift);
}

/**
 * Draw a single token at an ABSOLUTE pixel position (x, y).
 * Used both by the board renderer and the move animation.
 */
function drawTokenAtPixel(ctx, cs, x, y, color, num, isValid, isSelected, onBoard, scale, lift) {
  const cfg = COLOR_CONFIG[color];
  const baseR = cs * (onBoard ? 0.36 : 0.29) * scale;

  ctx.save();

  // Pulse ring for valid moves
  if (isValid && !isSelected) {
    ctx.beginPath();
    ctx.arc(x, y, baseR + cs * 0.14, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Glow for selected
  if (isSelected) {
    ctx.shadowColor = cfg.glow;
    ctx.shadowBlur  = cs * 0.9;
  }

  // Ground shadow (offset opposite to lift → reads as elevation)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur  = cs * (0.22 + lift / cs * 0.3);
  ctx.shadowOffsetY = cs * (0.07 + lift / cs * 0.5);
  ctx.fillStyle = cfg.dark;
  ctx.beginPath();
  ctx.arc(x, y, baseR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Spherical body — radial gradient offset to top-left = 3D ball
  const bodyGrad = ctx.createRadialGradient(
    x - baseR * 0.35, y - baseR * 0.4, baseR * 0.1,
    x, y, baseR
  );
  bodyGrad.addColorStop(0, cfg.mid || cfg.bg);
  bodyGrad.addColorStop(0.55, cfg.bg);
  bodyGrad.addColorStop(1, cfg.dark);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(x, y, baseR, 0, Math.PI * 2);
  ctx.fill();

  // Beveled rim (inner dark ring) for depth
  ctx.lineWidth = cs * 0.05;
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.arc(x, y, baseR - cs * 0.02, 0, Math.PI * 2);
  ctx.stroke();

  // Bright specular highlight (top-left)
  const hiGrad = ctx.createRadialGradient(
    x - baseR * 0.32, y - baseR * 0.38, 0,
    x - baseR * 0.32, y - baseR * 0.38, baseR * 0.55
  );
  hiGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
  hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hiGrad;
  ctx.beginPath();
  ctx.arc(x, y, baseR, 0, Math.PI * 2);
  ctx.fill();

  // Small crisp glint dot
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x - baseR * 0.34, y - baseR * 0.4, baseR * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Decorative star emblem (replaces the old numeric label) so the piece
  // reads as a glossy token rather than a flat disc. All same-color pieces
  // now look identical.
  drawStar(ctx, x, y, baseR * 0.42, 'rgba(255,255,255,0.85)');

  // Selection ring
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(x, y, baseR + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Cell highlight for valid moves ────────────────────────────────────────

/**
 * Draw green highlight overlay on cells where a token can move.
 */
function drawValidMoveCells(ctx, cs, color, moves) {
  for (const { toPos } of moves) {
    const cell = getTokenCell(color, toPos);
    if (!cell) continue;
    const [r, c] = cell;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 150, 0.45)';
    ctx.fillRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2);
    ctx.restore();
  }
}

// ─── Token move animation ───────────────────────────────────────────────────

let activeTokenAnim = null;

/**
 * Animate a token stepping cell-by-cell from `fromPos` to `toPos` (Ludo King
 * style). Each step slides quickly with a little hop; the board is fully
 * redrawn each frame so other pieces stay in place.
 *
 * IMPORTANT: this is purely visual. The real game state is committed by the
 * caller (executeMoveToken → moveToken). This function only *renders* the walk.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cs        cell size in px
 * @param {object} boardRef  object exposing renderBoard() to redraw the board
 * @param {object} roomRef   object exposing players / myUid / myColor
 * @param {string} color
 * @param {string} uid       owner uid (to skip drawing the moving token on board)
 * @param {number} tokenIdx
 * @param {number} fromPos
 * @param {number} toPos
 * @param {Function} onComplete
 */
function animateTokenPath(ctx, cs, boardRef, roomRef, color, uid, tokenIdx, fromPos, toPos, onComplete) {
  // Build the list of cells the token walks through.
  // If leaving yard (fromPos === POS_YARD), start from the yard spot and walk to pos 0.
  const cells = [];
  if (fromPos === POS_YARD) {
    // Start position: the token's yard spot
    const yardCell = YARD_POSITIONS[color]?.[tokenIdx];
    if (yardCell) cells.push(yardCell);
    // Destination: position 0 (the safe starting square)
    const destCell = getTokenCell(color, 0);
    if (destCell) cells.push(destCell);
  } else {
    for (let p = fromPos; p <= toPos; p++) {
      const cell = getTokenCell(color, p);
      if (cell) cells.push(cell);
    }
  }
  if (cells.length === 0) { onComplete && onComplete(); return; }

  const STEP_DURATION = 130;   // ms per cell (quick, Ludo-King-like)
  const HOP_HEIGHT    = cs * 0.45;

  const movingKey = `${uid}_${tokenIdx}`;

  // Snapshot of the static board + other tokens, drawn once per frame.
  function drawScene(animX, animY, lift) {
    // Redraw full board so the moving piece doesn't leave a trail.
    if (boardRef && typeof boardRef.renderBoard === 'function') {
      // Temporarily hide the moving token on the board by overriding drawTokens
      // via a filter: we re-run renderBoard then draw the moving token on top.
      boardRef.renderBoard({
        hideTokenKey: movingKey,
        movingToken: { color, x: animX, y: animY, lift },
      });
    }
  }

  let stepIndex = 0;
  let start = null;

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function frame(ts) {
    if (start === null) {
      start = ts;
      // Play step sound at the start of each new cell
      if (typeof SFX !== 'undefined' && SFX.step) SFX.step();
    }
    const elapsed = ts - start;
    const t = Math.min(elapsed / STEP_DURATION, 1);
    const ease = easeOutCubic(t);

    const fromCell = cells[stepIndex];
    const toCell   = cells[stepIndex + 1] || fromCell;
    const fxc = (fromCell[1] + 0.5) * cs, fyc = (fromCell[0] + 0.5) * cs;
    const txc = (toCell[1] + 0.5) * cs,   tyc = (toCell[0] + 0.5) * cs;
    const x = fxc + (txc - fxc) * ease;
    const y = fyc + (tyc - fyc) * ease;
    // Hop: parabolic arc peaking at the middle of each step.
    const hop = Math.sin(t * Math.PI) * HOP_HEIGHT;

    drawScene(x, y, hop);

    if (t >= 1) {
      stepIndex++;
      start = null;
      if (stepIndex < cells.length - 1) {
        requestAnimationFrame(frame);
      } else {
        activeTokenAnim = null;
        // Final settle — redraw without the moving token overlay (state now updated).
        if (boardRef && typeof boardRef.renderBoard === 'function') boardRef.renderBoard();
        onComplete && onComplete();
      }
    } else {
      requestAnimationFrame(frame);
    }
  }

  activeTokenAnim = frame;
  requestAnimationFrame(frame);
}

/**
 * Animate a captured token sliding back from its current board position
 * to its yard spot. Used when a piece is sent home after being captured.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cs
 * @param {object} boardRef  { renderBoard }
 * @param {string} color
 * @param {string} uid
 * @param {number} tokenIdx
 * @param {number} capturedAtPos  The board position where the piece was captured
 * @param {Function} onComplete
 */
function animateCaptureToYard(ctx, cs, boardRef, color, uid, tokenIdx, capturedAtPos, onComplete) {
  const startCell = getTokenCell(color, capturedAtPos);
  const yardCell  = YARD_POSITIONS[color]?.[tokenIdx];
  if (!startCell || !yardCell) { onComplete && onComplete(); return; }

  // Build a direct path: captured position → yard spot (2-cell slide)
  const cells = [startCell, yardCell];
  const movingKey = `${uid}_${tokenIdx}`;

  const STEP_DURATION = 160; // slightly slower so it reads clearly
  const HOP_HEIGHT    = cs * 0.35;

  function drawScene(animX, animY, lift) {
    if (boardRef && typeof boardRef.renderBoard === 'function') {
      boardRef.renderBoard({
        hideTokenKey: movingKey,
        movingToken: { color, x: animX, y: animY, lift },
      });
    }
  }

  let start = null;
  function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function frame(ts) {
    if (start === null) start = ts;
    const elapsed = ts - start;
    const t = Math.min(elapsed / STEP_DURATION, 1);
    const ease = easeInOutQuad(t);

    const fxc = (startCell[1] + 0.5) * cs, fyc = (startCell[0] + 0.5) * cs;
    const txc = (yardCell[1]  + 0.5) * cs, tyc = (yardCell[0]  + 0.5) * cs;
    const x = fxc + (txc - fxc) * ease;
    const y = fyc + (tyc - fyc) * ease;
    const hop = Math.sin(t * Math.PI) * HOP_HEIGHT;

    drawScene(x, y, hop);

    if (t >= 1) {
      if (boardRef && typeof boardRef.renderBoard === 'function') boardRef.renderBoard();
      onComplete && onComplete();
    } else {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

// Used by renderBoard to draw the in-flight token on top (no number).
function drawMovingToken(ctx, cs, color, x, y, lift) {
  drawTokenAtPixel(ctx, cs, x, y, color, 0, false, false, true, 1, lift);
}

// ─── Mini preview board (landing page) ────────────────────────────────────

/**
 * Draw a simplified preview board for the landing page.
 */
function drawPreviewBoard(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  const cs = canvasEl.width / 15;
  drawLudoBoard(ctx, cs);

  // Draw exactly 4 yard tokens per color at their correct yard spots
  for (const color of ['red', 'green', 'yellow', 'blue']) {
    const spots = YARD_POSITIONS[color];
    for (let i = 0; i < 4; i++) {
      drawSingleToken(ctx, cs, spots[i], color, i + 1, false, false, false);
    }
  }
}
