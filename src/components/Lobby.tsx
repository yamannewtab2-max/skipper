/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Cpu, 
  UserSquare2, 
  ArrowRight,
  Play,
  Camera,
  Trophy,
  LogOut,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  History,
  Zap,
  Trash2
} from 'lucide-react';
import { UserProfile, CompactHistoryItem, loadActiveGames, deleteGameSession } from '../firebase';
import { GameSession } from '../types';

interface LobbyProps {
  onStartLocalGame: (mode: 'local_ai' | 'local_pass' | 'local_fast_ai', customNames: string[], difficulty?: 'easy' | 'medium' | 'hard') => void;
  onCreateOnlineGame: (playerName: string, avatarColor: string) => void;
  onJoinOnlineGame: (roomCode: string, playerName: string, avatarColor: string) => void;
  roomCodeFromUrl: string | null;
  isLoading: boolean;
  errorMsg: string | null;
  onToggleHowToPlay: () => void;
  
  // Authenticated state & Google logins
  currentUser: UserProfile | null;
  historyList: CompactHistoryItem[];
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onUpdateProfile: (name: string, photoUrl: string | null) => Promise<void>;
  isAdmin?: boolean;
  onAdminSpectateGame?: (roomCode: string) => void;
}

const AVATAR_COLORS = [
  'bg-amber-400 text-slate-950',
  'bg-emerald-400 text-slate-950',
  'bg-indigo-500 text-white',
  'bg-pink-500 text-white',
  'bg-sky-400 text-slate-950',
  'bg-violet-500 text-white'
];

const formatLastUpdated = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 3600000);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
};

