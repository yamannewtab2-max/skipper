/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SkipperColor } from './types';

export const SKIPPER_COLORS: SkipperColor[] = ['red', 'blue', 'green', 'yellow', 'purple'];

// Maps color keys to beautiful Arabic names or Hex codes
export const COLOR_METADATA = {
  red: { name: 'أحمر', bg: 'bg-red-500', hex: '#EF4444', text: 'text-red-500', dot: '🔴' },
  blue: { name: 'أزرق', bg: 'bg-blue-600', hex: '#2563EB', text: 'text-blue-600', dot: '🔵' },
  green: { name: 'أخضر', bg: 'bg-emerald-500', hex: '#10B981', text: 'text-emerald-500', dot: '🟢' },
  yellow: { name: 'أصفر', bg: 'bg-amber-400', hex: '#F59E0B', text: 'text-amber-500', dot: '🟡' },
  purple: { name: 'بنفسجي', bg: 'bg-purple-600', hex: '#7C3AED', text: 'text-purple-600', dot: '🟣' },
};

/**
 * Generates an initially shuffled Skippity board
 * Left central 4 cells (44, 45, 54, 55) empty.
 */
export function initializeBoard(): (SkipperColor | null)[] {
  const centralIndices = [44, 45, 54, 55];
  
  // Distribute colors: 96 squares filled. Let's do 19 of each, plus 1 more Purple to total 96.
  const pool: SkipperColor[] = [];
  SKIPPER_COLORS.forEach((color) => {
    const count = color === 'purple' ? 20 : 19;
    for (let i = 0; i < count; i++) {
      pool.push(color);
    }
  });

  // Shuffle pool (Fisher-Yates)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const board: (SkipperColor | null)[] = Array(100).fill(null);
  let poolIndex = 0;

  for (let idx = 0; idx < 100; idx++) {
    if (centralIndices.includes(idx)) {
      board[idx] = null;
    } else {
      board[idx] = pool[poolIndex++];
    }
  }

  return board;
}

export interface JumpMove {
  startIndex: number;
  middleIndex: number;
  endIndex: number;
  capturedColor: SkipperColor;
}

/**
 * Evaluates all valid moves starting from a single index
 */
export function getValidJumpsFromIndex(
  board: (SkipperColor | null)[],
  startIndex: number
): JumpMove[] {
  const color = board[startIndex];
  if (!color) return [];

  const row = Math.floor(startIndex / 10);
  const col = startIndex % 10;
  const jumps: JumpMove[] = [];

  // Directions: [row_offset, col_offset]
  const dirs = [
    [-1, 0], // Up
    [1, 0],  // Down
    [0, -1], // Left
    [0, 1]   // Right
  ];

  for (const [rDir, cDir] of dirs) {
    const mRow = row + rDir;
    const mCol = col + cDir;
    const eRow = row + rDir * 2;
    const eCol = col + cDir * 2;

    // Check bounds for middle and end positions
    if (mRow >= 0 && mRow < 10 && mCol >= 0 && mCol < 10 &&
        eRow >= 0 && eRow < 10 && eCol >= 0 && eCol < 10) {
      
      const middleIdx = mRow * 10 + mCol;
      const endIdx = eRow * 10 + eCol;

      const middleColor = board[middleIdx];
      const endColor = board[endIdx];

      // Jump rule: middle must have a piece, and end must be empty
      if (middleColor && !endColor) {
        jumps.push({
          startIndex,
          middleIndex: middleIdx,
          endIndex: endIdx,
          capturedColor: middleColor
        });
      }
    }
  }

  return jumps;
}

/**
 * Checks if the piece is at the outer border of the 10x10 board.
 */
export function isIndexOnOuterBorder(index: number): boolean {
  // Discard/Disabled edge rule as requested by the user
  return false;
}

/**
 * Scans the entire board to see if there is any valid jump move.
 */
