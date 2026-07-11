# Ludo Online — Bug Fix Implementation Plan

## Overview
Fix 5 reported bugs + comprehensive game logic hardening. All changes are to game logic and rendering only — no UI layout changes.

---

## Bug 1: Chat Disappearing for V2

**Root Cause:** The `missPlayerTurn()` function (line 322 of room-manager.js) only calls `advanceTurn()` when `newMisses < 3`. When a player is eliminated (3 misses), `advanceTurn()` is **never called**, freezing the game for everyone. This can cause the Firebase room state to become stale, and since chat is tied to the room listener, it can appear broken.

Additionally, the chat message key (`uid_timestamp`) can collide if two messages are sent in the same millisecond, causing overwrites.

### Fix
#### [MODIFY] [room-manager.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/room-manager.js)
- **Line 322-329**: Call `advanceTurn()` after elimination too (when the game isn't already over). Currently it only advances for `newMisses < 3`.
- **Line 443**: Make chat keys unique by adding a random suffix: `${uid}_${ts}_${random}`.

#### [MODIFY] [game-page.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/game-page.js)
- `initChat()`: Add error handling and auto-reconnect for the Firebase chat listener.
- Add a periodic `chatSeen` Set cleanup to prevent unbounded growth.

---

## Bug 2: Piece Moves to Invalid Position

**Root Cause:** The `getValidMoves()` function doesn't check for **own-token collision** on the main path. Two of your own tokens can end up on the same cell. When rendering, `getTokenCell()` returns the correct cell, but the game state now has two tokens at the same position, creating visual and logical confusion.

Also, the `moveToken()` function (room-manager.js) doesn't re-validate the move server-side with `getValidMoves()` — it directly calls `calcNewPos()` and trusts the result.

### Fix
#### [MODIFY] [room-manager.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/room-manager.js)
- **`getValidMoves()`**: Add self-token collision check. Skip moves where the destination already has one of your own tokens (except POS_WON which can hold multiple tokens).
- **`moveToken()`**: Add server-side validation — call `getValidMoves()` and verify the requested `tokenIndex` is among the valid moves before executing.

---

## Bug 3: Piece Can Move After Reaching Home (POS_WON)

**Root Cause:** The `getValidMoves()` function correctly skips `POS_WON` tokens (`if (from === POS_WON) continue`). However, there's a race condition: between when the client calls `moveToken()` and when Firebase propagates the state update, the client's local `roomData` may still show the old token position (e.g., position 57 instead of 58). The user can click the token again during this window.

Additionally, `calcNewPos(57, 1) = 58 = POS_WON` which is valid, but `calcNewPos(58, anything)` returns `58 + dice` which exceeds `POS_WON` and returns `null`. However, `getTokenCell(color, 58)` returns `CENTER_CELL [7,7]`, so a won token appears at the center and **could theoretically be clicked**.

### Fix
#### [MODIFY] [game-page.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/game-page.js)
- **`executeMoveToken()`**: Set a "moving" lock flag that prevents double-clicking while a move is in progress.
- **`handleCanvasClick()`**: Check the lock flag before processing clicks.

#### [MODIFY] [room-manager.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/room-manager.js)
- **`moveToken()`**: Add explicit check `if (fromPos === POS_WON) return` at the start, so the server rejects moves for won tokens even if the client is out of sync.

---

## Bug 4: Incorrect Home Colors (Center Triangles)

**Root Cause:** In `board-renderer.js`, the center triangles are mapped incorrectly:

| Triangle Side | Currently Colored | Should Be |
|---|---|---|
| Top (`[[6,6],[9,6],[cx,cy]]`) | Red | **Green** (home stretch comes from top) |
| Right (`[[9,6],[9,9],[cx,cy]]`) | Green | **Yellow** (home stretch comes from right) |
| Bottom (`[[6,9],[9,9],[cx,cy]]`) | Yellow | **Blue** (home stretch comes from bottom) |
| Left (`[[6,6],[6,9],[cx,cy]]`) | Blue | **Red** (home stretch comes from left) |

The home stretch paths confirm this:
- Red → `[[7,1]..[7,6]]` = row 7, entering from **left**
- Green → `[[1,7]..[6,7]]` = col 7, entering from **top**
- Yellow → `[[7,13]..[7,8]]` = row 7, entering from **right**
- Blue → `[[13,7]..[8,7]]` = col 7, entering from **bottom**

### Fix
#### [MODIFY] [board-renderer.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/board-renderer.js)
- **Lines 186-190**: Swap the color assignments so each triangle matches its home stretch direction:
  - Top triangle → Green
  - Right triangle → Yellow
  - Bottom triangle → Blue
  - Left triangle → Red

---

## Bug 5: Capture Causes Freeze

**Root Cause:** In `moveToken()` (room-manager.js line 239), the capture loop has `break` when it encounters a block (2+ opponent tokens). This `break` exits the **outer** `for..of` loop over all players, meaning if Player A has a block, the code never checks Player B (who might have a single capturable token). However, the block check at lines 202-208 should have already prevented landing there. The real issue is likely that:

1. The move is accepted, the capture is attempted, but `getCellForPosition`/`getTokenCell` comparison fails due to floating-point or coordinate mismatch, causing `capturedSomething` to stay `false`.
2. With `capturedSomething = false`, no extra turn is granted, the turn advances normally — but the captured player's token was not actually sent to yard, so the state is inconsistent.

A more likely cause: `moveToken()` uses `once('value')` (read-then-write, not a transaction), which means if two events fire close together (e.g., timer + click), the move can execute twice or on stale data, corrupting the game state.

### Fix
#### [MODIFY] [room-manager.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/room-manager.js)
- **`moveToken()`**: Change the capture loop's `break` on block to `continue` — it should skip that player but keep checking others (defensive).
- **`moveToken()`**: Add a `diceRolled` guard to reject the move if dice hasn't been rolled or value is null.
- **`moveToken()`**: After writing updates, the function should not be callable again until Firebase confirms the update. Add a `movingLock` check.

---

## Additional Hardening

### [MODIFY] [room-manager.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/room-manager.js)
- Add `fromPos === POS_WON` guard in `moveToken()`
- Validate `tokenIndex` is 0-3
- Validate token position matches expected (not corrupted)

### [MODIFY] [game-page.js](file:///d:/Coding/Ludo%20Online%20Optimized/js/game-page.js)
- Add `isMoving` lock to prevent double-click moves
- Clear `pendingMoves` immediately on move execution (already done, verify)
- Add reconnection handling for room listener

---

## Verification Plan

### Manual Verification
1. Start a 2-player game (Red vs Yellow)
2. Verify center triangles: Red=left, Green=top, Yellow=right, Blue=bottom
3. Play until one piece reaches home stretch — verify it can't move after reaching center
4. Test capture: move one token onto opponent's token, verify capture works and game continues
5. Test chat: send 50+ messages, verify both players can see and send messages throughout
6. Test timer expiry and elimination flow
