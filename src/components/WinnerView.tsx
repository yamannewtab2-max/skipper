/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Player } from '../types';
import { countCompleteSets, COLOR_METADATA } from '../gameUtils';
import { Trophy, RefreshCw, Home, Sparkles } from 'lucide-react';

interface WinnerViewProps {
  players: Player[];
  onRestart: () => void;
  onGoHome: () => void;
}

export default function WinnerView({ players, onRestart, onGoHome }: WinnerViewProps) {
  // Sort players by complete sets descending, then by total pieces count descending
  const sorted = players && players.length > 0 ? [...players].sort((a, b) => {
    const setsA = countCompleteSets(a?.captured);
    const setsB = countCompleteSets(b?.captured);
    if (setsB !== setsA) return setsB - setsA;

    const totalA = Object.values(a?.captured || {}).reduce((sum, val) => sum + val, 0);
    const totalB = Object.values(b?.captured || {}).reduce((sum, val) => sum + val, 0);
    return totalB - totalA;
  }) : [];

  const winner = sorted[0];
  const isTie = sorted.length > 1 && 
    countCompleteSets(sorted[0]?.captured) === countCompleteSets(sorted[1]?.captured) &&
    Object.values(sorted[0]?.captured || {}).reduce((sum, v) => sum + v, 0) === Object.values(sorted[1]?.captured || {}).reduce((sum, v) => sum + v, 0);

  if (sorted.length === 0) {
    return (
      <div id="winner-view-root" className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white text-center">
        <h2 className="text-xl font-black text-slate-400">لا توجد بيانات للمباراة</h2>
        <button onClick={onGoHome} className="mt-4 bg-slate-800 text-white p-2 rounded">العودة للرئيسية</button>
      </div>
    );
  }

  return (
    <div id="winner-view-root" className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white text-right font-sans shadow-2xl relative overflow-hidden animate-fade-in">
      <div id="winner-glow-1" className="absolute top-0 right-0 w-32 h-32 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
      <div id="winner-glow-2" className="absolute bottom-0 left-0 w-32 h-32 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Icon */}
      <div id="winner-trophy-hero" className="flex flex-col items-center justify-center text-center mt-4 mb-6">
        <div id="trophy-badge" className="bg-amber-500/10 p-5 rounded-full border border-amber-500/25 text-amber-400 mb-4 animate-bounce">
          <Trophy className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-black text-amber-400">
          {isTie ? 'تعادل رائع! 🎉' : 'انتهت المباراة! 🏆'}
        </h2>
        <p className="text-slate-400 text-xs font-semibold mt-1">
          {isTie 
            ? 'تساوت المهارات في هذه الجولة!' 
            : `اللاعب ${winner.name} هو الفائز بهذه الجولة!`}
        </p>
      </div>

      {/* Leader / Winner Highlight Card */}
      {!isTie && (
        <div id="winner-highlight-card" className="bg-gradient-to-l from-slate-950 via-slate-950/80 to-slate-900 p-5 rounded-2xl border border-amber-500/30 text-center mb-6 relative">
          <div className="absolute top-3 right-3 text-sm">✨</div>
          <span className="text-xs text-amber-400 font-bold block mb-1">المركز الأول بطل الطاولة</span>
          <h3 className="text-xl font-extrabold text-white flex items-center justify-center gap-2">
            <span>{winner.name}</span>
          </h3>
          <div className="mt-2.5 flex items-center justify-center gap-4 text-xs text-slate-300">
            <span className="bg-slate-900 px-3 py-1.5 rounded-lg font-bold border border-slate-800/80">
              المجموعات الكاملة: <strong className="text-amber-400 font-bold text-sm">{countCompleteSets(winner?.captured)}</strong>
            </span>
            <span className="bg-slate-900 px-3 py-1.5 rounded-lg text-slate-400 font-bold border border-slate-800/80">
              إجمالي القطع المأسورة: <strong className="text-white text-sm font-mono">{Object.values(winner?.captured || {}).reduce((sum, v) => sum + v, 0)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Leaderboard list */}
      <div id="winner-leaderboard-recap" className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 mb-6">
        <h4 className="text-xs font-bold text-slate-400 mb-3 text-right">📊 النتيجة النهائية لجميع اللاعبين</h4>
        
        <div className="space-y-2">
          {sorted.map((player, index) => {
            const playerSets = countCompleteSets(player?.captured);
            const playerTotalPieces = Object.values(player?.captured || {}).reduce((sum, v) => sum + v, 0);

            return (
              <div
                id={`recap-row-${player.id}`}
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  index === 0 && !isTie
                    ? 'bg-slate-900/60 border-amber-500/20'
                    : 'bg-slate-900/40 border-slate-800/80'
                }`}
              >
                {/* Total Details */}
                <div id={`recap-metrics-${player.id}`} className="flex items-center gap-3 font-mono text-sm">
                  <span className="text-slate-400 text-xs">
                     {playerTotalPieces} قطع
                  </span>
                  <span className="bg-slate-950 text-amber-400 border border-slate-800/60 font-black px-2.5 py-0.5 rounded text-xs">
                     {playerSets} مج. كاملة
                  </span>
                </div>

                {/* Player details */}
                <div id={`recap-profile-wrap-${player.id}`} className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-200">
                    {player.name}
                  </span>
                  <div id={`recap-rank-${player.id}`} className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {index + 1}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div id="winner-action-buttons" className="grid grid-cols-2 gap-3">
        <button
          id="winner-go-home-btn"
          onClick={onGoHome}
          className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
        >
          <Home className="w-4 h-4" />
          <span>القائمة الرئيسية</span>
        </button>
        <button
          id="winner-restart-btn"
          onClick={onRestart}
          className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-amber-500/10 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>جولة جديدة 🔄</span>
        </button>
      </div>

    </div>
  );
}
