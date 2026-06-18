/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameMode } from '../types';
import { COLOR_METADATA } from '../gameUtils';
import { 
  Users, 
  Cpu, 
  UserSquare2, 
  Play, 
  HelpCircle, 
  Sparkles, 
  ArrowLeftRight, 
  Copy, 
  Check, 
  Home, 
  BookOpen 
} from 'lucide-react';

interface LobbyProps {
  onStartLocalGame: (mode: 'local_ai' | 'local_pass', customNames: string[], difficulty?: 'easy' | 'medium' | 'hard') => void;
  onCreateOnlineGame: (playerName: string, avatarColor: string) => void;
  onJoinOnlineGame: (roomCode: string, playerName: string, avatarColor: string) => void;
  roomCodeFromUrl: string | null;
  isLoading: boolean;
  errorMsg: string | null;
  onToggleHowToPlay: () => void;
}

const AVATAR_COLORS = [
  'bg-amber-400 text-slate-950',
  'bg-emerald-400 text-slate-950',
  'bg-indigo-500 text-white',
  'bg-pink-500 text-white',
  'bg-sky-400 text-slate-950',
  'bg-violet-500 text-white'
];

export default function Lobby({
  onStartLocalGame,
  onCreateOnlineGame,
  onJoinOnlineGame,
  roomCodeFromUrl,
  isLoading,
  errorMsg,
  onToggleHowToPlay,
}: LobbyProps) {
  // Read name from localStorage on mount
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('skippity_player_name') || '';
  });
  const [avatarColor, setAvatarColor] = useState(() => {
    const saved = localStorage.getItem('skippity_avatar_color');
    return saved || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  });

  const [activeTab, setActiveTab] = useState<'online' | 'local_ai' | 'local_pass'>('online');
  const [inputRoomCode, setInputRoomCode] = useState(roomCodeFromUrl || '');
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  // Local Pass & Play state
  const [passPlayPlayerCount, setPassPlayPlayerCount] = useState<2 | 3 | 4>(2);
  const [passPlayNames, setPassPlayNames] = useState<string[]>(['اللاعب 1', 'اللاعب 2', '', '']);

  // Persist name and avatar color change
  useEffect(() => {
    localStorage.setItem('skippity_player_name', playerName);
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem('skippity_avatar_color', avatarColor);
  }, [avatarColor]);

  const handleCreateOnline = () => {
    const finalName = playerName.trim() || 'المستضيف';
    onCreateOnlineGame(finalName, avatarColor);
  };

  const handleJoinOnline = () => {
    const finalName = playerName.trim() || 'اللاعب الزائر';
    const finalCode = inputRoomCode.trim().toUpperCase();
    if (!finalCode) return;
    onJoinOnlineGame(finalCode, finalName, avatarColor);
  };

  const handleStartAI = () => {
    const finalName = playerName.trim() || 'لاعب بشري';
    onStartLocalGame('local_ai', [finalName, 'الكمبيوتر الذكي 🤖'], aiDifficulty);
  };

  const handleStartPassPlay = () => {
    const namesList: string[] = [];
    for (let i = 0; i < passPlayPlayerCount; i++) {
      namesList.push(passPlayNames[i]?.trim() || `اللاعب ${i + 1}`);
    }
    onStartLocalGame('local_pass', namesList);
  };

  return (
    <div id="lobby-root" className="w-full max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white text-right font-sans shadow-2xl relative overflow-hidden">
      {/* Decorative gradient overlay */}
      <div id="lobby-glow" className="absolute top-0 right-0 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div id="lobby-glow-2" className="absolute bottom-0 left-0 w-44 h-44 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main App Branding Header */}
      <div id="lobby-header" className="text-center mb-8 border-b border-slate-800 pb-6 relative z-10">
        <div id="lobby-sk-logo" className="flex items-center justify-center gap-1.5 mb-2 hover:scale-105 transition duration-300">
          <span className="text-3xl font-extrabold tracking-wider bg-gradient-to-l from-amber-400 via-pink-400 to-violet-400 bg-clip-text text-transparent">
            SKIPPITY
          </span>
          <div className="flex gap-0.5 animate-bounce">
            <span className="text-xl">🔴</span>
            <span className="text-xl">🔵</span>
            <span className="text-xl">🟢</span>
          </div>
        </div>
        <p className="text-slate-400 text-xs font-semibold leading-relaxed">
          لعبة الأسر والذكاء الشهيرة • جميع اللاعبين يتشاركون القطع • اصنع مجموعات الألوان لتفوز!
        </p>
      </div>

      {/* User Information Setup */}
      <div id="lobby-user-profile" className="bg-slate-950/70 border border-slate-800/80 p-5 rounded-2xl mb-6 relative z-10">
        <h3 className="text-xs font-bold text-slate-400 mb-3 block">🧑‍💻 بياناتك الشخصية</h3>
        
        <div className="space-y-4">
          <div>
            <label id="lbl-usr-name" className="text-xs text-slate-300 mb-1.5 block">اسمك المستعار:</label>
            <input
              id="lobby-username-input"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 18))}
              placeholder="اكتب اسمك هنا (مثلاً: رامي، جود...)"
              className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-sm text-right outline-none text-white transition placeholder-slate-600"
            />
          </div>

          <div>
            <label id="lbl-usr-color" className="text-xs text-slate-300 mb-2 block">لونك المفضل لرمز اللعب والنتيجة:</label>
            <div id="avatar-color-picker-grid" className="grid grid-cols-6 gap-2">
              {AVATAR_COLORS.map((col) => {
                const isSelected = avatarColor === col;
                return (
                  <button
                    id={`color-picker-btn-${col.replace(/[^a-zA-Z]/g, '')}`}
                    key={col}
                    onClick={() => setAvatarColor(col)}
                    className={`h-11 rounded-xl text-center flex items-center justify-center text-lg font-bold transition duration-200 border cursor-pointer ${col} ${
                      isSelected ? 'ring-4 ring-amber-400 border-transparent scale-105 shadow-lg' : 'border-slate-850 hover:opacity-85'
                    }`}
                  >
                    🎲
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Invite Code detected Banner */}
      {roomCodeFromUrl && (
        <div id="url-invitation-detected-banner" className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl mb-6 flex items-center justify-between text-right relative z-10 animate-pulse">
          <button
            id="join-url-room-hot-btn"
            onClick={() => {
              setInputRoomCode(roomCodeFromUrl);
              setActiveTab('online');
            }}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer"
          >
            اضغط للانضمام
          </button>
          <div>
            <span className="text-xs text-amber-300 block font-bold">لديك دعوة نشطة!</span>
            <span className="text-xs text-slate-300 block mt-0.5">رمز الغرفة المرفق بالرابط هو <strong className="text-white font-mono">{roomCodeFromUrl}</strong></span>
          </div>
        </div>
      )}

      {/* Mode Navigation Tabs */}
      <div id="lobby-mode-tabs" className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800/80 mb-6">
        <button
          id="btn-tab-online"
          onClick={() => setActiveTab('online')}
          className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer ${
            activeTab === 'online' ? 'bg-slate-900 border border-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>أونلاين مع أصدقائك</span>
        </button>
        <button
          id="btn-tab-local-ai"
          onClick={() => setActiveTab('local_ai')}
          className={`flex flex-col items-center gap-1 py-1.5 rounded-xl text-xs font-bold transition duration-200 cursor-pointer ${
            activeTab === 'local_ai' ? 'bg-slate-900 border border-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>تحدي الكمبيوتر الذكي</span>
        </button>
        <button
          id="btn-tab-local-pass"
          onClick={() => setActiveTab('local_pass')}
          className={`flex flex-col items-center gap-1 py-1.5 rounded-xl text-xs font-bold transition duration-200 cursor-pointer ${
            activeTab === 'local_pass' ? 'bg-slate-900 border border-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          <UserSquare2 className="w-4 h-4" />
          <span>لعب محلي (على الشاشة)</span>
        </button>
      </div>

      {/* Mode Sub-panels */}
      <div id="lobby-mode-panels" className="min-h-[180px] mb-6">
        {/* ONLINE PANEL */}
        {activeTab === 'online' && (
          <div id="panel-online" className="space-y-4">
            <div id="online-actions-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Create Room Card */}
              <div id="online-create-card" className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-amber-400 mb-1.5">إنشاء غرفة جديدة 👑</h4>
                  <p className="text-slate-400 text-xs leading-relaxed mb-3">
                    أنشئ كود غرفة خاص بك، وشارك رابط اللعبة مع أصدقائك (من 2 إلى 4 لاعبين) لتلعبوا معاً في بث حي ومباشر.
                  </p>
                </div>
                <button
                  id="btn-create-online-game"
                  disabled={isLoading}
                  onClick={handleCreateOnline}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg cursor-pointer disabled:opacity-50"
                >
                  <span>أنشئ غرفة والعب</span>
                  <Play className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Join Room Card */}
              <div id="online-join-card" className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-200 mb-1.5">الانضمام بكود الغرفة 🔑</h4>
                  <p className="text-slate-400 text-xs leading-relaxed mb-3">
                    أدخل الرمز السري المكون من 5 أحرف الذي أرسله لك صديقك لتنضم إلى طاولتهم مباشرة.
                  </p>
                  <input
                    id="lobby-join-room-input"
                    type="text"
                    value={inputRoomCode}
                    onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                    placeholder="رمز الغرفة (مثال: G6HD9)"
                    className="w-full bg-slate-900 border border-slate-800 text-center font-mono focus:border-amber-400 rounded-xl px-2 py-2 text-xs outline-none text-white tracking-widest placeholder-slate-650 mb-3"
                  />
                </div>
                <button
                  id="btn-join-online-game"
                  disabled={isLoading || !inputRoomCode.trim()}
                  onClick={handleJoinOnline}
                  className="w-full bg-slate-850 hover:bg-slate-800 border border-slate-750 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  <span>ادخل الغرفة</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI COMPUTER PANEL */}
        {activeTab === 'local_ai' && (
          <div id="panel-local-ai" className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h4 className="text-sm font-extrabold text-amber-400 mb-1.5">مواجهة الذكاء الاصطناعي الذكي 🤖</h4>
              <p className="text-slate-400 text-xs leading-relaxed">
                مثالي للتدريب وتطوير مهارتك التكتيكية في تركيب القفزات المتتالية وتجميع أطقم السلاسل الخماسية للفوز بالجولة!
              </p>
            </div>

            {/* Difficulty Level Selector */}
            <div id="ai-difficulty-selector" className="space-y-2 border-t border-slate-800/80 pt-4">
              <label className="text-xs text-slate-300 font-bold block mb-2">اختر مستوى صعوبة الذكاء الاصطناعي:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'easy', label: 'سهل 🟢' },
                  { id: 'medium', label: 'متوسط 🟡' },
                  { id: 'hard', label: 'صعب 🔴' }
                ].map((level) => {
                  const isSel = aiDifficulty === level.id;
                  return (
                    <button
                      id={`difficulty-btn-${level.id}`}
                      key={level.id}
                      type="button"
                      onClick={() => setAiDifficulty(level.id as 'easy' | 'medium' | 'hard')}
                      className={`flex flex-col items-center justify-center py-2 px-1.5 rounded-xl border transition duration-200 cursor-pointer ${
                        isSel
                          ? 'bg-amber-500/10 border-amber-400 text-amber-400 font-bold shadow-lg shadow-amber-500/5'
                          : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-xs">{level.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 text-right leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/40 mt-1">
                {aiDifficulty === 'easy' && '🟢 مستوى سهل: يلعب الكمبيوتر بشكل عشوائي وبسيط دون تخطيط عميق للقفزات المتعددة.'}
                {aiDifficulty === 'medium' && '🟡 مستوى متوسط: تفكير بشري ذكي وواقعي! يبحث عن فرص كسب النقاط وتجميع الألوان دون تعقيد زائد أو كمال مطلق.'}
                {aiDifficulty === 'hard' && '🔴 مستوى صعب: تفكير حاسوبي تكتيكي متطور لحساب أفضل وأطول سلسلة تفصلك عن النصر.'}
              </p>
            </div>
            
            <button
              id="start-ai-btn"
              onClick={handleStartAI}
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-amber-500/5 cursor-pointer"
            >
              <span>ابدأ التحدي فوراً</span>
              <Play className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* LOCAL PASS PLAY PANEL */}
        {activeTab === 'local_pass' && (
          <div id="panel-local-pass" className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div id="passplay-seats-btns" className="flex items-center gap-1.5">
                {[2, 3, 4].map((count) => {
                  const isActive = passPlayPlayerCount === count;
                  return (
                    <button
                      id={`passplay-seats-btn-${count}`}
                      key={count}
                      onClick={() => setPassPlayPlayerCount(count as 2|3|4)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer ${
                        isActive ? 'bg-amber-500 border-amber-500 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {count} لاعبين
                    </button>
                  );
                })}
              </div>
              <h4 className="text-sm font-extrabold text-slate-200">اختر عدد اللاعبين:</h4>
            </div>

            <div id="passplay-names-fields" className="grid grid-cols-2 gap-3 border-t border-slate-805 pt-3">
              {Array.from({ length: passPlayPlayerCount }).map((_, index) => (
                <div id={`passplay-player-input-wrap-${index}`} key={index}>
                  <label id={`lbl-passplay-player-${index}`} className="text-[11px] text-slate-400 block mb-1">اللاعب {index + 1}:</label>
                  <input
                    id={`passplay-player-name-${index}`}
                    type="text"
                    value={passPlayNames[index]}
                    onChange={(e) => {
                      const updated = [...passPlayNames];
                      updated[index] = e.target.value.slice(0, 16);
                      setPassPlayNames(updated);
                    }}
                    placeholder={`اسم اللاعب ${index + 1}`}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-right outline-none text-white transition placeholder-slate-700"
                  />
                </div>
              ))}
            </div>

            <button
              id="start-pass-play-btn"
              onClick={handleStartPassPlay}
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-amber-500/5 cursor-pointer mt-2"
            >
              <span>ابدأ اللعب المحلي مع أصدقائك</span>
              <Play className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Error displays */}
      {errorMsg && (
        <div id="lobby-error-alert" className="bg-red-500/10 border border-red-500/15 p-3 rounded-xl text-xs text-red-400 mb-6 flex items-center justify-between text-right">
          <span>⚠️ {errorMsg}</span>
        </div>
      )}

      {/* Footer / Info / Quick Instructions toggle */}
      <div id="lobby-footer-controls" className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
        <button
          id="btn-lobby-how-to-play"
          onClick={onToggleHowToPlay}
          className="hover:text-amber-400 font-bold flex items-center gap-1 transition cursor-pointer"
        >
          <BookOpen className="w-4 h-4 text-amber-500" />
          <span>شرح تفصيلي ومصوّر لقواعد اللعبة</span>
        </button>
        <span>تحتاج المساعدة؟</span>
      </div>
    </div>
  );
}