export default function Lobby({
  onStartLocalGame,
  onCreateOnlineGame,
  onJoinOnlineGame,
  roomCodeFromUrl,
  isLoading,
  errorMsg,
  currentUser,
  historyList,
  onSignInGoogle,
  onSignOutGoogle,
  onUpdateProfile,
  isAdmin = false,
  onAdminSpectateGame,
}: LobbyProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synced local state with profile displayName
  const [playerName, setPlayerName] = useState('');
  useEffect(() => {
    if (currentUser) {
      setPlayerName(currentUser.displayName);
    }
  }, [currentUser]);

  // Is saving profile changes
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Toggle state to collapse/expand match history list
  const [showHistory, setShowHistory] = useState(false);

  // Automatically assign a random avatar color for online seat
  const [avatarColor] = useState(() => {
    return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  });

  // Active games for admin view
  const [activeGames, setActiveGames] = useState<GameSession[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Selected play mode config after authentication
  const [selectedMode, setSelectedMode] = useState<'online' | 'local_ai' | 'local_pass' | 'local_fast_ai' | 'active_games' | null>(() => {
    return roomCodeFromUrl ? 'online' : null;
  });

  // Steps tracking for online mode: 'username' -> 'room_actions'
  const [onlineStep, setOnlineStep] = useState<'username' | 'room_actions'>('username');

  const [inputRoomCode, setInputRoomCode] = useState(roomCodeFromUrl || '');
  const [passPlayPlayerCount, setPassPlayPlayerCount] = useState<2 | 3 | 4>(2);
  const [passPlayNames, setPassPlayNames] = useState<string[]>(['اللاعب 1', 'اللاعب 2', '', '']);
  const [aiCount, setAiCount] = useState<1 | 2 | 3>(1);

  const handleCreateOnline = () => {
    const finalName = playerName.trim() || currentUser?.displayName || 'اللاعب 1';
    onCreateOnlineGame(finalName, avatarColor);
  };

  const handleJoinOnline = () => {
    const finalName = playerName.trim() || currentUser?.displayName || 'اللاعب 2';
    const finalCode = inputRoomCode.trim().toUpperCase();
    if (!finalCode) return;
    onJoinOnlineGame(finalCode, finalName, avatarColor);
  };

  const handleStartAI = () => {
    const finalName = playerName.trim() || currentUser?.displayName || 'أنت';
    const names = [finalName];
    for (let i = 1; i <= aiCount; i++) {
      names.push(`الكمبيوتر الذكي ${aiCount > 1 ? i : ''} 🤖`);
    }
    onStartLocalGame('local_ai', names, 'medium');
  };

  const handleStartPassPlay = () => {
    const namesList: string[] = [];
    for (let i = 0; i < passPlayPlayerCount; i++) {
      namesList.push(passPlayNames[i]?.trim() || `اللاعب ${i + 1}`);
    }
    onStartLocalGame('local_pass', namesList);
  };

  // Convert uploaded image to compact Base64 JPEG string
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً، يرجى اختيار صورة أصغر من 5 ميجابايت.');
      return;
    }

    setIsUpdatingProfile(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 120;
        const MAX_HEIGHT = 120;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const base64Url = canvas.toDataURL('image/jpeg', 0.85);
        onUpdateProfile(playerName || currentUser?.displayName || '', base64Url)
          .finally(() => setIsUpdatingProfile(false));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Save Name text change
  const handleNameBlurOrSave = () => {
    if (!currentUser) return;
    const trimmed = playerName.trim();
    if (!trimmed || trimmed === currentUser.displayName) return;
    onUpdateProfile(trimmed, currentUser.photoUrl);
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* "MADE BY YAMAN" signature display badge in the top center with extra space */}
      <div 
        id="yaman-signature-badge" 
        className="text-center mb-6 mt-2 select-none pointer-events-none"
      >
        <span className="block text-[10px] text-slate-500 font-extrabold tracking-widest uppercase mb-1">CREATOR</span>
        <span className="block text-4xl md:text-5xl font-black bg-gradient-to-r from-amber-400 via-pink-500 to-violet-400 bg-clip-text text-transparent tracking-widest drop-shadow-lg">
          MADE BY YAMAN
        </span>
      </div>

      <div id="lobby-root" className="w-full max-w-xl bg-slate-900 border border-slate-800/85 rounded-3xl p-6 text-white text-right font-sans shadow-2xl relative overflow-hidden">
        {/* Decorative subtle ambient overflows */}
        <div id="lobby-glow" className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div id="lobby-glow-2" className="absolute bottom-0 left-0 w-36 h-36 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* STEP 0: MANDATORY GOOGLE SIGN-IN IF NOT AUTHENTICATED */}
        {!currentUser ? (
          <div id="mandatory-google-auth-gate" className="relative z-10 py-12 flex flex-col items-center justify-center text-center space-y-6">
            <div className="p-4 rounded-full bg-amber-500/10 text-amber-400 animate-bounce">
              <Trophy className="w-12 h-12" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black tracking-tight text-white">
                مرحباً بك في لُعبة سكيبتي! 🏆
              </h3>
              <p className="text-sm text-slate-400 max-w-sm">
                يرجى تسجيل الدخول بحساب Google لحفظ إنجازاتك، صورتك الشخصية، وسجل مبارياتك السابقة.
              </p>
            </div>

            <button
              id="google-signin-btn"
              onClick={onSignInGoogle}
              disabled={isLoading}
              className="w-full max-w-xs bg-white hover:bg-slate-100 text-slate-900 font-extrabold py-3 px-6 rounded-xl text-sm flex items-center justify-center gap-3 transition shadow-lg hover:scale-[1.02] cursor-pointer disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 1.404 15.42 0 12.24 0c-6.63 0-12 5.37-12 12s5.37 12 12 12c6.93 0 11.52-4.877 11.52-11.726 0-.788-.085-1.39-.188-1.99H12.24z"
                />
              </svg>
              <span>تسجيل الدخول باستخدام Google</span>
            </button>

            {isLoading && <span className="text-xs text-slate-500 animate-pulse">جاري التحميل... ⏳</span>}
          </div>
        ) : (
          /* AUTHENTICATED USER WORKSPACE */
          <div className="relative z-10 space-y-6">

            {/* STEP 1: PLAY MODE SELECTION - ONLY THE THREE BIG GLOWING BUTTONS WITH ICONS */}
            {selectedMode === null ? (
              <div id="mode-initial-selection" className="relative z-10 animate-fade-in py-6 flex flex-col items-center justify-center">
                <span className="text-xs text-slate-500 block mb-4 font-black">اختر نمط اللعب لتشغيل الجولة</span>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 md:gap-8 w-full max-w-xs sm:max-w-none">
                  {/* ONLINE BUTTON */}
                  <button
                    id="select-mode-online-btn"
                    onClick={() => setSelectedMode('online')}
                    className="group p-5 sm:p-8 rounded-2xl bg-slate-950/80 hover:bg-slate-950 border-2 border-slate-800/80 hover:border-amber-400 transition-all duration-300 cursor-pointer flex flex-row sm:flex-col items-center gap-4 sm:gap-2 justify-start sm:justify-center shadow-lg hover:-translate-y-1.5 hover:shadow-amber-500/10 w-full sm:w-32 md:w-36"
                    title="أونلاين عبر الإنترنت"
                  >
                    <Users className="w-8 h-8 sm:w-12 sm:h-12 text-amber-400 shrink-0 group-hover:scale-110 transition duration-300" />
                    <span className="text-xs sm:text-xs font-black block tracking-wide text-slate-300 group-hover:text-amber-400 transition">أونلاين Multi</span>
                  </button>

                  {/* VS AI CHALLENGE BUTTON */}
                  <button
                    id="select-mode-ai-btn"
                    onClick={() => setSelectedMode('local_ai')}
                    className="group p-5 sm:p-8 rounded-2xl bg-slate-950/80 hover:bg-slate-950 border-2 border-slate-800/80 hover:border-emerald-400 transition-all duration-300 cursor-pointer flex flex-row sm:flex-col items-center gap-4 sm:gap-2 justify-start sm:justify-center shadow-lg hover:-translate-y-1.5 hover:shadow-emerald-500/10 w-full sm:w-32 md:w-36"
                    title="تحدي الذكاء الاصطناعي"
                  >
                    <Cpu className="w-8 h-8 sm:w-12 sm:h-12 text-emerald-400 shrink-0 group-hover:scale-110 transition duration-300" />
                    <span className="text-xs sm:text-xs font-black block tracking-wide text-slate-300 group-hover:text-emerald-400 transition">الكمبيوتر AI</span>
                  </button>

                  {/* LOCAL PASS AND PLAY BUTTON */}
                  <button
                    id="select-mode-pass-btn"
                    onClick={() => setSelectedMode('local_pass')}
                    className="group p-5 sm:p-8 rounded-2xl bg-slate-950/80 hover:bg-slate-950 border-2 border-slate-800/80 hover:border-indigo-400 transition-all duration-300 cursor-pointer flex flex-row sm:flex-col items-center gap-4 sm:gap-2 justify-start sm:justify-center shadow-lg hover:-translate-y-1.5 hover:shadow-indigo-500/10 w-full sm:w-32 md:w-36"
                    title="لعب جماعي محلي"
                  >
                    <UserSquare2 className="w-8 h-8 sm:w-12 sm:h-12 text-indigo-400 shrink-0 group-hover:scale-110 transition duration-300" />
                    <span className="text-xs sm:text-xs font-black block tracking-wide text-slate-300 group-hover:text-indigo-400 transition">جماعي محلي</span>
                  </button>

                  {/* FAST SIMATION MODE SPEED AI vs AI */}
                  <button
                    id="select-mode-fast-ai-btn"
                    onClick={() => {
                      onStartLocalGame('local_fast_ai', [
                        'الكمبيوتر الأحمر 🔴',
                        'الكمبيوتر الأزرق 🔵',
                        'الكمبيوتر الأخضر 🟢',
                        'الكمبيوتر الأصفر 🟡'
                      ], 'hard');
                    }}
                    className="group p-5 sm:p-8 rounded-2xl bg-slate-950/80 hover:bg-slate-950 border-2 border-slate-800/80 hover:border-amber-400 transition-all duration-300 cursor-pointer flex flex-row sm:flex-col items-center gap-4 sm:gap-2 justify-start sm:justify-center shadow-lg hover:-translate-y-1.5 hover:shadow-amber-500/15 w-full sm:w-32 md:w-36"
                    title="محاكاة سريعة للذكاء الاصطناعي (AI ضد AI)"
                  >
                    <Zap className="w-8 h-8 sm:w-12 sm:h-12 text-amber-400 shrink-0 group-hover:scale-110 transition duration-300 animate-pulse" />
                    <span className="text-xs sm:text-xs font-black block tracking-wide text-slate-300 group-hover:text-amber-400 transition">محاكاة سريعة ⚡</span>
                  </button>
                </div>

                {isAdmin && (
                  <div className="mt-8 flex flex-col items-center justify-center">
                    <button
                      id="admin-active-games-toggle-btn"
                      onClick={async () => {
                        setSelectedMode('active_games');
                        setIsLoadingActive(true);
                        try {
                          const games = await loadActiveGames();
                          setActiveGames(games);
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setIsLoadingActive(false);
                        }
                      }}
                      className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-red-500/15 to-amber-500/15 hover:from-red-500/25 hover:to-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-black flex items-center justify-center gap-2 transition-all shadow-lg hover:scale-[1.02] cursor-pointer"
                    >
                      <Gamepad2 className="w-5 h-5 text-amber-400" />
                      <span>عرض الألعاب النشطة 🌐 Active Games</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* STEP 2 / 3: CONFIGURE INDIVIDUAL MODE WORKSPACE */
              <div id="mode-configuration-zone" className="space-y-6 relative z-10 animate-fade-in text-center">
                
                {/* Back Button */}
                <div className="flex items-center justify-between border-b border-slate-850 pb-4">
                  <button
                    id="back-to-modes-btn"
                    type="button"
                    onClick={() => {
                      if (selectedMode === 'online' && onlineStep === 'room_actions') {
                        setOnlineStep('username');
                      } else {
                        setSelectedMode(null);
                      }
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5 cursor-pointer hover:underline"
                  >
                    <ArrowRight className="w-4 h-4 ml-1" />
                    <span>رجوع للفئات</span>
                  </button>

                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                    {selectedMode === 'online' ? 'أونلاين عبر الإنترنت' : selectedMode === 'local_ai' ? 'تحدي الكمبيوتر الذكي' : selectedMode === 'active_games' ? 'الألعاب النشطة حالياً' : 'لعب جماعي محلي'}
                  </span>
                </div>

                {/* ACTIVE GAMES (ADMIN ONLY VIEW) */}
                {selectedMode === 'active_games' && (
                  <div id="admin-active-games-panel" className="py-4 space-y-6 animate-fade-in text-right">
                    <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800 gap-4">
                      <div className="text-right">
                        <h4 className="text-sm font-black text-white">إدارة ومراقبة المباريات الجارية 🛠️</h4>
                        <p className="text-xs text-slate-400 mt-1">يمكنك الاطلاع على كافة الغرف النشطة في السيرفر حالياً والدردشة مع اللاعبين فيها.</p>
                      </div>
                      <button
                        onClick={async () => {
                          setIsLoadingActive(true);
                          try {
                            const games = await loadActiveGames();
                            setActiveGames(games);
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setIsLoadingActive(false);
                          }
                        }}
                        disabled={isLoadingActive}
                        className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg cursor-pointer transition disabled:opacity-50"
                      >
                        {isLoadingActive ? 'جاري التحديث... ⏳' : 'تحديث القائمة 🔄'}
                      </button>
                    </div>

                    {isLoadingActive ? (
                      <div className="text-center py-12 text-xs text-slate-400 animate-pulse">
                        جاري تحميل مباريات السيرفر حالياً... ⏳
                      </div>
                    ) : activeGames.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                        <Gamepad2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-sm text-slate-400 font-bold">لا توجد مباريات جارية حالياً على السيرفر.</p>
                        <p className="text-xs text-slate-500 mt-1">ابدأ مباراة جديدة لتراها تظهر هنا!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeGames.map((game) => {
                          const statusLabels: Record<string, string> = {
                            setup: 'قيد الإعداد ⚙️',
                            waiting: 'انتظار اللاعبين 👥',
                            playing: 'مباراة جارية 🎮',
                            finished: 'منتهية 🎉'
                          };

                          const statusColors: Record<string, string> = {
                            setup: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/25',
                            waiting: 'bg-amber-500/10 text-amber-400 border border-amber-500/25',
                            playing: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
                            finished: 'bg-slate-500/10 text-slate-400 border border-slate-500/25'
                          };

                          return (
                            <div
                              key={game.id}
                              className="bg-slate-950/60 hover:bg-slate-950 border border-slate-850 hover:border-slate-800 p-5 rounded-2xl transition-all flex flex-col justify-between gap-4 shadow-xl"
                            >
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-black tracking-widest text-amber-400">{game.id}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[game.status] || 'bg-slate-500/10'}`}>
                                      {statusLabels[game.status] || game.status}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono">
                                    تم التحديث: {formatLastUpdated(game.lastUpdated)}
                                  </p>
                                </div>
                                <div className="text-left">
                                  <span className="text-xs font-bold text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg">
                                    اللاعبين: {game.players.length}/4
                                  </span>
                                </div>
                              </div>

                              <div className="border-t border-slate-850 pt-3">
                                <span className="text-[10px] text-slate-400 font-bold block mb-2">اللاعبين النشطين:</span>
                                <div className="flex flex-wrap gap-2">
                                  {game.players.map((p) => (
                                    <div
                                      key={p.id}
                                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs bg-slate-900 border ${p.isActive ? 'border-emerald-500/20' : 'border-red-500/20'}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                      <span className="text-slate-300 font-semibold">{p.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 mt-2">
                                <button
                                  onClick={() => onAdminSpectateGame?.(game.id)}
                                  className="py-2.5 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-amber-400 border border-slate-800 hover:border-transparent rounded-xl text-xs font-black transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <span>مراقبة اللعبة 👁️💬</span>
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const isConfirmed = confirmDeleteId === game.id;
                                    if (isConfirmed) {
                                      try {
                                        setIsLoadingActive(true);
                                        await deleteGameSession(game.id);
                                        const games = await loadActiveGames();
                                        setActiveGames(games);
                                        setConfirmDeleteId(null);
                                      } catch (err) {
                                        console.error(err);
                                      } finally {
                                        setIsLoadingActive(false);
                                      }
                                    } else {
                                      setConfirmDeleteId(game.id);
                                      // Reset confirm state after 5 seconds of inactivity
                                      setTimeout(() => {
                                        setConfirmDeleteId(prev => prev === game.id ? null : prev);
                                      }, 5000);
                                    }
                                  }}
                                  className={`py-2.5 px-1.5 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 border ${
                                    confirmDeleteId === game.id
                                      ? 'bg-red-500 text-slate-950 border-transparent animate-pulse'
                                      : 'bg-red-950/20 hover:bg-red-500/10 text-red-400 border-red-900/40 hover:border-red-500/40'
                                  }`}
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>{confirmDeleteId === game.id ? 'تأكيد الحذف؟ ⚠️' : 'إيقاف وحذف 🗑️'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ONLINE NICKNAME CONFIRMER - DIRECT SHORTCUT */}
                {selectedMode === 'online' && onlineStep === 'username' && (
                  <div id="nickname-selection-step" className="py-6 flex flex-col items-center justify-center space-y-4 animate-fade-in">
                    <h3 className="text-lg font-black text-slate-100">
                      هل تود اللعب باسم: <strong className="text-amber-400">"{playerName || currentUser.displayName}"</strong>؟
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      يمكنك تعديل اسمك المستعار من صندوق الإعدادات في الأعلى متى شئت.
                    </p>
                    <button
                      id="btn-confirm-nickname"
                      onClick={() => setOnlineStep('room_actions')}
                      className="w-full max-w-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-6 rounded-xl text-sm transition shadow-lg shadow-amber-500/25 cursor-pointer mt-4"
                    >
                      تأكيد ومتابعة الخطوة التالية
                    </button>
                  </div>
                )}

                {/* VIS AI CONFIRMER - WITH OPTION TO ADD 1-3 AI */}
                {selectedMode === 'local_ai' && (
                  <div id="ai-confirmation-pane" className="py-6 flex flex-col items-center justify-center space-y-5 animate-fade-in max-w-sm mx-auto">
                    <h3 className="text-xl font-black text-slate-100">
                      تحدي الذكاء الاصطناعي 🧠
                    </h3>
                    
                    <div className="w-full bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl text-right space-y-3 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">نمط اللاعبين</span>
                        <span className="text-xs text-emerald-400 font-black">لاعب واحد ضد الكمبيوتر</span>
                      </div>
                      <div className="border-t border-slate-900 my-1" />
                      <div className="space-y-2">
                        <label className="text-xs text-slate-300 block font-bold">عدد أجهزة الكمبيوتر المنافسة (1-3):</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[1, 2, 3].map((num) => {
                            const isSelected = aiCount === num;
                            return (
                              <button
                                key={num}
                                id={`ai-count-btn-${num}`}
                                type="button"
                                onClick={() => setAiCount(num as 1 | 2 | 3)}
                                className={`py-2 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                                  isSelected 
                                    ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {num === 1 ? 'كمبيوتر واحد' : num === 2 ? 'كمبيوترين' : '3 كمبيوترات'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-450 text-center">
                      ستلعب بشخصية <span className="font-extrabold text-amber-400">"{playerName || currentUser.displayName}"</span> ضد <span className="font-extrabold text-emerald-400">{aiCount === 1 ? 'كمبيوتر منافس ذكي' : `${aiCount} من أجهزة الكمبيوتر الذكية`}</span>.
                    </p>
                    
                    <button
                      id="btn-start-ai"
                      onClick={handleStartAI}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 px-6 rounded-xl text-sm transition shadow-lg shadow-emerald-500/25 cursor-pointer mt-2"
                    >
                      أطلق الجولة الآن 🚀
                    </button>
                  </div>
                )}

                {/* ONLINE ONLY - STEP 3: INTERACTIVE ROOM ACTIONS (MAKE A ROOM / JOIN A ROOM) */}
                {selectedMode === 'online' && onlineStep === 'room_actions' && (
                  <div id="online-step-room-actions" className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in pt-4 text-slate-100">
                    
                    {/* CHOICE 1: MAKE A ROOM */}
                    <div className="p-6 bg-slate-950 border-2 border-slate-800 hover:border-amber-400 rounded-2xl flex flex-col justify-between min-h-[220px] transition duration-300 shadow-xl group">
                      <div className="text-right">
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2.5 rounded-xl bg-amber-400/10 text-amber-400 group-hover:scale-110 transition duration-300">
                            <Users className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] text-amber-400/85 font-black uppercase tracking-wider">الخيار الأول</span>
                        </div>
                        <h4 className="text-base font-black text-slate-100 mb-1.5">
                          إنشاء غرفة جديدة
                        </h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                          ابدأ غرفة خادم مخصصة لك وادعُ أصدقائك عبر كود فوري ومباشر!
                        </p>
                      </div>
                      <button
                        id="btn-create-online-game"
                        disabled={isLoading}
                        onClick={handleCreateOnline}
                        className="w-full bg-amber-400 hover:bg-amber-300 active:scale-95 disabled:opacity-50 text-slate-950 font-black py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-200 shadow-lg shadow-amber-400/20 hover:shadow-amber-400/35 cursor-pointer border border-transparent"
                      >
                        <span className="tracking-wide">تأكيد وإنشاء الغرفة ✨</span>
                      </button>
                    </div>

                    {/* CHOICE 2: JOIN A ROOM */}
                    <div className="p-6 bg-slate-950 border-2 border-slate-800 hover:border-violet-500 rounded-2xl flex flex-col justify-between min-h-[220px] transition duration-300 shadow-xl group">
                      <div className="text-right">
                        <div className="flex items-center justify-between mb-2">
                          <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 group-hover:scale-110 transition duration-300">
                            <Play className="w-5 h-5 ml-1" />
                          </div>
                          <span className="text-[10px] text-violet-400/85 font-black uppercase tracking-wider">الخيار الثاني</span>
                        </div>
                        <h4 className="text-base font-black text-slate-100 mb-1.5">
                          الانضمام بكود الغرفة
                        </h4>
                        <input
                          id="lobby-join-room-input"
                          type="text"
                          value={inputRoomCode}
                          onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                          placeholder="أدخل الرمز المكون من 5 أحرف..."
                          className="w-full bg-slate-900 border-2 border-slate-800 focus:border-violet-400 text-center font-mono focus:ring-4 focus:ring-violet-550/15 rounded-xl py-2 px-3 text-sm outline-none text-white tracking-widest placeholder-slate-600 transition-all font-black"
                        />
                      </div>
                      <button
                        id="btn-join-online-game"
                        disabled={isLoading || !inputRoomCode.trim()}
                        onClick={handleJoinOnline}
                        className="w-full bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none text-white font-black py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-200 shadow-lg shadow-violet-600/20 hover:shadow-violet-500/35 cursor-pointer border border-transparent mt-2"
                      >
                        <span>انضم ومتابعة 🚀</span>
                      </button>
                    </div>

                  </div>
                )}

                {/* LOCAL TWO / MULTIPLAYER SELECTION PASS & PLAY */}
                {selectedMode === 'local_pass' && (
                  <div id="pass-play-names-flow" className="bg-slate-950/40 border border-slate-850 rounded-2xl p-5 space-y-5">
                    {/* Passenger Seat selection counts (2, 3, or 4 players) */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div id="passplay-seats-btns" className="flex items-center gap-1.5">
                        {[2, 3, 4].map((count) => {
                          const isActive = passPlayPlayerCount === count;
                          return (
                            <button
                              id={`passplay-seats-btn-${count}`}
                              key={count}
                              type="button"
                              onClick={() => setPassPlayPlayerCount(count as 2|3|4)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-black border cursor-pointer transition ${
                                isActive ? 'bg-indigo-500 border-indigo-500 text-white shadow' : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-white'
                              }`}
                            >
                              {count} لاعبين
                            </button>
                          );
                        })}
                      </div>
                      <h4 className="text-xs font-bold text-indigo-400">عدد اللاعبين المشاركين:</h4>
                    </div>

                    {/* Grid is responsive, automatically displays the exact number of text fields */}
                    <div id="passplay-names-fields" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Array.from({ length: passPlayPlayerCount }).map((_, index) => (
                        <div id={`passplay-player-input-wrap-${index}`} key={index} className="text-right">
                          <label id={`lbl-passplay-player-${index}`} className="text-xs text-slate-400 block mb-1 font-bold">اسم اللاعب {index + 1}:</label>
                          <input
                            id={`passplay-player-name-${index}`}
                            type="text"
                            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-right outline-none text-white transition-all shadow-inner placeholder-slate-700"
                            value={passPlayNames[index] || ''}
                            onChange={(e) => {
                              const updated = [...passPlayNames];
                              updated[index] = e.target.value.slice(0, 16);
                              setPassPlayNames(updated);
                            }}
                            placeholder={index === 0 ? `(أنت) ${playerName || currentUser.displayName}...` : `الاسم المستعار للاعب ${index + 1}...`}
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      id="start-pass-play-btn"
                      onClick={handleStartPassPlay}
                      className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 transition shadow-lg cursor-pointer mt-2"
                    >
                      <span>بدء اللعب الجماعي الفوري</span>
                    </button>
                  </div>
                )}

              </div>
            )}

            {/* Invitation direct active link badge */}
            {roomCodeFromUrl && selectedMode === null && (
              <div id="url-invitation-detected-banner" className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl mb-4 flex items-center justify-between text-right relative z-10 mt-6 select-none animate-pulse">
                <button
                  id="join-url-room-hot-btn"
                  onClick={() => {
                    setInputRoomCode(roomCodeFromUrl);
                    setSelectedMode('online');
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer"
                >
                  الانضمام المباشر
                </button>
                <div>
                  <span className="text-xs text-amber-300 block font-bold">لديك دعوة نشطة!</span>
                  <span className="text-xs text-slate-300 block mt-0.5 font-bold">رمز الغرفة: <strong className="text-white font-mono">{roomCodeFromUrl}</strong></span>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Action errors feedback */}
        {errorMsg && (
          <div id="lobby-error-alert" className="bg-red-500/10 border border-red-500/15 p-3 rounded-xl text-xs text-red-400 my-4 flex items-center justify-between text-right relative z-10 font-bold">
            <span>⚠️ {errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
