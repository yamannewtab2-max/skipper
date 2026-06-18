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
}

export interface GameBoardCell {
  index: number;
  row: number;
  col: number;
  color: SkipperColor | null;
}

export type GameMode = 'local_ai' | 'local_pass' | 'online';

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
  aiDifficulty?: 'easy' | 'medium' | 'hard';
  createdAt: number;
  lastUpdated: number;
}
