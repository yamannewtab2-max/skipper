/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SkipperColor, GameBoardCell, Player } from '../types';
import { COLOR_METADATA, getValidJumpsFromIndex, countCompleteSets } from '../gameUtils';
import { Sparkles, Flag, ArrowLeftRight, Lock, MessageCircle } from 'lucide-react';

interface GameBoardProps {
  board: (SkipperColor | null)[];
  players: Player[];
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
  onTogglePlayerLock?: (playerId: string, isLocked: boolean) => void;
  lostPlayers?: Player[];
  onOpenPrivateChat?: (playerId: string) => void;
  unreadChatPlayerIds?: string[];
}

export default function GameBoard({
  board,
  players,
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
  onTogglePlayerLock,
  lostPlayers,
  onOpenPrivateChat,
  unreadChatPlayerIds,
}: GameBoardProps) {

  // Find all valid jumps from currently selected piece
  const currentSelectedValue = activePieceIndex !== null ? activePieceIndex : selectedPieceIndex;
  const validJumps = currentSelectedValue !== null ? getValidJumpsFromIndex(board, currentSelectedValue) : [];
  const validDestinations = validJumps.map((j) => j.endIndex);

  // Find player whose turn it currently is
  const activePlayer = players.find(p => p.id === currentTurnPlayerId);
  const getTotalCaptured = (player: Player) => {
    return Object.values(player.captured).reduce((sum, count) => sum + count, 0);
  };

  // Players
  const colsLetters = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر']; // Beautiful Arabic cell coords

  // Helper to determine board cell background
  const getCellBgClass = (row: number, col: number) => {
    // Elegant alternating checkerboard style
    const isDark = (row + col) % 2 === 1;
    return isDark ? 'bg-slate-950/80' : 'bg-slate-900/80';
  };

  const renderPlayerCard = (player: Player | undefined, idx: number) => {
    if (!player) return null;
    const isPlayerTurn = player.id === currentTurnPlayerId;
    const isLocked = !!player.isLocked;
    const isSelf = (() => {
      const hasSelfId = players.some(p => p.id === selfPlayerId);
      if (hasSelfId) {
        return player.id === selfPlayerId;
      }
      if (player.id.startsWith('local_p_')) {
        return true;
      }
      return player.id === 'local_p_0';
    })();

    return (
      <div 
        id={`player-gameboard-card-${player.id}`} 
        className={`relative flex flex-col items-center justify-center bg-slate-950/65 p-2 rounded-2xl border transition-all duration-300 w-full select-none ${
          isPlayerTurn 
            ? 'border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)] bg-slate-950/90 scale-105' 
            : 'border-slate-800/50 opacity-80 hover:opacity-100'
        }`}
      >
        {/* Small Lock Button in top right */}
        <button
          id={`player-lock-btn-${player.id}`}
          onClick={(e) => {
            e.stopPropagation();
            if (isSelf) {
              onTogglePlayerLock?.(player.id, !isLocked);
            }
          }}
          className={`absolute top-1.5 right-1.5 p-0.5 rounded-md transition-colors duration-150 ${
            isSelf ? 'cursor-pointer' : 'pointer-events-none opacity-40'
          } ${
            isLocked 
              ? 'text-red-500 hover:text-red-400 bg-red-500/10 border border-red-500/20' 
              : 'text-slate-600 hover:text-slate-400 bg-slate-900/40 border border-transparent'
          }`}
          title={isLocked ? "مغلق / Locked" : "مفتوح / Unlocked"}
        >
          <Lock className="w-3 h-3" />
        </button>

        {/* Small Private Chat Button in top left */}
        {onOpenPrivateChat && !isSelf && (
          <button
            id={`player-chat-btn-${player.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenPrivateChat(player.id);
            }}
            className={`absolute top-1.5 left-1.5 p-0.5 rounded-md transition-all duration-150 cursor-pointer ${
              unreadChatPlayerIds?.includes(player.id)
                ? 'text-red-400 bg-red-500/10 border border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                : 'text-slate-600 hover:text-amber-400 bg-slate-900/40 border border-transparent hover:bg-slate-900/80'
            }`}
            title={`محادثة خاصة مع ${player.name} / Private chat with ${player.name}`}
          >
            <div className="relative flex items-center justify-center">
              <MessageCircle className="w-3 h-3" />
              {unreadChatPlayerIds?.includes(player.id) && (
                <>
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-slate-950 animate-ping" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-slate-950" />
                </>
              )}
            </div>
          </button>
        )}

        {/* Player Avatar / Icon */}
        <div 
          id={`inline-glowing-ring-${player.id}`}
          className={`rounded-full p-0.5 shrink-0 transition duration-500 mb-2 ${
            isPlayerTurn 
              ? 'ring-2 ring-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] bg-amber-500/10' 
              : 'border border-slate-755/50'
          }`}
        >
          {player.photoUrl && player.photoUrl !== 'ai_avatar' ? (
            <img
              src={player.photoUrl}
              alt={player.name}
              className="w-6.5 h-6.5 sm:w-7.5 sm:h-7.5 rounded-full object-cover border border-slate-800"
              referrerPolicy="no-referrer"
            />
          ) : player.photoUrl === 'ai_avatar' ? (
            <div className="w-6.5 h-6.5 sm:w-7.5 sm:h-7.5 rounded-full bg-slate-800 border border-teal-500/20 flex items-center justify-center text-xs shadow-inner">
              🤖
            </div>
          ) : (
            <div className={`w-6.5 h-6.5 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center text-slate-950 font-black text-[9.5px] sm:text-xs ${player.color}`}>
              {player.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Captured colors breakdown directly under the icon */}
        <div className="flex flex-col items-center gap-1.5 w-full">
          {isLocked && !isSelf ? (
            <div className="text-xs font-black text-red-500 py-2 select-none animate-pulse bg-red-500/5 border border-red-500/10 rounded-xl px-4 w-full text-center">
              مقفول 🔒
            </div>
          ) : (
            <>
              {/* Complete Sets Counter & Total Pieces Captured */}
              <div className="text-[8.5px] sm:text-[10px] font-black font-mono leading-none flex items-center justify-center gap-1 select-none">
                <span className="text-amber-400" title={`المجموعات الكاملة: ${countCompleteSets(player.captured)}`}>★{countCompleteSets(player.captured)}</span>
                <span className="text-slate-600 font-normal">|</span>
                <span className="text-teal-400" title={`إجمالي القطع الملتقطة: ${Object.values(player.captured).reduce((sum, v) => sum + v, 0)}`}>⛃{Object.values(player.captured).reduce((sum, v) => sum + v, 0)}</span>
              </div>
              
              {/* Color list breakdown with individual points count */}
              <div className="flex gap-0.5 sm:gap-1 justify-center items-center py-1 bg-slate-900/60 rounded-md px-1 w-full max-w-[105px] sm:max-w-[130px]">
                {(['purple', 'red', 'yellow', 'green', 'blue'] as SkipperColor[]).map((color) => {
                  const count = player.captured[color] || 0;
                  const currentSets = countCompleteSets(player.captured);
                  const targetForNextSet = currentSets + 1;
                  const isMissing = count < targetForNextSet;

                  return (
                    <div 
                      key={color} 
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center transition-all duration-300 ${COLOR_METADATA[color].bg} ${
                        isMissing 
                          ? 'ring-[1.2px] ring-amber-400 ring-offset-[0.5px] ring-offset-slate-950 scale-105 shadow-[0_0_2px_rgba(251,191,36,0.5)] z-10' 
                          : 'opacity-90'
                      }`}
                      title={`${COLOR_METADATA[color].name}: ${count}`}
                    >
                      <span className="text-[8px] sm:text-[10px] text-white font-extrabold leading-none">{count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div id="game-board-container" className="flex flex-col items-center justify-center bg-slate-900/40 p-3 sm:p-5 rounded-3xl border border-slate-800 shadow-xl select-none w-full max-w-[550px] mx-auto gap-4">
      
      {/* Top Row: Player 1 (Top-Left) & Player 2 (Top-Right) */}
      <div id="top-players-row" className="flex justify-between items-center w-full px-2 gap-4">
        <div className="w-[47%]">
          {players[0] && renderPlayerCard(players[0], 0)}
        </div>
        <div className="w-[47%]">
          {players[1] && renderPlayerCard(players[1], 1)}
        </div>
      </div>

      {/* Main Board Grid with Row/Col Annotations */}
      <div id="board-grid-wrapper" className="relative p-2.5 sm:p-4 bg-slate-950 rounded-3xl border border-slate-800/80 shadow-2xl w-full aspect-square flex flex-col justify-between">
        
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

      {/* Bottom Row: Player 3 (Bottom-Left) & Player 4 (Bottom-Right) */}
      {(players[2] || players[3]) && (
        <div id="bottom-players-row" className="flex justify-between items-center w-full px-2 animate-fade-in gap-4">
          <div className="w-[47%]">
            {players[2] && renderPlayerCard(players[2], 2)}
          </div>
          <div className="w-[47%]">
            {players[3] && renderPlayerCard(players[3], 3)}
          </div>
        </div>
      )}

      {/* Action Controls - Placed at the bottom to avoid page shifts/layout jumps */}
      {hasJumpedThisTurn && isMyTurn && (
        <div id="turn-active-actions" className="w-full flex flex-col sm:flex-row items-center justify-center gap-2.5 px-2 mt-2 animate-fade-in">
          <button
            id="submit-end-turn-btn"
            onClick={onEndTurn}
            className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black px-6 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 transition duration-150 shadow-lg shadow-amber-500/20 cursor-pointer w-full sm:w-auto justify-center"
          >
            <Sparkles className="w-3.5 h-3.5 animate-spin-slow" />
            <span>إنهاء الدور وتأكيد النقاط</span>
          </button>
          <span className="text-xs bg-slate-950/80 text-slate-300 px-4 py-2.5 rounded-xl border border-slate-800/80 text-center w-full sm:w-auto font-medium shadow-md">
            يمكنك مواصلة القفز أو إنهاء الدور
          </span>
        </div>
      )}

      {/* Lost / Left Players list */}
      {lostPlayers && lostPlayers.length > 0 && (
        <div id="lost-players-section" className="w-full bg-red-950/10 border border-red-900/25 p-3 rounded-2xl flex flex-col gap-2 mt-2">
          <div className="text-[10px] text-red-400 font-bold tracking-wider flex items-center gap-1.5 justify-center">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span>اللاعبون المنسحبون (خسارة) / Resigned Players</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {lostPlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-1 rounded-xl border border-red-950 text-slate-400 text-[10px] font-bold">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-slate-950 font-black text-[7px] ${p.color}`}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span>{p.name}</span>
                <span className="text-red-500/80 font-normal">(خسر)</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
