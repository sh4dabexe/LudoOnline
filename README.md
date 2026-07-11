# 🎲 Ludo Online

> **Real-time multiplayer Ludo in your browser — no download, no sign-up, just fun.**

Play the classic board game with 2–4 friends anywhere in the world. Create a room, share a link, and start playing instantly — all powered by Firebase Realtime Database.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🌐 **Real-time Multiplayer** | Firebase-backed — all moves sync instantly across all players |
| 🔗 **Invite by Link** | Share a room code or URL — friends join with one click |
| 🎨 **4 Player Colors** | Red · Green · Yellow · Blue — automatically assigned |
| 🎲 **Animated Dice** | Rolling animation with reveal effect and sound |
| 🏃 **Smooth Piece Animation** | Pieces slide cell-by-cell (Ludo King style) — visible to all players |
| 💥 **Capture Animation** | Captured pieces animate back to their home yard |
| 🔊 **Sound Effects** | Per-step clicks, dice roll, capture, win fanfare — all synthesized (no audio files) |
| ⏱️ **Turn Timer** | 25s to roll + 15s to pick a token — auto-skip on timeout |
| 💬 **In-game Chat** | Firebase-backed chat with emoji bar (desktop sidebar + mobile sheet) |
| 🏆 **Win Screen** | Confetti rain + winner overlay for the victor |
| 💀 **Player Elimination** | Miss 3 turns → eliminated (pieces removed from board) |
| 📱 **Responsive Design** | Works on desktop and mobile |
| 🆓 **Free Forever** | No hidden costs, no accounts required |

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/ludo-online.git
cd ludo-online
```

### 2. Set up Firebase (free, ~5 minutes)

This game uses **Firebase Realtime Database** for multiplayer sync.

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Create a project** → give it a name (e.g. `ludo-game`) → Create
3. In sidebar → **Build** → **Realtime Database** → **Create database**
   - Choose a location → **Start in TEST MODE** → Enable
4. Go to **Project Settings** (⚙️ gear icon) → **Your apps** → Click **Web** (`</>`)
5. Register app (any nickname) → open `js/firebase-config.js` and fill in your credentials

### 3. Open the game

```bash
# Open directly
start index.html

# Or serve locally (recommended)
npx serve .
# then open http://localhost:3000
```

---

## 🎮 How to Play

### Starting a game
1. Click **Create Room** → enter your name → choose 2, 3, or 4 players → **Create & Get Link**
2. Share the room code or link with friends
3. Each player joins → clicks **Ready Up**
4. The host clicks **🚀 Start Game** when all players are ready

### Game rules
- **Roll a 6** to move a piece out of your home yard
- **Move pieces** clockwise around the board toward your home stretch
- **Capture** an opponent's piece by landing on it — they go back to yard (safe squares are immune)
- **Roll again** after rolling a 6, capturing a piece, or sending a piece home
- **Win** by getting all 4 pieces to the center home triangle
- **Miss 3 turns** (timeout or disconnect) → eliminated from the game

### Controls

| Action | How |
|---|---|
| Roll dice | Click the dice area (your turn only) |
| Move a piece | Click any highlighted piece on the board |
| Send a chat message | Type in the chat box → Enter or Send button |
| Add emoji | Click emoji buttons in the chat panel |

---

## 🛠️ Browser Support

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full |
| Firefox 88+ | ✅ Full |
| Safari 14+ | ✅ Full |
| Edge 90+ | ✅ Full |
| Mobile Chrome/Safari | ✅ Full (responsive layout) |

Requires: **Web Audio API** (for sounds), **HTML5 Canvas** (for board), **WebSockets** (Firebase).

---

## 📝 License

MIT — free to use, modify, and distribute.

---

<p align="center">Made with ❤️ — Have fun playing! 🎲</p>
