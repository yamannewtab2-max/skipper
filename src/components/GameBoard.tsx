/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SkipperColor, GameBoardCell } from '../types';
import { COLOR_METADATA, getValidJumpsFromIndex } from '../gameUtils';
import { Sparkles, Flag, ArrowLeftRight } from 'lucide-react';

interface GameBoardProps {
  board: (SkipperColor | null)[];
  currentTurnPlayerId: string;
  selfPlayerId: string;
  activePieceIndex: number | null;
  selectedPieceIndex: number | null;
  onSelectPiece: (index: number) => void;
  onExecuteJump: (startIndex: number, middleIndex: number, endIndex: number) => void;
  onEndTurn: () => void;
  hasJumpedThisTurn: boolean;
  status: string;
  isMyTurn: boolean;
}

export default function GameBoard({
  board,
  currentTurnPlayerId,
  selfPlayerId,
  activePieceIndex,
  selectedPieceIndex,
  onSelectPiece,
  onExecuteJump,
  onEndTurn,
  hasJumpedThisTurn,
  status,
  isMyTurn,
}: GameBoardProps) {

  // Find all valid jumps from currently selected piece
  const currentSelectedValue = activePieceIndex !== null ? activePieceIndex : selectedPieceIndex;
  const validJumps = currentSelectedValue !== null ? getValidJumpsFromIndex(board, currentSelectedValue) : [];
  const validDestinations = validJumps.map((j) => j.endIndex);

  // Generate A-J columns and 1-10 rows
  const colsLetters = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر']; // Beautiful Arabic cell coords

  // Helper to determine board cell background
  const getCellBgClass = (row: number, col: number) => {
    // Elegant alternating checkerboard style
    const isDark = (row + col) % 2 === 1;
    return isDark ? 'bg-slate-950/80' : 'bg-slate-900/80';
  };

  return (
    <div id="game-board-container" className="flex flex-col items-center justify-center bg-slate-900/40 p-4 sm:p-6 rounded-3xl border border-slate-800 shadow-xl select-none">
      
      {/* Board Headers / Turn Info */}
      <div id="game-board-status-info" className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 text-white">
        <div id="active-turn-hint" className="flex items-center gap-2">
          <div className={`w-3.5 h-3.5 rounded-full ${isMyTurn ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'}`} />
          <span className="text-sm font-bold">
            {isMyTurn ? (
              <span className="text-emerald-400">دورك الآن! خطط لقفزاتك بدقة 🧠</span>
            ) : (
              <span className="text-slate-400">انتظر دور الخصم...</span>
            )}
          </span>
        </div>

        {/* Action Controls */}
        <div id="turn-active-actions" className="flex items-center gap-2">
          {hasJumpedThisTurn && isMyTurn && (
            <button
              id="submit-end-turn-btn"
              onClick={onEndTurn}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black px-5 py-2 rounded-2xl text-xs flex items-center gap-1.5 transition duration-150 shadow-lg shadow-amber-500/10 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>إنهاء الدور وتأكيد النقاط</span>
            </button>
          )}
          {hasJumpedThisTurn && isMyTurn && (
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-2 rounded-xl border border-slate-700/50">
              يمكنك مواصلة القفز أو إنهاء الدور
            </span>
          )}
        </div>
      </div>

      {/* Main Board Grid with Row/Col Annotations */}
      <div id="board-grid-wrapper" className="relative p-2.5 sm:p-4 bg-slate-950 rounded-3xl border border-slate-800/80 shadow-2xl w-full max-w-[500px] aspect-square flex flex-col justify-between">
        
        {/* Top Letters Coordinates */}
        <div id="col-letters-top" className="grid grid-cols-10 text-center text-[10px] text-slate-500 font-bold mb-1 font-mono">
          {colsLetters.map((letter) => (
            <span id={`col-letter-${letter}`} key={letter}>{letter}</span>
          ))}
        </div>

        {/* Main Board Grid Area */}
        <div id="board-cells-grid" className="grid grid-cols-10 gap-1 flex-1">
          {Array.from({ length: 100 }).map((_, index) => {
            const row = Math.floor(index / 10);
            const col = index % 10;
            const color = board[index];
            const isSelected = selectedPieceIndex === index || activePieceIndex === index;
            const isTarget = validDestinations.includes(index);
            
            // Check if this piece has any valid jumps (only valid if it's our turn and no chain is active or it is the chained active piece)
            const hasJumps = isMyTurn && (activePieceIndex === null ? getValidJumpsFromIndex(board, index).length > 0 : activePieceIndex === index);
            
            return (
              <div
                id={`cell-${index}`}
                key={index}
                className={`relative aspect-square rounded-lg flex items-center justify-center transition-all duration-300 ${getCellBgClass(row, col)} ${
                  isTarget ? 'cursor-pointer hover:bg-slate-800/50' : ''
                } ${
                  isSelected ? 'ring-2 ring-yellow-400 z-20 scale-[1.02] bg-yellow-400/5' : ''
                }`}
                onClick={() => {
                  if (!isMyTurn) return;
                  if (isTarget && currentSelectedValue !== null) {
                    // Execute jump
                    const jump = validJumps.find((j) => j.endIndex === index);
                    if (jump) {
                      onExecuteJump(jump.startIndex, jump.middleIndex, jump.endIndex);
                    }
                  } else if (color && !hasJumpedThisTurn) {
                    // Allow selecting another piece if hasn't jumped yet this turn
                    if (hasJumps) {
                      onSelectPiece(index);
                    }
                  }
                }}
              >
                {/* Visual coordinate hover hint */}
                <span id={`cell-coord-${index}`} className="absolute top-0.5 right-0.5 text-[6px] text-slate-700/30 font-mono pointer-events-none">
                  {colsLetters[col]}{row + 1}
                </span>

                {/* Target Destination Indicator */}
                {isTarget && (
                  <div id={`target-indicator-${index}`} className="absolute w-7 h-7 sm:w-9 sm:h-9 rounded-full border-2 border-dashed border-yellow-400 flex items-center justify-center animate-pulse bg-yellow-400/10 shadow-lg shadow-yellow-400/5 z-20 pointer-events-none">
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  </div>
                )}

                {/* Skipper Piece */}
                {color && (
                  <button
                    id={`piece-${index}`}
                    disabled={!isMyTurn}
                    className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full relative flex items-center justify-center shadow-lg transition-all duration-300 z-10 ${
                      COLOR_METADATA[color].bg
                    } ${
                      isSelected
                        ? 'ring-4 ring-yellow-400 scale-110 z-30 shadow-lg shadow-yellow-400/50'
                        : isMyTurn && !hasJumpedThisTurn
                        ? 'hover:scale-105 hover:brightness-110 cursor-pointer active:scale-95'
                        : ''
                    } select-none`}
                    style={{
                      boxShadow: 'inset 0 4px 6px rgba(255, 255, 255, 0.4), inset 0 -4px 6px rgba(0, 0, 0, 0.4), 0 4px 10px rgba(0, 0, 0, 0.5)',
                    }}
                  >
                    {/* Concentric inner rings to mimic plastic tokens */}
                    <div id={`inner-ring-1-${index}`} className="absolute inset-1 border border-white/25 rounded-full pointer-events-none flex items-center justify-center">
                      <div id={`inner-ring-2-${index}`} className="w-1/2 h-1/2 border border-black/15 rounded-full" />
                    </div>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Coordinates */}
        <div id="col-letters-bottom" className="grid grid-cols-10 text-center text-[10px] text-slate-600 font-bold mt-1 font-mono">
          {colsLetters.map((letter) => (
            <span id={`col-letter-bottom-${letter}`} key={letter}>{letter}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
