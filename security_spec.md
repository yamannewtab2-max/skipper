# Security Specification for Skippity Game

This document outlines the security specifications and testing payloads (the "Dirty Dozen") designed to verify that the Firestore Security Rules are completely secure.

## 1. Data Invariants
1. **Authenticated Users Only**: To create, join, or modify a game, the client must be an authenticated user.
2. **Identification Integrity**: A player can only write objects where their participant ID corresponds to their own `request.auth.uid`.
3. **Immutability of Historical Timestamps**: The `createdAt` field cannot be altered once the game is created.
4. **Terminal State Locking**: Once a game session `status` becomes `'finished'`, no further updates can be made to the `board`, `players`, or `currentTurnPlayerId`.
5. **No Blind Deletion**: Game deletion is forbidden unless done by the host before a game starts, or completely restricted. We'll restrict deletes to the host or block them entirely for security.
6. **Room Code Format Verification**: Room codes must be strings of exactly 5 alphanumeric characters.

## 2. The "Dirty Dozen" Malicious Payloads
The following payloads are explicitly designed to breach the system's security. They must be mathematically rejected by the security rules:

1. **Self-Turn Looting (Identity Spoofing)**: An external anonymous or non-member user trying to change the active piece index or turn.
2. **Ghost Player Injection (State Bypass)**: A user joining the game with a fake player ID that does not match their logged-in auth UID.
3. **Board-Wiping Attack (Value Poisoning)**: An active player resetting the `board` back to empty cells during a losing match.
4. **Altering Creation Date (Time Spoofing)**: A user modifying the `createdAt` timestamp to block chronological sorting.
5. **History Trash-Filling (Resource Poisoning)**: A malicious user sending a 1MB history entry to exhaust reading speed.
6. **Multiplayer Over-Registration**: Adding 5 players to a session, bypassing the 4-player ceiling constraint.
7. **Post-Game Move (Terminal State Locking)**: A player attempting to modify the board layout after the game is set to `'finished'`.
8. **Shadow Field Injection**: Adding custom fields (`isVerifiedAdmin: true`, `scoreMultiplier: 99`) into the document during a join action.
9. **Fake Game Claiming**: Creating a new room where the host player ID in the payload does not match the actual authenticated user ID of the runner.
10. **State Machine Shortcutting**: Bypassing `'setup'` / `'waiting'` phase and directly declaring the game as `'finished'` with their own ID as `winnerId`.
11. **Mass Deletion Attack**: An arbitrary player attempting to call drop/delete on a room created by someone else.
12. **Blind Collection Scrapes (Query Trust Attack)**: Querying all games without specifying a proper player association where clause, attempting to scan active room sessions.

## 3. Recommended Tests
A mock runner checks these conditions by executing Firestore SDK calls using insecure parameters to verify rejection. Let's make sure the rules are extremely safe.
