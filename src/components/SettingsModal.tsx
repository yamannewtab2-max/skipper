/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  LogOut, 
  Camera, 
  ChevronDown, 
  ChevronUp, 
  History, 
  Settings, 
  User 
} from 'lucide-react';
import { UserProfile, CompactHistoryItem } from '../firebase';

interface SettingsModalProps {
  currentUser: UserProfile;
  historyList: CompactHistoryItem[];
  onSignOut: () => Promise<void>;
  onUpdateProfile: (name: string, photoUrl: string | null, allowViewProgress?: boolean) => Promise<void>;
  onClose: () => void;
}

export default function SettingsModal({
  currentUser,
  historyList,
  onSignOut,
  onUpdateProfile,
  onClose,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [playerName, setPlayerName] = useState(currentUser.displayName);
  const [allowProgress, setAllowProgress] = useState(currentUser.allowViewProgress !== false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setPlayerName(currentUser.displayName);
    setAllowProgress(currentUser.allowViewProgress !== false);
  }, [currentUser.displayName, currentUser.allowViewProgress]);

  // Handle avatar upload (Base64 compressed JPEG)
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
        onUpdateProfile(playerName || currentUser.displayName || '', base64Url, allowProgress)
          .finally(() => setIsUpdatingProfile(false));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Save Name text change
  const handleNameBlurOrSave = () => {
    const trimmed = playerName.trim();
    if (!trimmed || trimmed === currentUser.displayName) return;
    onUpdateProfile(trimmed, currentUser.photoUrl, allowProgress);
  };

  return (
    <div id="settings-modal-overlay" className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fade-in">
      <div id="settings-modal-card" className="w-full max-w-xl bg-slate-900 border border-slate-800/85 rounded-3xl p-6 text-white text-right font-sans shadow-2xl relative overflow-hidden">
        {/* Decorative subtle ambient overflows */}
        <div id="settings-glow" className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div id="settings-glow-2" className="absolute bottom-0 left-0 w-36 h-36 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header with Title and "X" Button to NOT get stuck */}
        <div className="relative z-10 flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <button
            id="close-settings-modal"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/60 transition cursor-pointer"
            title="إغلاق الإعدادات"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-slate-100">إعدادات ملفك الشخصي</h3>
            <Settings className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        {/* Settings Body content */}
        <div className="relative z-10 space-y-6">
          
          {/* USER PROFILE INFO SECTION */}
          <div id="settings-profile-info" className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row items-center md:justify-between gap-4">
              
              {/* Logout action */}
              <button
                id="modal-profile-logout-btn"
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="p-2.5 rounded-xl bg-slate-900 hover:bg-red-950/20 text-slate-400 hover:text-red-400 border border-slate-850 transition cursor-pointer flex items-center gap-2 text-xs font-bold"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>

              {/* Nickname modification input box */}
              <div className="flex-1 flex flex-col items-center justify-center space-y-2 w-full">
                <span className="text-[10px] text-amber-400/80 font-black tracking-widest block">الاسم المستعار</span>
                <input
                  id="settings-username-input"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.slice(0, 18))}
                  onBlur={handleNameBlurOrSave}
                  onKeyDown={(e) => e.key === 'Enter' && handleNameBlurOrSave()}
                  placeholder="كنيتك الخاصة..."
                  className="w-full max-w-xs bg-slate-900 border-2 border-slate-800 focus:border-amber-400 rounded-xl py-2.5 px-3 text-center text-base outline-none text-white transition-all font-black shadow"
                />
                <span className="text-[9px] text-slate-500">اضغط Enter لتأكيد تغيير الاسم</span>

                {/* allowViewProgress visual checkbox toggle */}
                <div className="flex items-center gap-2 mt-2 bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800/40">
                  <input
                    id="settings-allow-progress-checkbox"
                    type="checkbox"
                    checked={allowProgress}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAllowProgress(val);
                      onUpdateProfile(playerName, currentUser.photoUrl, val);
                    }}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-800 focus:ring-amber-500 focus:ring-offset-slate-900 focus:ring-2 cursor-pointer"
                  />
                  <label htmlFor="settings-allow-progress-checkbox" className="text-[11px] text-slate-300 font-medium cursor-pointer select-none">
                    السماح للآخرين برؤية تقدمي بالتفصيل 👁️
                  </label>
                </div>
              </div>

              {/* Avatar with local Base64 uploader */}
              <div className="relative group">
                <div className="w-18 h-18 rounded-full overflow-hidden border-2 border-amber-400/80 bg-slate-800 flex items-center justify-center relative shadow-lg">
                  {currentUser.photoUrl ? (
                    <img 
                      src={currentUser.photoUrl} 
                      alt={playerName} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-2xl font-black text-amber-400">
                      {(playerName || currentUser.displayName || 'P').charAt(0).toUpperCase()}
                    </span>
                  )}
                  {isUpdatingProfile && (
                    <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center text-xs animate-pulse">⏳</div>
                  )}
                </div>
                <button
                  id="trigger-modal-avatar-upload"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -left-1 p-2 bg-slate-900 hover:bg-amber-400 border border-slate-800 text-slate-400 hover:text-slate-950 rounded-full transition cursor-pointer shadow-lg"
                  title="تغيير الصورة الشخصية"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

            </div>

            {/* COLLAPSIBLE MATCH HISTORY ROW */}
            <div id="settings-history-disclosure" className="border-t border-slate-900/60 pt-3">
              <button
                id="settings-toggle-match-history"
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition py-1 cursor-pointer font-bold"
              >
                <div className="flex items-center gap-1">
                  {showHistory ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="bg-slate-900 px-2 py-0.5 rounded text-[10px] text-amber-400">{historyList.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>عرض سجل مبارياتك السابقة</span>
                  <History className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </button>

              {showHistory && (
                <div id="settings-history-container" className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1 text-right">
                  {historyList.length === 0 ? (
                    <p className="text-slate-600 text-center text-xs py-4 font-semibold">لا توجد مباريات مسجلة حالياً، ابدأ اللعب لصنع مجدك! 🏆</p>
                  ) : (
                    historyList.map((item) => {
                      const isWon = item.won;
                      return (
                        <div id={`settings-hist-card-${item.id}`} key={item.id} className="p-3 bg-slate-900/80 rounded-xl border border-slate-800/60 flex items-center justify-between text-xs gap-2">
                          {/* Points scored */}
                          <div className="flex items-center gap-1">
                            <span className="text-amber-400 font-extrabold">{item.totalPoints}</span>
                            <span className="text-[10px] text-slate-500 font-bold">نقاط مجموع</span>
                          </div>

                          {/* Captured items counts */}
                          <div className="hidden sm:flex items-center gap-2">
                            <span className="text-[9px] text-slate-400">القطع الملتقطة:</span>
                            <div className="flex -space-x-1 justify-end">
                              <span title="أحمر" className="text-[10px]">🔴<span className="text-[9px] font-mono mr-0.5">{item.capturedRed}</span></span>
                              <span title="أزرق" className="text-[10px]">🔵<span className="text-[9px] font-mono mr-0.5">{item.capturedBlue}</span></span>
                              <span title="أخضر" className="text-[10px]">🟢<span className="text-[9px] font-mono mr-0.5">{item.capturedGreen}</span></span>
                              <span title="أصفر" className="text-[10px]">🟡<span className="text-[9px] font-mono mr-0.5">{item.capturedYellow}</span></span>
                              <span title="بنفسجي" className="text-[10px]">🟣<span className="text-[9px] font-mono mr-0.5">{item.capturedPurple}</span></span>
                            </div>
                          </div>

                          {/* Mode badge */}
                          <div className="text-[10px] text-slate-400 font-extrabold">
                            {item.mode === 'local_ai' ? '🤖 تحدي الكمبيوتر' : item.mode === 'online' ? '👥 أونلاين' : '🤺 لعب محلي'}
                          </div>

                          {/* Won/Lost state indicator */}
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold tracking-wide ${
                            isWon 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/15'
                          }`}>
                            {isWon ? 'فوز 🏆' : 'خسارة 💔'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
