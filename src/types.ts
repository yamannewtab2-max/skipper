/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SkipperColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export interface Player {
  id: string;
  name: string;
  color: string; // Hex or tailwind class for avatar background
  isHost: boolean;
  captured: Record<SkipperColor, number>;
  isActive: boolean;
  photoUrl?: string | null;
  allowViewProgress?: boolean;
  isLocked?: boolean;
}

export interface GameBoardCell {
  index: number;
  row: number;
  col: number;
  color: SkipperColor | null;
}

export type GameMode = 'local_ai' | 'local_pass' | 'online' | 'local_fast_ai';

export type GameStatus = 'setup' | 'waiting' | 'playing' | 'finished';

export interface GameSession {
  id: string;
  status: GameStatus;
  mode: GameMode;
  board: (SkipperColor | null)[]; // length 100
  players: Player[];
  currentTurnPlayerId: string;
  activePieceIndex: number | null; // for tracking multi-jumps in progress
  winnerId: string | null;
  history: string[]; // game logs
  lostPlayers?: Player[];
  aiDifficulty?: 'easy' | 'medium' | 'hard';
  messages?: ChatMessage[];
  createdAt: number;
  lastUpdated: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  recipientId?: string; // undefined means public, otherwise private to that player
}

