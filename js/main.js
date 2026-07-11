/**
 * Ludo Online — Landing Page Logic
 * Handles room creation, joining, modals, and redirect to game.html
 */

// ─── State ─────────────────────────────────────────────────────────────────

let selectedPlayerCount = 4;

// ─── DOM refs ──────────────────────────────────────────────────────────────

const createRoomBtn  = document.getElementById('createRoomBtn');
const joinRoomBtn    = document.getElementById('joinRoomBtn');
const createModal    = document.getElementById('createModal');
const joinModal      = document.getElementById('joinModal');
const closeCreate    = document.getElementById('closeCreate');
const closeJoin      = document.getElementById('closeJoin');
const createSubmit   = document.getElementById('createSubmit');
const joinSubmit     = document.getElementById('joinSubmit');
const createNameEl   = document.getElementById('createName');
const joinNameEl     = document.getElementById('joinName');
const joinCodeEl     = document.getElementById('joinCode');
const toastEl        = document.getElementById('toast');
const loadingEl      = document.getElementById('loading');
const loadingTextEl  = document.getElementById('loadingText');
const previewCanvas  = document.getElementById('previewBoard');

// ─── Firebase guard ────────────────────────────────────────────────────────

function checkFirebase() {
  if (window.FIREBASE_NOT_CONFIGURED) {
    showSetupBanner();
    return false;
  }
  if (!window.FIREBASE_READY) {
    showToast('Firebase error. Please check your config.', 'error');
    return false;
  }
  return true;
}

function showSetupBanner() {
  const existing = document.getElementById('setupBanner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.id = 'setupBanner';
  banner.innerHTML = `
    <div class="setup-banner">
      <div class="setup-banner-icon">⚠️</div>
      <div class="setup-banner-text">
        <strong>Firebase not configured yet</strong><br>
        Open <code>js/firebase-config.js</code> and add your Firebase credentials to enable multiplayer.
        <a href="https://console.firebase.google.com" target="_blank">Get Firebase free →</a>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
}

// ─── Modal helpers ─────────────────────────────────────────────────────────

function openModal(modal) {
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeModal(modal) {
  modal.classList.remove('visible');
  setTimeout(() => modal.classList.add('hidden'), 280);
}

// ─── Toast notification ─────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  toastEl.textContent = msg;
  toastEl.className = `toast toast-${type}`;
  toastEl.classList.remove('hidden');
  setTimeout(() => toastEl.classList.add('hidden'), 3500);
}

// ─── Loading overlay ────────────────────────────────────────────────────────

function showLoading(text) {
  loadingTextEl.textContent = text;
  loadingEl.classList.remove('hidden');
}
function hideLoading() {
  loadingEl.classList.add('hidden');
}

// ─── Player count selector ─────────────────────────────────────────────────

document.querySelectorAll('.count-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.count-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedPlayerCount = parseInt(btn.dataset.v);
  });
});

// ─── Create Room flow ───────────────────────────────────────────────────────

createRoomBtn.addEventListener('click', () => {
  if (!checkFirebase()) return;
  openModal(createModal);
  setTimeout(() => createNameEl.focus(), 300);
});

closeCreate.addEventListener('click', () => closeModal(createModal));
createModal.addEventListener('click', e => { if (e.target === createModal) closeModal(createModal); });

createSubmit.addEventListener('click', async () => {
  const name = createNameEl.value.trim();
  if (!name) { showToast('Please enter your name', 'warn'); createNameEl.focus(); return; }

  closeModal(createModal);
  showLoading('Creating your room...');

  try {
    const { roomId } = await createRoom(name, selectedPlayerCount);
    showLoading('Room created! Redirecting...');
    setTimeout(() => {
      window.location.href = `game.html?room=${roomId}`;
    }, 600);
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to create room', 'error');
    console.error(err);
  }
});

createNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') createSubmit.click(); });

// ─── Join Room flow ─────────────────────────────────────────────────────────

joinRoomBtn.addEventListener('click', () => {
  if (!checkFirebase()) return;
  openModal(joinModal);
  // Pre-fill room code from URL if present
  const urlRoom = new URLSearchParams(window.location.search).get('room');
  if (urlRoom) joinCodeEl.value = urlRoom.toUpperCase();
  setTimeout(() => (joinCodeEl.value ? joinNameEl.focus() : joinCodeEl.focus()), 300);
});

closeJoin.addEventListener('click', () => closeModal(joinModal));
joinModal.addEventListener('click', e => { if (e.target === joinModal) closeModal(joinModal); });

joinCodeEl.addEventListener('input', () => {
  joinCodeEl.value = joinCodeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

joinSubmit.addEventListener('click', async () => {
  const name = joinNameEl.value.trim();
  const code = joinCodeEl.value.trim().toUpperCase();
  if (!name) { showToast('Please enter your name', 'warn'); joinNameEl.focus(); return; }
  if (!code || code.length < 4) { showToast('Enter a valid room code', 'warn'); joinCodeEl.focus(); return; }

  closeModal(joinModal);
  showLoading('Joining room...');

  try {
    await joinRoom(code, name);
    showLoading('Joined! Redirecting...');
    setTimeout(() => {
      window.location.href = `game.html?room=${code}`;
    }, 600);
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to join room', 'error');
    console.error(err);
  }
});

joinNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') joinSubmit.click(); });
joinCodeEl.addEventListener('keydown', e => { if (e.key === 'Enter') joinNameEl.focus(); });

// ─── Preview board ──────────────────────────────────────────────────────────

function initPreview() {
  if (!previewCanvas) return;
  try {
    drawPreviewBoard(previewCanvas);
  } catch (e) {
    // board-renderer not loaded in time, retry
    setTimeout(initPreview, 100);
  }
}

// ─── Floating token animation ───────────────────────────────────────────────

function initFloatingTokens() {
  document.querySelectorAll('.floating-token').forEach((el, i) => {
    const randomX = (Math.random() - 0.5) * 30;
    const randomY = (Math.random() - 0.5) * 30;
    const delay   = i * 0.5;
    el.style.animation = `floatToken 3s ease-in-out ${delay}s infinite alternate`;
    el.style.setProperty('--rx', randomX + 'px');
    el.style.setProperty('--ry', randomY + 'px');
  });
}

// ─── Auto-join via URL ──────────────────────────────────────────────────────

function checkAutoJoin() {
  const params = new URLSearchParams(window.location.search);
  const room   = params.get('room');
  if (room && window.FIREBASE_READY) {
    // Auto-open join modal with pre-filled code
    setTimeout(() => {
      joinCodeEl.value = room.toUpperCase();
      openModal(joinModal);
      joinNameEl.focus();
    }, 500);
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  initPreview();
  initFloatingTokens();
  checkAutoJoin();

  if (window.FIREBASE_NOT_CONFIGURED) {
    showSetupBanner();
  }
});
