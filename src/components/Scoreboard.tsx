/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Player, SkipperColor } from '../types';
import { COLOR_METADATA, countCompleteSets, SKIPPER_COLORS } from '../gameUtils';
import { Trophy, Key, Lock } from 'lucide-react';

interface ScoreboardProps {
  players: Player[];
  currentTurnPlayerId: string;
  selfPlayerId: string;
}

export default function Scoreboard({ players, currentTurnPlayerId, selfPlayerId }: ScoreboardProps) {
  // We keep track of which player's progress is expanded.
  // By default, the self player has their progress expanded.
  const [expandedProgressIds, setExpandedProgressIds] = useState<Record<string, boolean>>({
    [selfPlayerId]: true
  });

  const handleProfileClick = (pId: string) => {
    setExpandedProgressIds(prev => ({
      ...prev,
      [pId]: !prev[pId]
    }));
  };

  return (
    <div id="scoreboard-container" className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white text-right font-sans shadow-xl h-full select-none">
      <div id="scoreboard-header" className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <span className="text-[10px] sm:text-xs text-amber-400 font-bold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/15">
          كل مجموعة كاملة = نقطة واحدة
        </span>
        <h3 className="text-sm sm:text-base font-extrabold text-slate-100 flex items-center gap-2">
          <span>🏆 ترتيب اللاعبين والنتائج</span>
          <Trophy className="w-4 h-4 text-amber-400" />
        </h3>
      </div>

      <div id="scoreboard-players-list" className="space-y-4">
        {players.map((player, index) => {
          const sets = countCompleteSets(player.captured);
          const isCurrentTurn = player.id === currentTurnPlayerId;
          const hasSelfId = players.some(p => p.id === selfPlayerId);
          const isSelf = hasSelfId ? (player.id === selfPlayerId) : (index === 0);
          const isExpanded = !!expandedProgressIds[player.id];
          const canViewProgress = player.allowViewProgress !== false || isSelf;

          // Calculate total pieces
          const totalPieces = Object.values(player.captured).reduce((sum, val) => sum + val, 0);

          return (
            <div
              id={`player-card-${player.id}`}
              key={player.id}
              className={`p-4 rounded-2xl border transition-all duration-300 relative ${
                isCurrentTurn
                  ? 'bg-slate-950 border-amber-500/80 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/35'
                  : 'bg-slate-950/40 border-slate-800/80'
              } ${isSelf ? 'bg-gradient-to-l from-slate-900 to-slate-950' : ''}`}
            >
              {/* Turn glow indicator */}
              {isCurrentTurn && (
                <div id={`turn-glow-${player.id}`} className="absolute top-3 left-3 flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-full text-[10px] font-black animate-pulse">
                  <span>دوره الآن ⚡</span>
                </div>
              )}

              {/* Player Row Card Top - Clickable for details display */}
              <div 
                id={`player-row-clickable-${player.id}`}
                onClick={() => handleProfileClick(player.id)}
                className="flex items-center justify-between cursor-pointer hover:bg-slate-900/40 p-1.5 -m-1.5 rounded-xl transition duration-150"
                title="اضغط لعرض أو إخفاء التقدم الشخصي والقطع"
              >
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
                  {canViewProgress ? (
                    <span className="font-mono text-[10px] bg-slate-850 px-1.5 py-0.5 rounded text-slate-300">
                      {totalPieces} قطة
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-850/50 text-slate-500 px-1.5 py-0.5 rounded flex items-center gap-0.5" title="الخصوصية مفعلة">
                      🔒 مخفي
                    </span>
                  )}
                </div>

                {/* Profile wrapper with Golden Glowing Ring if it is his turn */}
                <div id={`player-name-wrapper-${player.id}`} className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-extrabold text-sm text-slate-200 block">
                      {player.name}
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      {isExpanded ? 'انقر للطي 🔼' : 'انقر للتفاصيل 🔽'}
                    </span>
                  </div>

                  {/* Golden Glowing Ring around player turn profile */}
                  <div 
                    id={`player-profile-ring-${player.id}`}
                    className={`relative rounded-full p-0.5 transition duration-500 ${
                      isCurrentTurn 
                        ? 'ring-2 ring-amber-450 shadow-[0_0_12px_rgba(245,158,11,0.7)] bg-amber-500/15 scale-105' 
                        : 'border border-slate-700/50'
                    }`}
                  >
                    {player.photoUrl && player.photoUrl !== 'ai_avatar' ? (
                      <img
                        id={`player-profile-img-${player.id}`}
                        src={player.photoUrl}
                        alt={player.name}
                        className="w-9 h-9 rounded-full object-cover border border-slate-800"
                        referrerPolicy="no-referrer"
                      />
                    ) : player.photoUrl === 'ai_avatar' ? (
                      <div id={`player-ai-img-${player.id}`} className="w-9 h-9 rounded-full bg-slate-800 border border-teal-500/25 flex items-center justify-center text-lg shadow-inner">
                        🤖
                      </div>
                    ) : (
                      <div
                        id={`player-letter-img-${player.id}`}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-slate-950 font-black text-sm shadow-md ${player.color}`}
                      >
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress and Captured Piece Breakdown Container */}
              {isExpanded && (
                <div id={`expanded-progress-card-${player.id}`} className="mt-3 pt-3 border-t border-slate-800/80 space-y-3">
                  {canViewProgress ? (
                    <>
                      {/* Score summary & Set Tracker */}
                      <div id={`set-summaries-${player.id}`} className="grid grid-cols-2 gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-950/80">
                        <div id={`total-sets-${player.id}`} className="text-left font-mono">
                          <span className="text-slate-400 text-[10px] block">المجموعات الكاملة</span>
                          <span className="text-base font-black text-amber-400">{sets}</span>
                        </div>
                        <div id={`completion-status-${player.id}`} className="text-right">
                          <span className="text-slate-400 text-[10px] block">جودة التجميع</span>
                          <span className="text-xs font-bold text-slate-300">
                            {sets === 0 ? 'لا مجموعات ⏳' : `${sets} نقاط كاملة`}
                          </span>
                        </div>
                      </div>

                      {/* Captured piece columns (Red, Blue, Green, Yellow, Purple) */}
                      <div id={`captured-breakdown-${player.id}`} className="grid grid-cols-5 gap-1.5">
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
                                  ? 'bg-amber-500/5 border-amber-500/25'
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
                    </>
                  ) : (
                    /* Locked State if View Progress allows is false */
                    <div id={`locked-progress-overlay-${player.id}`} className="flex flex-col items-center justify-center p-4 bg-slate-950/80 rounded-xl border border-red-500/10 text-center space-y-1.5">
                      <Lock className="w-5 h-5 text-red-400/80 animate-pulse" />
                      <p className="text-xs text-slate-300 font-extrabold">تفاصيل التقدم مقفلة 🔒</p>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        رفض اللاعب "{player.name}" تفعيل خيار مشاركة لوحة تقدمه التفصيلي مع المنافسين.
                      </p>
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