export function hasAnyValidJumpsLeft(board: (SkipperColor | null)[]): boolean {
  for (let idx = 0; idx < 100; idx++) {
    if (board[idx]) {
      const jumps = getValidJumpsFromIndex(board, idx);
      if (jumps.length > 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculates complete sets from a captures record.
 * A complete set has at least 1 of each color.
 */
export function countCompleteSets(captured?: Record<SkipperColor, number>): number {
  if (!captured) return 0;
  return Math.min(
    captured.red || 0,
    captured.blue || 0,
    captured.green || 0,
    captured.yellow || 0,
    captured.purple || 0
  );
}

/**
 * A highly effective computer AI decision maker supporting Easy, Medium, and Hard difficulties
 */
export function computeBestMoveForAI(
  board: (SkipperColor | null)[],
  aiCaptured: Record<SkipperColor, number>,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): { jumps: JumpMove[] } | null {
  // We want to find jumps that maximize AI's completed sets, or capture colors that AI is missing.
  // We will run a depth search or greedy heuristic search.
  // Let's list all first-hop jumps
  const allMoves: JumpMove[] = [];
  for (let idx = 0; idx < 100; idx++) {
    if (board[idx]) {
      allMoves.push(...getValidJumpsFromIndex(board, idx));
    }
  }

  if (allMoves.length === 0) return null;

  // Let me rate each candidate sequence of jumps!
  interface JumpSequence {
    moves: JumpMove[];
    simulatedCaptures: Record<SkipperColor, number>;
    movedColor: SkipperColor;
  }

  const sequences: JumpSequence[] = [];

  // Helper to search all paths starting from a parent move
  function searchPaths(
    currentBoard: (SkipperColor | null)[],
    currentMove: JumpMove,
    accumulatedMoves: JumpMove[],
    currentCaptures: Record<SkipperColor, number>
  ) {
    const nextMoves = [...accumulatedMoves, currentMove];
    const nextCaptures = { ...currentCaptures };
    nextCaptures[currentMove.capturedColor] = (nextCaptures[currentMove.capturedColor] || 0) + 1;

    // Simulate board update for this step
    const tempBoard = [...currentBoard];
    const activeColor = tempBoard[currentMove.startIndex];
    tempBoard[currentMove.startIndex] = null;
    tempBoard[currentMove.middleIndex] = null;
    tempBoard[currentMove.endIndex] = activeColor;

    // Find subsequent jumps for this specific piece ONLY
    const nextJumps = getValidJumpsFromIndex(tempBoard, currentMove.endIndex);

    if (nextJumps.length === 0) {
      // Leaf node - save sequence
      sequences.push({
        moves: nextMoves,
        simulatedCaptures: nextCaptures,
        movedColor: activeColor as SkipperColor
      });
    } else {
      // Limit recursion to avoid stack depth in complex layouts, standard turns usually have 1-4 jumps max
      if (nextMoves.length >= 4) {
        sequences.push({
          moves: nextMoves,
          simulatedCaptures: nextCaptures,
          movedColor: activeColor as SkipperColor
        });
        return;
      }
      
      for (const nextJump of nextJumps) {
        searchPaths(tempBoard, nextJump, nextMoves, nextCaptures);
      }
      // Also register current as a stop action
      sequences.push({
        moves: nextMoves,
        simulatedCaptures: nextCaptures,
        movedColor: activeColor as SkipperColor
      });
    }
  }

  // Generate sequences starting from each possible direct jump
  for (const move of allMoves) {
    searchPaths(board, move, [], { ...aiCaptured });
  }

  // Support difficulties
  if (difficulty === 'easy') {
    // Easy level: Pick a random sequence, preferring short moves (length <= 2)
    const simpleSeqs = sequences.filter(s => s.moves.length <= 2);
    const pool = simpleSeqs.length > 0 ? simpleSeqs : sequences;
    const randomSeq = pool[Math.floor(Math.random() * pool.length)];
    if (!randomSeq) return null;
    return {
      jumps: randomSeq.moves
    };
  }

  // Medium level: "تفكير بقل بشري بيعرف يلعب"
  if (difficulty === 'medium') {
    // Limit sequence length to max 3 (realistic human-scale layout planning)
    const humanScaleSeqs = sequences.filter(s => s.moves.length <= 3);
    const pool = humanScaleSeqs.length > 0 ? humanScaleSeqs : sequences;

    const scoredPool = pool.map(seq => {
      const initialSets = countCompleteSets(aiCaptured);
      const finalCaptures = { ...seq.simulatedCaptures };
      const finalSets = countCompleteSets(finalCaptures);
      const setsGained = finalSets - initialSets;

      let balanceScore = 0;
      for (const color of SKIPPER_COLORS) {
        const currentCount = aiCaptured[color] || 0;
        const finalCount = finalCaptures[color] || 0;
        const gained = finalCount - currentCount;
        if (gained > 0) {
          if (currentCount === 0) {
            balanceScore += gained * 8;
          } else if (currentCount === 1) {
            balanceScore += gained * 3;
          } else {
            balanceScore += gained * 1;
          }
        }
      }

      const totalPiecesGained = seq.moves.length;
      const score = (setsGained * 50) + balanceScore + (totalPiecesGained * 0.5);
      return { seq, score };
    }).sort((a, b) => b.score - a.score);

    if (scoredPool.length === 0) return null;

    // Pick top-1 with 85% probability, and with 15% probability pick another top-3 move
    const pickIndex = (Math.random() < 0.85 || scoredPool.length < 2) 
      ? 0 
      : Math.min(scoredPool.length - 1, Math.floor(Math.random() * Math.min(3, scoredPool.length)));
    
    const selectedSeq = scoredPool[pickIndex].seq;
    return {
      jumps: selectedSeq.moves
    };
  }

  // Hard level: Fully optimize (highest sets gained, then balance weights, then deep check of up to 4 chain jumps)
  let bestScore = -999999;
  let bestSequence: JumpSequence | null = null;

  for (const seq of sequences) {
    const initialSets = countCompleteSets(aiCaptured);
    const finalCaptures = { ...seq.simulatedCaptures };
    const finalSets = countCompleteSets(finalCaptures);
    const setsGained = finalSets - initialSets;

    let balanceScore = 0;
    for (const color of SKIPPER_COLORS) {
      const currentCount = aiCaptured[color] || 0;
      const finalCount = finalCaptures[color] || 0;
      const gained = finalCount - currentCount;
      if (gained > 0) {
        if (currentCount === 0) {
          balanceScore += gained * 8;
        } else if (currentCount === 1) {
          balanceScore += gained * 3;
        } else {
          balanceScore += gained * 1;
        }
      }
    }

    const totalPiecesGained = seq.moves.length;
    const score = (setsGained * 50) + balanceScore + (totalPiecesGained * 0.5);

    if (score > bestScore) {
      bestScore = score;
      bestSequence = seq;
    }
  }

  if (!bestSequence) return null;

  return {
    jumps: bestSequence.moves
  };
}
