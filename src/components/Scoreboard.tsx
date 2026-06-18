/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Player, SkipperColor } from '../types';
import { COLOR_METADATA, countCompleteSets, SKIPPER_COLORS } from '../gameUtils';
import { Trophy, User, Key, Eye } from 'lucide-react';

interface ScoreboardProps {
  players: Player[];
  currentTurnPlayerId: string;
  selfPlayerId: string;
}

export default function Scoreboard({ players, currentTurnPlayerId, selfPlayerId }: ScoreboardProps) {
  // Sort players by complete sets descending to show rankings, or preserve seat order?
  // Let's preserve seat order but display rank badges, or sort for convenience. Sorting is excellent for game flow!
  // Preserve seat order so that player boards/cards do not move around or shift
  const sortedPlayers = players;

  return (
    <div id="scoreboard-container" className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white text-right font-sans shadow-xl h-full">
      <div id="scoreboard-header" className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <span className="text-xs text-amber-400 font-bold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/15">
          كل مجموعة كاملة = نقطة واحدة
        </span>
        <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
          <span>🏆 ترتيب اللاعبين والنتائج</span>
          <Trophy className="w-4 h-4 text-amber-400" />
        </h3>
      </div>

      <div id="scoreboard-players-list" className="space-y-4">
        {sortedPlayers.map((player, index) => {
          const sets = countCompleteSets(player.captured);
          const isCurrentTurn = player.id === currentTurnPlayerId;
          const isSelf = player.id === selfPlayerId;
          
          // Calculate total pieces
          const totalPieces = Object.values(player.captured).reduce((sum, val) => sum + val, 0);

          return (
            <div
              id={`player-card-${player.id}`}
              key={player.id}
              className={`p-4 rounded-2xl border transition-all duration-300 relative ${
                isCurrentTurn
                  ? 'bg-slate-950 border-amber-500/80 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                  : 'bg-slate-950/40 border-slate-800/80'
              } ${isSelf ? 'bg-gradient-to-l from-slate-900 to-slate-950' : ''}`}
            >
              {/* Turn glow indicator */}
              {isCurrentTurn && (
                <div id={`turn-glow-${player.id}`} className="absolute top-3 left-3 flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-full text-[10px] font-black animate-pulse">
                  <span>دوره الآن ⚡</span>
                </div>
              )}

              {/* Player Identifier */}
              <div id={`player-identity-${player.id}`} className="flex items-center justify-between mb-3">
                <div id={`player-status-meta-${player.id}`} className="flex items-center gap-1.5 text-xs text-slate-400">
                  {player.isHost && (
                    <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5">
                      <Key className="w-2.5 h-2.5" />
                      مضيف
                    </span>
                  )}
                  {isSelf && (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold">
                      أنت
                    </span>
                  )}
                  <span className="font-mono text-[10px] bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-300 text-left">
                    {totalPieces} قطة
                  </span>
                </div>

                <div id={`player-name-wrapper-${player.id}`} className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-slate-200">
                    {player.name}
                  </span>
                  <div
                    id={`player-avatar-${player.id}`}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-slate-900 font-bold text-xs ${player.color}`}
                  >
                    {index + 1}
                  </div>
                </div>
              </div>

              {/* Score summary & Set Tracker */}
              <div id={`set-summaries-${player.id}`} className="grid grid-cols-2 gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-950/80 mb-3">
                <div id={`total-sets-${player.id}`} className="text-left font-mono">
                  <span className="text-slate-400 text-[10px] block">المجموعات الكاملة</span>
                  <span className="text-lg font-black text-amber-400">{sets}</span>
                </div>
                <div id={`completion-status-${player.id}`} className="text-right">
                  <span className="text-slate-400 text-[10px] block">جودة التجميع</span>
                  <span className="text-xs font-bold text-slate-300">
                    {sets === 0 ? 'ابدأ التجميع ⏳' : `${sets} نقاط كاملة`}
                  </span>
                </div>
              </div>

              {/* Captured piece columns (Red, Blue, Green, Yellow, Purple) */}
              <div id={`captured-breakdown-${player.id}`} className="grid grid-cols-5 gap-1.5 pt-1">
                {SKIPPER_COLORS.map((color) => {
                  const count = player.captured[color] || 0;
                  const isMissingForNextSet = count === sets; // Highlight colors needed to advance sets
                  const metadata = COLOR_METADATA[color];

                  return (
                    <div
                      id={`captured-color-${player.id}-${color}`}
                      key={color}
                      className={`flex flex-col items-center justify-center py-1.5 rounded-xl border transition-all duration-150 ${
                        isMissingForNextSet
                          ? 'bg-amber-500/5 border-amber-500/20'
                          : 'bg-slate-900/40 border-slate-800/50'
                      }`}
                    >
                      <span className="text-sm shrink-0">{metadata.dot}</span>
                      <span className="font-mono text-xs font-black text-white mt-1">
                        {count}
                      </span>
                      {isMissingForNextSet && (
                        <span className="text-[8px] text-amber-400 font-bold mt-0.5 animate-pulse">
                          مطلوب!
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
