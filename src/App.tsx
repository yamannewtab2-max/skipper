/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  GameSession, 
  Player, 
  GameMode, 
  SkipperColor,
  ChatMessage
} from './types';
import { 
  initializeBoard, 
  getValidJumpsFromIndex, 
  hasAnyValidJumpsLeft, 
  countCompleteSets, 
  computeBestMoveForAI,
  COLOR_METADATA,
  SKIPPER_COLORS
} from './gameUtils';
import { 
  createOnlineGame, 
  joinOnlineGame, 
  leaveOnlineGame,
  subscribeToGame, 
  updateGameData, 
  isFirebaseConfigured,
  ensureAuthenticated,
  logoutUser,
  loadUserProfile,
  saveUserProfile,
  saveGameHistory,
  loadGameHistory,
  saveGameSession,
  generateRoomCode,
  loadActiveGames,
  cleanupStaleGames,
  UserProfile,
  CompactHistoryItem,
  auth
} from './firebase';
import GameBoard from './components/GameBoard';
import Scoreboard from './components/Scoreboard';
import Lobby from './components/Lobby';
import HowToPlay from './components/HowToPlay';
import WinnerView from './components/WinnerView';
import SettingsModal from './components/SettingsModal';
import ChatBox from './components/ChatBox';
import { 
  Users, 
  Share2, 
  Copy, 
  Check, 
  LogOut, 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  HelpCircle, 
  CheckSquare, 
  History,
  Gamepad2,
  Home,
  Sparkles,
  Trophy,
  MessageCircle
} from 'lucide-react';

const AVATAR_COLORS = [
  'bg-amber-400 text-slate-950',
  'bg-emerald-400 text-slate-950',
  'bg-indigo-500 text-white',
  'bg-pink-500 text-white',
  'bg-sky-400 text-slate-950',
  'bg-violet-500 text-white'
];

// For generating unique browser-based client IDs
function getOrCreatePlayerId(): string {
  let pid = localStorage.getItem('skippity_p_id');
  if (!pid) {
    pid = 'p_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('skippity_p_id', pid);
  }
  return pid;
}

// Translates Firebase/Firestore error messages into polite, clear Arabic
function translateErrorMessage(msg: string): string {
  if (!msg) return 'حدث خطأ غير معروف.';
  const lowerMsg = msg.toLowerCase();
  if (lowerMsg.includes('permission') || lowerMsg.includes('insufficient')) {
    return 'عذراً، لا توجد صلاحيات كافية للوصول (قاعدة البيانات مغلقة أو تحتاج لتسجيل الدخول). يرجى التأكد من تفعيل قواعد البيانات وقواعد الحماية.';
  }
  if (lowerMsg.includes('not found') || lowerMsg.includes('exist')) {
    return 'عذراً، كود الغرفة غير موجود. يرجى التحقق وإعادة المحاولة.';
  }
  if (lowerMsg.includes('network') || lowerMsg.includes('offline')) {
    return 'يبدو أنك غير متصل بالإنترنت، يرجى التحقق من اتصال الشبكة وإعادة المحاولة.';
  }
  if (lowerMsg.includes('quota') || lowerMsg.includes('exceeded')) {
    return 'تم تجاوز الحد الأقصى للطلبات المتاحة حالياً، يرجى المحاولة لاحقاً.';
  }
  if (lowerMsg.includes('not configured')) {
    return 'قاعدة البيانات غير مفعلة الآن بلطف حاول لاحقاً.';
  }
  return msg;
}

export default function App() {
  const selfPlayerId = getOrCreatePlayerId();
  const hasRestoredSession = useRef(!!localStorage.getItem('skippity_active_session'));

  const [googleUser, setGoogleUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminModeOn, setAdminModeOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('skippity_admin_mode') === 'true';
    } catch (e) {
      return false;
    }
  });

  // Persist adminModeOn
  useEffect(() => {
    try {
      localStorage.setItem('skippity_admin_mode', adminModeOn ? 'true' : 'false');
    } catch (e) {}
  }, [adminModeOn]);
  const [historyList, setHistoryList] = useState<CompactHistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('skippity_guest_history') || '[]');
    } catch (e) {
      return [];
    }
  });
  const [showSettings, setShowSettings] = useState(false);

  // Subscribing to Google Auth changes
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setGoogleUser(user);
        setIsLobbyLoading(true);
        try {
          const uProfile = await loadUserProfile(user.uid);
          setProfile(uProfile);
          if (uProfile) {
            const hList = await loadGameHistory(user.uid);
            setHistoryList(hList);

            // Auto-restore progress on refresh / tab open
            if (uProfile.activeSessionId) {
              const code = uProfile.activeSessionId;
              const autoUnsub = subscribeToGame(
                code,
                (updatedSession) => {
                  const isActivelyInGame = viewStateRef.current === 'playing' || viewStateRef.current === 'waiting' || viewStateRef.current === 'finished';
                  if (updatedSession && (updatedSession.status !== 'finished' || isActivelyInGame)) {
                    setCurrentSession(updatedSession);
                    setOnlineRoomCode(code);
                    setGameMode(updatedSession.mode);

                    // Automatically restore viewState to the session status on first load
                    if (!hasRestoredSession.current) {
                      hasRestoredSession.current = true;
                      setViewState(updatedSession.status === 'playing' ? 'playing' : 'waiting');
                    }
                  } else {
                    // Session finished/deleted, clear association so they don't see go-back button
                    setCurrentSession(null);
                    setOnlineRoomCode(null);
                    saveUserProfile(user.uid, { activeSessionId: null }).catch(err => 
                      console.error('Error clearing stale activeSessionId:', err)
                    );
                    setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
                  }
                },
                (error) => {
                  console.error('Error auto-subscribing on load:', error);
                }
              );
              unsubscribeRef.current = autoUnsub;
            }
          }
        } catch (err) {
          console.error('Error loading Google user profile details:', err);
        } finally {
          setIsLobbyLoading(false);
        }
      } else {
        setGoogleUser(null);
        setProfile(null);
        try {
          const guestHistory = JSON.parse(localStorage.getItem('skippity_guest_history') || '[]');
          setHistoryList(guestHistory);
        } catch (e) {
          setHistoryList([]);
        }
      }
    });
    return unsub;
  }, []);

  // Automatically restore / initialize the user's view state and handle anonymous fallback if needed
  // No periodic cleanup on regular clients to avoid performance bottlenecks and Firestore read limits.

  const handleSignInGoogle = async () => {
    try {
      setIsLobbyLoading(true);
      setLobbyError(null);
      await ensureAuthenticated();
    } catch (err: any) {
      setLobbyError(err.message || 'فشل تسجيل الدخول عبر جوجل.');
    } finally {
      setIsLobbyLoading(false);
    }
  };

  const handleSignOutGoogle = async () => {
    try {
      setIsLobbyLoading(true);
      unsubscribeRef.current();
      unsubscribeRef.current = () => {};
      setCurrentSession(null);
      setOnlineRoomCode(null);
      await logoutUser();
      setViewState('lobby');
    } catch (err: any) {
      console.error('Sign Out failed', err);
    } finally {
      setIsLobbyLoading(false);
    }
  };

  const handleUpdateProfile = async (displayName: string, photoUrl: string | null, allowViewProgress?: boolean) => {
    if (!profile) return;
    try {
      const updated = { 
        displayName, 
        photoUrl, 
        ...(allowViewProgress !== undefined ? { allowViewProgress } : {}) 
      };
      await saveUserProfile(profile.uid, updated);
      setProfile(prev => prev ? { ...prev, ...updated } : null);
    } catch (err: any) {
      console.error('Failed to update Google developer profile:', err);
      setLobbyError('فشل تحديث الكنية والصورة.');
    }
  };

  const handleToggleAllowViewProgress = async (value: boolean) => {
    playSound('select');
    
    // 1. Update the local player profile if logged in
    if (profile) {
      try {
        const updated = { allowViewProgress: value };
        await saveUserProfile(profile.uid, updated);
        setProfile(prev => prev ? { ...prev, ...updated } : null);
      } catch (err) {
        console.error('Failed to update UserProfile for sharing:', err);
      }
    }

    // 2. Update the session player list (both online & offline)
    if (currentSession) {
      const hasSelfId = currentSession.players.some(p => p.id === selfPlayerId);
      const updatedPlayers = currentSession.players.map((p, idx) => {
        const isSelf = hasSelfId ? (p.id === selfPlayerId) : (idx === 0);
        return isSelf ? { ...p, allowViewProgress: value } : p;
      });
      
      if (gameMode === 'online') {
        try {
          await updateGameData(currentSession.id, { players: updatedPlayers });
        } catch (err) {
          console.error('Failed to update players sharing status online:', err);
        }
      } else {
        // Local games update memory state
        setCurrentSession(prev => prev ? { ...prev, players: updatedPlayers } : null);
      }
    }
  };

  const handleTogglePlayerLock = async (playerId: string, isLocked: boolean) => {
    playSound('select');
    if (!currentSession) return;

    const updatedPlayers = currentSession.players.map(p => 
      p.id === playerId ? { ...p, isLocked } : p
    );

    setCurrentSession(prev => prev ? { ...prev, players: updatedPlayers } : null);

    if (currentSession.id !== 'local_room') {
      try {
        await updateGameData(currentSession.id, { players: updatedPlayers });
      } catch (err) {
        console.error('Failed to update player lock status online:', err);
      }
    }
  };

  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showMyProgress, setShowMyProgress] = useState(true);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [isLobbyLoading, setIsLobbyLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Read invite code from URL on load
  const [roomCodeFromUrl, setRoomCodeFromUrl] = useState<string | null>(null);

  // App Master state
  const [viewState, setViewState] = useState<'lobby' | 'playing' | 'waiting' | 'finished'>(() => {
    try {
      const savedViewState = localStorage.getItem('skippity_view_state');
      if (savedViewState === 'playing' || savedViewState === 'waiting' || savedViewState === 'finished') {
        return savedViewState;
      }
    } catch (e) {}
    return 'lobby';
  });
  const viewStateRef = useRef(viewState);
  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const [gameMode, setGameMode] = useState<GameMode>(() => {
    try {
      const savedMode = localStorage.getItem('skippity_game_mode');
      if (savedMode) return savedMode as GameMode;
    } catch (e) {}
    return 'local_pass';
  });
  
  // Real-time synchronization
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(() => {
    try {
      return localStorage.getItem('skippity_online_room_code') || null;
    } catch (e) {}
    return null;
  });
  const unsubscribeRef = useRef<() => void>(() => {});

  // Complete offline state mimicry or online snapshot sync
  const [currentSession, setCurrentSession] = useState<GameSession | null>(() => {
    try {
      const savedSession = localStorage.getItem('skippity_active_session');
      if (savedSession) {
        return JSON.parse(savedSession);
      }
    } catch (e) {}
    return null;
  });
  const [nextAiGameStarter, setNextAiGameStarter] = useState<'human' | 'ai'>('human');
  const [isSpectator, setIsSpectator] = useState(false);

  // Save current game state to localStorage on every change to prevent losing progress on refresh
  useEffect(() => {
    if (currentSession) {
      localStorage.setItem('skippity_active_session', JSON.stringify(currentSession));
      localStorage.setItem('skippity_view_state', viewState);
      localStorage.setItem('skippity_game_mode', gameMode);
      if (onlineRoomCode) {
        localStorage.setItem('skippity_online_room_code', onlineRoomCode);
      } else {
        localStorage.removeItem('skippity_online_room_code');
      }
    } else {
      localStorage.removeItem('skippity_active_session');
      localStorage.removeItem('skippity_view_state');
      localStorage.removeItem('skippity_game_mode');
      localStorage.removeItem('skippity_online_room_code');
    }
  }, [currentSession, viewState, gameMode, onlineRoomCode]);

  // Chat states
  const [activeChatTab, setActiveChatTab] = useState<'public' | string>('public');
  const [openedPrivateChats, setOpenedPrivateChats] = useState<string[]>([]);
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, number>>({});
  const lastSeenMessageCountRef = useRef(0);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Exit confirmation states
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [exitConfirmType, setExitConfirmType] = useState<'exit' | 'resign' | null>(null);

  const hasUnreadPublicMessage = React.useMemo(() => {
    if (!currentSession || !currentSession.messages || gameMode !== 'online') return false;
    const lastRead = lastReadTimestamps['public'] || 0;
    return currentSession.messages.some(
      (msg) => !msg.recipientId && msg.senderId !== selfPlayerId && msg.timestamp > lastRead
    );
  }, [currentSession?.messages, lastReadTimestamps, gameMode, selfPlayerId]);

  // Transient interactive choices (for human active turn)
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number | null>(null);
  const [activePieceIndex, setActivePieceIndex] = useState<number | null>(null);
  const [hasJumpedThisTurn, setHasJumpedThisTurn] = useState(false);

  // Sound generator helper using Web Audio API (totally pure client, no external file dependencies!)
  const playSound = (type: 'select' | 'capture' | 'edge' | 'win') => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'select') {
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'capture') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // Slide up to A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'edge') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
        osc.frequency.setValueAtTime(987.77, ctx.currentTime + 0.08); // B5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.3); // C6
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      }
    } catch (e) {
      // Audio context block protection
    }
  };

  // Sync params from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomCodeFromUrl(room.trim().toUpperCase());
    }
    // Clean up stale games older than 10 minutes on mount
    cleanupStaleGames().catch(err => console.error('Stale games cleanup error on mount:', err));
  }, []);

  // Sync state transitions & game-ended rules
  useEffect(() => {
    if (!currentSession) return;

    // Guard: If the user is manually looking at the lobby/homepage, do not force them back automatically.
    if (viewState === 'lobby') return;

    if (currentSession.status === 'finished' && viewState !== 'finished') {
      setViewState('finished');
      playSound('win');
    } else if (currentSession.status === 'playing' && viewState !== 'playing') {
      setViewState('playing');
    } else if (currentSession.status === 'waiting' && viewState !== 'waiting') {
      setViewState('waiting');
    }
  }, [currentSession, viewState]);

  // Save game history when session switches to finished
  useEffect(() => {
    if (!currentSession || currentSession.status !== 'finished') return;
    if (currentSession.id === 'preview_room') return; // Do not record test views in the history list

    const savedGames = JSON.parse(localStorage.getItem('skippity_saved_games') || '[]');
    if (savedGames.includes(currentSession.id)) return;

    let userPlayer: Player | undefined;
    if (gameMode === 'online') {
      userPlayer = currentSession.players?.find(p => p.id === selfPlayerId);
    } else {
      userPlayer = currentSession.players?.[0];
    }

    if (!userPlayer) return;

    const totalCaptured = Object.values(userPlayer.captured || {}).reduce((s, v) => s + v, 0);
    const completeSets = countCompleteSets(userPlayer.captured);
    const totalPoints = completeSets * 5 + totalCaptured;

    const won = currentSession.winnerId === userPlayer.id;

    const historyItemInput = {
      won,
      mode: gameMode,
      capturedRed: userPlayer.captured?.red || 0,
      capturedBlue: userPlayer.captured?.blue || 0,
      capturedGreen: userPlayer.captured?.green || 0,
      capturedYellow: userPlayer.captured?.yellow || 0,
      capturedPurple: userPlayer.captured?.purple || 0,
      totalPoints
    };

    if (profile) {
      saveGameHistory(profile.uid, historyItemInput).then(() => {
        // Clear active session from profile
        saveUserProfile(profile.uid, { activeSessionId: null }).catch(err =>
          console.error('Error clearing activeSessionId on finish:', err)
        );

        savedGames.push(currentSession.id);
        localStorage.setItem('skippity_saved_games', JSON.stringify(savedGames));
        loadGameHistory(profile.uid).then(hs => setHistoryList(hs));
      }).catch(err => console.error('Error saving game history:', err));
    } else {
      // Offline/Guest player mode: save game statistics locally
      try {
        const guestHistory = JSON.parse(localStorage.getItem('skippity_guest_history') || '[]');
        const newLocalItem: CompactHistoryItem = {
          ...historyItemInput,
          id: 'local_h_' + Date.now(),
          playedAt: Date.now()
        };
        const updatedHistory = [newLocalItem, ...guestHistory];
        localStorage.setItem('skippity_guest_history', JSON.stringify(updatedHistory));
        
        savedGames.push(currentSession.id);
        localStorage.setItem('skippity_saved_games', JSON.stringify(savedGames));
        setHistoryList(updatedHistory);
      } catch (err) {
        console.error('Error saving guest game history:', err);
      }
    }

  }, [currentSession?.status, profile?.uid]);

  // Listen for new private/public messages to trigger auto-open and play sound alerts
  useEffect(() => {
    if (gameMode !== 'online' || !currentSession || !currentSession.messages) {
      lastSeenMessageCountRef.current = 0;
      return;
    }
    const messages = currentSession.messages;
    const msgCount = messages.length;

    if (msgCount > lastSeenMessageCountRef.current) {
      const newMessages = messages.slice(lastSeenMessageCountRef.current);

      newMessages.forEach((msg) => {
        if (msg.senderId === selfPlayerId) return;

        // If private message to us
        if (msg.recipientId === selfPlayerId) {
          // Just add the sender to opened private chats so the tab exists in the ChatBox
          setOpenedPrivateChats((prev) => {
            if (!prev.includes(msg.senderId)) {
              return [...prev, msg.senderId];
            }
            return prev;
          });
          playSound('capture');
        } else if (!msg.recipientId) {
          playSound('select');
        }
      });

      lastSeenMessageCountRef.current = msgCount;
    }
  }, [currentSession?.messages, gameMode, selfPlayerId]);

  // Mark active chat tab as read
  useEffect(() => {
    if (activeChatTab && isChatOpen) {
      setLastReadTimestamps((prev) => ({
        ...prev,
        [activeChatTab]: Date.now(),
      }));
    }
  }, [activeChatTab, isChatOpen, currentSession?.messages?.length]);

  const unreadChatPlayerIds = React.useMemo(() => {
    if (!currentSession || !currentSession.messages || gameMode !== 'online') return [];
    const unreads: string[] = [];

    currentSession.players.forEach((player) => {
      if (player.id === selfPlayerId) return;
      const lastRead = lastReadTimestamps[player.id] || 0;

      const hasNew = currentSession.messages?.some(
        (msg) =>
          msg.senderId === player.id &&
          msg.recipientId === selfPlayerId &&
          msg.timestamp > lastRead
      );
      if (hasNew) {
        unreads.push(player.id);
      }
    });

    return unreads;
  }, [currentSession?.messages, lastReadTimestamps, gameMode, selfPlayerId]);

  const handleOpenPrivateChat = (partnerId: string) => {
    setOpenedPrivateChats((prev) => {
      if (!prev.includes(partnerId)) {
        return [...prev, partnerId];
      }
      return prev;
    });
    setActiveChatTab(partnerId);
    setIsChatOpen(true);
    setLastReadTimestamps((prev) => ({
      ...prev,
      [partnerId]: Date.now(),
    }));
  };

  const handleClosePrivateTab = (partnerId: string) => {
    setOpenedPrivateChats((prev) => prev.filter((id) => id !== partnerId));
    if (activeChatTab === partnerId) {
      setActiveChatTab('public');
    }
  };

  const handleSendMessage = async (text: string, recipientId?: string, isTeamChat?: boolean, team?: 'A' | 'B') => {
    if (!currentSession || !onlineRoomCode) return;

    const ourPlayer = currentSession.players.find((p) => p.id === selfPlayerId);
    let senderName = ourPlayer ? ourPlayer.name : 'لاعب أونلاين';
    if (googleUser?.email === 'yamannewtab@gmail.com') {
      senderName = `${googleUser.displayName || 'Yaman'} (المشرف 👑)`;
    }

    const newMessage: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      senderId: selfPlayerId,
      senderName,
      text,
      timestamp: Date.now(),
    };

    if (recipientId) {
      newMessage.recipientId = recipientId;
    }
    if (isTeamChat) {
      newMessage.isTeamChat = isTeamChat;
      newMessage.team = team;
    }

    const updatedMessages = [...(currentSession.messages || []), newMessage];

    try {
      await updateGameData(onlineRoomCode, { messages: updatedMessages });
    } catch (err) {
      console.error('Failed to send chat message:', err);
    }
  };

  // AI computer move triggers
  useEffect(() => {
    if (!currentSession || currentSession.status !== 'playing') return;
    if (gameMode !== 'local_ai' && gameMode !== 'local_fast_ai') return;

    const activePlayer = currentSession.players.find(p => p.id === currentSession.currentTurnPlayerId);
    if (!activePlayer || !activePlayer.id.startsWith('ai_bot')) return;

    // AI thinking block simulator - warp speed (100ms) for fast AI mode
    const delay = gameMode === 'local_fast_ai' ? 100 : 1500;
    const timer = setTimeout(() => {
      executeAITurn();
    }, delay);

    return () => clearTimeout(timer);
  }, [currentSession?.currentTurnPlayerId, currentSession?.status, gameMode]);

  // Trigger AI logic
  const executeAITurn = async () => {
    if (!currentSession) return;

    const aiPlayer = currentSession.players.find(p => p.id === currentSession.currentTurnPlayerId);
    if (!aiPlayer) return;

    const bestMove = computeBestMoveForAI(currentSession.board, aiPlayer.captured, currentSession.aiDifficulty || 'medium');
    if (!bestMove) {
      // AI cannot move anywhere. Lock board or skip / end
      concludeGameOffline();
      return;
    }

    let currentBoardState = [...currentSession.board];
    let currentCaptured = { ...aiPlayer.captured };
    let tempHistory = [...currentSession.history];

    // Animating / playing each jump step by step
    for (let i = 0; i < bestMove.jumps.length; i++) {
      const jump = bestMove.jumps[i];
      const activeColor = currentBoardState[jump.startIndex];
      
      // Phase 1: Highlight starting piece first
      setCurrentSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          selectedPieceIndex: jump.startIndex,
          activePieceIndex: null,
          lastUpdated: Date.now()
        };
      });

      // Warp speed delay (30ms vs 600ms) for fast simulation
      const startDelay = gameMode === 'local_fast_ai' ? 30 : 600;
      await new Promise(resolve => setTimeout(resolve, startDelay));

      // Phase 2: Execute actual jump on the board
      currentBoardState[jump.startIndex] = null;
      currentBoardState[jump.middleIndex] = null;
      currentBoardState[jump.endIndex] = activeColor;
      
      currentCaptured[jump.capturedColor] = (currentCaptured[jump.capturedColor] || 0) + 1;
      
      const stepLog = `${aiPlayer.name} يقفز فوق قطعة لأسْر ${COLOR_METADATA[jump.capturedColor].name}`;
      tempHistory.push(stepLog);

      // Don't play capture sounds on warp simulation so it's not noisy
      if (gameMode !== 'local_fast_ai') {
        playSound('capture');
      }

      // Update intermediate state with selected piece now at the landing square
      setCurrentSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          board: currentBoardState,
          players: prev.players.map(p => {
            if (prev.mode === 'team' && aiPlayer.team && p.team === aiPlayer.team) return { ...p, captured: { ...currentCaptured } };
            return p.id === aiPlayer.id ? { ...p, captured: { ...currentCaptured } } : p;
          }),
          history: [...tempHistory],
          selectedPieceIndex: null,
          activePieceIndex: jump.endIndex,
          lastUpdated: Date.now()
        };
      });

      // Warp speed landing delay (40ms vs 900ms) for fast simulation
      const endDelay = gameMode === 'local_fast_ai' ? 40 : 900;
      await new Promise(resolve => setTimeout(resolve, endDelay));
    }

    // Toggle turn back to next Player in order (cycle players)
    const activeIdx = currentSession.players.findIndex(p => p.id === aiPlayer.id);
    const nextPlayerIdx = (activeIdx + 1) % currentSession.players.length;
    const nextPlayer = currentSession.players[nextPlayerIdx];
    
    let gameStatus = currentSession.status;
    let finalWinnerId = currentSession.winnerId;

    const newPlayers = currentSession.players.map(p => p.id === aiPlayer.id ? { ...p, captured: { ...currentCaptured } } : p);

    if (!hasAnyValidJumpsLeft(currentBoardState)) {
      gameStatus = 'finished';
      finalWinnerId = calculateWinnerId(newPlayers);
      tempHistory.push('تنتهي اللعبة لعدم وجود قفزات متبقية على اللوح!');
    }

    if (profile && currentSession?.id && currentSession.id !== 'local_room') {
      setSelectedPieceIndex(null);
      await updateGameData(currentSession.id, {
        board: currentBoardState,
        players: newPlayers,
        currentTurnPlayerId: nextPlayer.id,
        activePieceIndex: null,
        history: [...tempHistory],
        status: gameStatus,
        winnerId: finalWinnerId
      });
    } else {
      setCurrentSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          board: currentBoardState,
          players: newPlayers,
          currentTurnPlayerId: nextPlayer.id,
          activePieceIndex: null,
          selectedPieceIndex: null,
          history: [...tempHistory],
          status: gameStatus,
          winnerId: finalWinnerId,
          lastUpdated: Date.now()
        };
      });
    }
  };

  /**
   * Helper to calculate winner ID based on sets and piece count
   */
  const calculateWinnerId = (playersList: Player[]): string | null => {
    if (playersList.length === 0) return null;
    let bId = playersList[0].id;
    let bSets = countCompleteSets(playersList[0].captured);
    let bPieces = Object.values(playersList[0].captured).reduce((s, v) => s + v, 0);

    for (let i = 1; i < playersList.length; i++) {
      const p = playersList[i];
      const pSets = countCompleteSets(p.captured);
      const pPieces = Object.values(p.captured).reduce((s, v) => s + v, 0);

      if (pSets > bSets) {
        bSets = pSets;
        bId = p.id;
        bPieces = pPieces;
      } else if (pSets === bSets) {
        if (pPieces > bPieces) {
          bId = p.id;
          bPieces = pPieces;
        }
      }
    }
    return bId;
  };

  const concludeGameOffline = () => {
    if (!currentSession) return;
    setCurrentSession(prev => {
      if (!prev) return null;
      const winnerId = calculateWinnerId(prev.players);
      return {
        ...prev,
        status: 'finished',
        winnerId,
        history: [...prev.history, 'تنتهي اللعبة لعدم وجود قفزات متبقية في اللوح!']
      };
    });
  };

  // Launch local game helper
  const handleStartLocalGame = (mode: 'local_ai' | 'local_pass' | 'local_fast_ai' | 'local_team', playerNames: string[], difficulty?: 'easy' | 'medium' | 'hard') => {
    playSound('select');
    setGameMode(mode);
    setLobbyError(null);

    const initialBoardList = initializeBoard();
    const mockPlayers: Player[] = playerNames.map((name, idx) => {
      const isAI = (idx > 0 && mode === 'local_ai') || mode === 'local_fast_ai';
      return {
        id: isAI ? `ai_bot_${idx}` : `local_p_${idx}`,
        name: name,
        color: AVATAR_COLORS[idx % AVATAR_COLORS.length],
        team: mode === 'local_team' ? (idx % 2 === 0 ? 'A' : 'B') : undefined,
        isHost: idx === 0,
        captured: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
        isActive: true,
        photoUrl: idx === 0 && profile ? profile.photoUrl : (isAI ? 'ai_avatar' : null),
        allowViewProgress: idx === 0 && profile ? (profile.allowViewProgress !== false) : true
      };
    });

    let startingPlayerId = mockPlayers[0].id; // Default: human starts
    if (mode === 'local_ai') {
      if (nextAiGameStarter === 'ai') {
        const firstAi = mockPlayers.find(p => p.id.startsWith('ai_bot'));
        startingPlayerId = firstAi ? firstAi.id : mockPlayers[0].id;
        setNextAiGameStarter('human');
      } else {
        startingPlayerId = mockPlayers[0].id;
        setNextAiGameStarter('ai');
      }
    } else if (mode === 'local_fast_ai') {
      startingPlayerId = mockPlayers[0].id;
    }

    const roomId = profile ? 'L_' + generateRoomCode() : 'local_room';

    const localSession: GameSession = {
      id: roomId,
      status: 'playing',
      mode: mode,
      board: initialBoardList,
      players: mockPlayers,
      currentTurnPlayerId: startingPlayerId,
      activePieceIndex: null,
      winnerId: null,
      history: [
        startingPlayerId.startsWith('ai_bot')
          ? 'بدأت الجولة بنجاح. الدور الأول للكمبيوتر للبدء 🤖.'
          : 'بدأت الجولة بنجاح. الدور الأول لك للبدء 👤.'
      ],
      aiDifficulty: difficulty || 'medium',
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };

    if (profile) {
      // Clean up previous subscription if any
      unsubscribeRef.current();
      unsubscribeRef.current = () => {};

      // Save to Firestore and profile first
      saveGameSession(roomId, localSession).then(() => {
        saveUserProfile(profile.uid, { activeSessionId: roomId });
      }).catch(err => console.error('Error saving local game session to Cloud:', err));

      // Subscribe for full real-time updates
      const unsub = subscribeToGame(
        roomId,
        (updatedSession) => {
          if (updatedSession) {
            setCurrentSession(updatedSession);
          } else {
            setCurrentSession(null);
            setOnlineRoomCode(null);
            setViewState('lobby');
            if (profile) {
              saveUserProfile(profile.uid, { activeSessionId: null }).catch(() => {});
              setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
            }
          }
        },
        (error) => {
          console.error('Error in local game subscription:', error);
        }
      );
      unsubscribeRef.current = unsub;
      setOnlineRoomCode(roomId);
    } else {
      setCurrentSession(localSession);
    }
    setViewState('playing');
  };

  // Host Online game
  const handleCreateOnlineGame = async (hostName: string, colorClass: string, mode: GameMode = 'online') => {
    if (!isFirebaseConfigured) {
      setLobbyError('قاعدة البيانات غير مفعلة الآن بلطف حاول لاحقاً.');
      return;
    }
    try {
      setIsLobbyLoading(true);
      setLobbyError(null);
      playSound('select');

      // Unsubscribe from any active session first
      try {
        unsubscribeRef.current();
      } catch (e) {}
      unsubscribeRef.current = () => {};

      const code = await createOnlineGame(
        hostName, 
        selfPlayerId, 
        colorClass, 
        profile?.photoUrl, 
        profile?.allowViewProgress !== false,
        mode
      );
      setOnlineRoomCode(code);
      setGameMode(mode);

      if (profile) {
        await saveUserProfile(profile.uid, { activeSessionId: code });
      }

      // Subscribe to real-time syncs
      const unsub = subscribeToGame(
        code,
        (updatedSession) => {
          if (updatedSession) {
            setCurrentSession(updatedSession);
          } else {
            setCurrentSession(null);
            setOnlineRoomCode(null);
            setViewState('lobby');
            if (profile) {
              saveUserProfile(profile.uid, { activeSessionId: null }).catch(() => {});
              setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
            }
          }
        },
        (error) => {
          setLobbyError(translateErrorMessage(error.message) || 'حدث خطأ في مزامنة اللعبة من السيرفر.');
        }
      );
      unsubscribeRef.current = unsub;
      setViewState('waiting');
    } catch (err: any) {
      setLobbyError(translateErrorMessage(err.message) || 'خطأ أثناء إنشاء الغرفة.');
    } finally {
      setIsLobbyLoading(false);
    }
  };

  // Join existing Online room
  const handleJoinOnlineGame = async (roomCode: string, playerName: string, colorClass: string) => {
    if (!isFirebaseConfigured) {
      setLobbyError('قاعدة البيانات غير مفعلة.');
      return;
    }
    try {
      setIsLobbyLoading(true);
      setLobbyError(null);
      playSound('select');

      // Unsubscribe from any active session first
      try {
        unsubscribeRef.current();
      } catch (e) {}
      unsubscribeRef.current = () => {};

      const cleanCode = roomCode.trim().toUpperCase();
      const session = await joinOnlineGame(
        cleanCode, 
        playerName, 
        selfPlayerId, 
        colorClass, 
        profile?.photoUrl, 
        profile?.allowViewProgress !== false
      );
      setOnlineRoomCode(cleanCode);
      setGameMode('online');

      if (profile) {
        await saveUserProfile(profile.uid, { activeSessionId: cleanCode });
      }

      // Subscribe
      const unsub = subscribeToGame(
        cleanCode,
        (updatedSession) => {
          if (updatedSession) {
            setCurrentSession(updatedSession);
          } else {
            setCurrentSession(null);
            setOnlineRoomCode(null);
            setViewState('lobby');
            if (profile) {
              saveUserProfile(profile.uid, { activeSessionId: null }).catch(() => {});
              setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
            }
          }
        },
        (error) => {
          setLobbyError(translateErrorMessage(error.message) || 'حدث خطأ في الاشتراك في الغرفة.');
        }
      );
      unsubscribeRef.current = unsub;
      setViewState('playing'); // immediately loaded
    } catch (err: any) {
      setLobbyError(translateErrorMessage(err.message) || 'فشل الانضمام إلى الغرفة.');
    } finally {
      setIsLobbyLoading(false);
    }
  };

  // Spectate an online game session as admin (read-only and chat)
  const handleAdminSpectateGame = async (roomCode: string) => {
    if (!isFirebaseConfigured) {
      setLobbyError('قاعدة البيانات غير مفعلة.');
      return;
    }
    try {
      setIsLobbyLoading(true);
      setLobbyError(null);
      playSound('select');

      // Unsubscribe from any active session first
      try {
        unsubscribeRef.current();
      } catch (e) {}
      unsubscribeRef.current = () => {};

      const cleanCode = roomCode.trim().toUpperCase();
      setOnlineRoomCode(cleanCode);
      setGameMode('online');

      // Subscribe to real-time updates without writing to active players list
      const unsub = subscribeToGame(
        cleanCode,
        (updatedSession) => {
          if (updatedSession) {
            setCurrentSession(updatedSession);
            setViewState(updatedSession.status === 'playing' ? 'playing' : 'waiting');
          } else {
            setCurrentSession(null);
            setOnlineRoomCode(null);
            setViewState('lobby');
            if (profile) {
              saveUserProfile(profile.uid, { activeSessionId: null }).catch(() => {});
              setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
            }
          }
        },
        (error) => {
          setLobbyError(translateErrorMessage(error.message) || 'حدث خطأ في الاشتراك في الغرفة.');
        }
      );
      unsubscribeRef.current = unsub;
    } catch (err: any) {
      setLobbyError(translateErrorMessage(err.message) || 'فشل مراقبة الغرفة.');
    } finally {
      setIsLobbyLoading(false);
    }
  };

  // Host triggers startGame Online
  const handleHostStartOnlineGame = async () => {
    if (!currentSession || !onlineRoomCode) return;
    try {
      playSound('select');
      const startingPlayerId = currentSession.players[0]?.id || currentSession.currentTurnPlayerId;
      await updateGameData(onlineRoomCode, {
        status: 'playing',
        currentTurnPlayerId: startingPlayerId,
        history: [...currentSession.history, 'أطلق المستضيف اللعبة الآن! حظاً موفقاً للجميع.']
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Piece Selection on Board
  const handleSelectPiece = (index: number) => {
    if (hasJumpedThisTurn) return; // committed to the active jump piece
    playSound('select');
    setSelectedPieceIndex(index);
  };

  // Execute human jump action
  const handleExecuteJump = async (startIndex: number, middleIndex: number, endIndex: number) => {
    if (!currentSession) return;

    const updatedBoard = [...currentSession.board];
    const movingColor = updatedBoard[startIndex] as SkipperColor;
    const capturedColor = updatedBoard[middleIndex] as SkipperColor;

    if (!movingColor || !capturedColor) return;

    // Remove middle and start, move to end
    updatedBoard[startIndex] = null;
    updatedBoard[middleIndex] = null;
    updatedBoard[endIndex] = movingColor;

    playSound('capture');

    // Update current player's captures
    const currentPlayerId = currentSession.currentTurnPlayerId;
    const currentPlayer = currentSession.players.find(pl => pl.id === currentPlayerId);
    
    const updatedPlayers = currentSession.players.map((p) => {
      if (currentSession.mode === 'team' && currentPlayer?.team && p.team === currentPlayer.team) {
        const caps = { ...p.captured };
        caps[capturedColor] = (caps[capturedColor] || 0) + 1;
        return { ...p, captured: caps };
      } else if (p.id === currentPlayerId) {
        const caps = { ...p.captured };
        caps[capturedColor] = (caps[capturedColor] || 0) + 1;
        return { ...p, captured: caps };
      }
      return p;
    });

    const activePlayerName = currentSession.players.find(p => p.id === currentPlayerId)?.name || 'اللاعب';
    const newLogItem = `اللاعب ${activePlayerName} قفز وأسر قطعة ${COLOR_METADATA[capturedColor].name}`;

    // Compute if subsequent jumps are possible from endIndex with this piece
    const nextJumps = getValidJumpsFromIndex(updatedBoard, endIndex);
    const canJumpMore = nextJumps.length > 0;

    setSelectedPieceIndex(null);

    if (canJumpMore) {
      // Transition to active chain mode
      setHasJumpedThisTurn(true);
      setActivePieceIndex(endIndex);

      // Optimistic UI Update: update the board locally immediately for instantaneous visual feedback
      setCurrentSession({
        ...currentSession,
        board: updatedBoard,
        players: updatedPlayers,
        activePieceIndex: endIndex,
        history: [...currentSession.history, newLogItem]
      });

      if (profile && currentSession?.id && currentSession.id !== 'local_room') {
        // Run Firestore update in background (do NOT await it to keep UI perfectly fluid)
        updateGameData(currentSession.id, {
          board: updatedBoard,
          players: updatedPlayers,
          activePieceIndex: endIndex,
          history: [...currentSession.history, newLogItem]
        }).catch((err) => {
          console.error('Optimistic write failed, reverting to previous state:', err);
        });
      }
    } else {
      // No standard more jumps. Conclude turn
      concludeTurnDirectly(updatedBoard, updatedPlayers, endIndex, [...currentSession.history, newLogItem]);
    }
  };

  // Finalizes the turn either automatically or manually via "End Turn" button
  const concludeTurnDirectly = async (
    targetBoard: (SkipperColor | null)[],
    targetPlayers: Player[],
    endingIndex: number,
    historyLogs: string[]
  ) => {
    if (!currentSession) return;

    const updatedBoard = [...targetBoard];
    const updatedPlayers = [...targetPlayers];
    const currentPlayerId = currentSession.currentTurnPlayerId;
    const activePlayerIdx = updatedPlayers.findIndex((p) => p.id === currentPlayerId);
    const activePlayer = updatedPlayers[activePlayerIdx];

    // Determine next player turn
    const activeIdx = currentSession.players.findIndex((p) => p.id === currentPlayerId);
    const nextPlayerIdx = (activeIdx + 1) % currentSession.players.length;
    const nextTurnPlayerId = currentSession.players[nextPlayerIdx].id;

    // Reset loop states
    setHasJumpedThisTurn(false);
    setSelectedPieceIndex(null);
    setActivePieceIndex(null);

    // Turn finished actions
    let gameStatus = currentSession.status;
    let finalWinnerId = currentSession.winnerId;

    if (!hasAnyValidJumpsLeft(updatedBoard)) {
      gameStatus = 'finished';
      finalWinnerId = calculateWinnerId(updatedPlayers);
      historyLogs.push('تنتهي اللعبة لعدم وجود قفزات متبقية على اللوح!');
    }

    // Optimistic UI Update: change turn and update board locally immediately
    setCurrentSession({
      ...currentSession,
      board: updatedBoard,
      players: updatedPlayers,
      currentTurnPlayerId: nextTurnPlayerId,
      activePieceIndex: null,
      history: historyLogs,
      status: gameStatus,
      winnerId: finalWinnerId
    });

    if (profile && currentSession?.id && currentSession.id !== 'local_room') {
      // Run Firestore update in background (do NOT await it to keep UI perfectly fluid)
      updateGameData(currentSession.id, {
        board: updatedBoard,
        players: updatedPlayers,
        currentTurnPlayerId: nextTurnPlayerId,
        activePieceIndex: null,
        history: historyLogs,
        status: gameStatus,
        winnerId: finalWinnerId
      }).catch((err) => {
        console.error('Optimistic turn write failed:', err);
      });
    }
  };

  // Trigger manually ending turn
  const handleManualEndTurn = () => {
    if (!currentSession || activePieceIndex === null) return;
    concludeTurnDirectly(
      currentSession.board,
      currentSession.players,
      activePieceIndex,
      [...currentSession.history, 'أنهى اللاعب دوره يدوياً.']
    );
  };

  // Leave online lobby / waiting room
  const handleLeaveLobby = async () => {
    playSound('select');
    if (gameMode === 'online' && onlineRoomCode && currentSession) {
      const isSpec = !currentSession.players.some(p => p.id === selfPlayerId);
      if (!isSpec) {
        try {
          await leaveOnlineGame(onlineRoomCode, selfPlayerId);
        } catch (err) {
          console.error('Error leaving waiting lobby:', err);
        }
      }
    }

    // Clear active session from profile
    if (profile) {
      saveUserProfile(profile.uid, { activeSessionId: null }).catch(err =>
        console.error('Error clearing activeSessionId on exit:', err)
      );
      setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
    }

    // Unsubscribe and reset state
    try {
      unsubscribeRef.current();
    } catch (e) {}
    unsubscribeRef.current = () => {};

    setCurrentSession(null);
    setOnlineRoomCode(null);
    setViewState('lobby');
    
    // Reset chat states
    setActiveChatTab('public');
    setOpenedPrivateChats([]);
    setLastReadTimestamps({});
    lastSeenMessageCountRef.current = 0;
    setIsChatOpen(false);
  };

  // Surrender / Resign from active game
  const handleResignGame = async (bypassConfirm = false) => {
    playSound('select');
    const isSpec = gameMode === 'online' && currentSession ? !currentSession.players.some(p => p.id === selfPlayerId) : false;

    if (isSpec) {
      // Spectators should leave completely, unsubscribe, and clear activeSessionId instantly
      try {
        unsubscribeRef.current();
      } catch (e) {}
      unsubscribeRef.current = () => {};

      if (profile) {
        saveUserProfile(profile.uid, { activeSessionId: null }).catch(err =>
          console.error('Error clearing activeSessionId on spectator leave:', err)
        );
        setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
      }

      setCurrentSession(null);
      setOnlineRoomCode(null);
      setViewState('lobby');
      setHasJumpedThisTurn(false);
      setSelectedPieceIndex(null);
      setActivePieceIndex(null);

      // Reset chat states
      setActiveChatTab('public');
      setOpenedPrivateChats([]);
      setLastReadTimestamps({});
      lastSeenMessageCountRef.current = 0;
      setIsChatOpen(false);
      return;
    }

    if (!bypassConfirm && currentSession) {
      setExitConfirmType('resign');
      setShowExitConfirm(true);
      return;
    }
    if (gameMode === 'online' && onlineRoomCode && currentSession) {
      try {
        await leaveOnlineGame(onlineRoomCode, selfPlayerId);
      } catch (err) {
        console.error('Error resigning game:', err);
      }
    }

    // Clear active session from profile
    if (profile) {
      saveUserProfile(profile.uid, { activeSessionId: null }).catch(err =>
        console.error('Error clearing activeSessionId on resign:', err)
      );
      setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
    }

    // Unsubscribe and reset state
    try {
      unsubscribeRef.current();
    } catch (e) {}
    unsubscribeRef.current = () => {};

    setCurrentSession(null);
    setOnlineRoomCode(null);
    setViewState('lobby');
    setHasJumpedThisTurn(false);
    setSelectedPieceIndex(null);
    setActivePieceIndex(null);

    // Reset chat states
    setActiveChatTab('public');
    setOpenedPrivateChats([]);
    setLastReadTimestamps({});
    lastSeenMessageCountRef.current = 0;
    setIsChatOpen(false);
  };

  // Exit game to main menu (does NOT kick from active sessions)
  const handleExitGame = (bypassConfirm = false) => {
    playSound('select');

    const isSpec = gameMode === 'online' && currentSession ? !currentSession.players.some(p => p.id === selfPlayerId) : false;

    if (isSpec) {
      // Spectators should exit completely, unsubscribe, and clear activeSessionId instantly
      try {
        unsubscribeRef.current();
      } catch (e) {}
      unsubscribeRef.current = () => {};

      if (profile) {
        saveUserProfile(profile.uid, { activeSessionId: null }).catch(err =>
          console.error('Error clearing activeSessionId on exit:', err)
        );
        setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
      }

      setCurrentSession(null);
      setOnlineRoomCode(null);
      setViewState('lobby');
      setHasJumpedThisTurn(false);
      setSelectedPieceIndex(null);
      setActivePieceIndex(null);

      // Reset chat states
      setActiveChatTab('public');
      setOpenedPrivateChats([]);
      setLastReadTimestamps({});
      lastSeenMessageCountRef.current = 0;
      setIsChatOpen(false);
      return;
    }

    if (!bypassConfirm && currentSession && (currentSession.status === 'playing' || currentSession.status === 'waiting')) {
      setExitConfirmType('exit');
      setShowExitConfirm(true);
      return;
    }

    // If game is actively 'playing' or 'waiting', make sure to leave online session if applicable
    if (currentSession && (currentSession.status === 'playing' || currentSession.status === 'waiting')) {
      if (gameMode === 'online' && onlineRoomCode) {
        leaveOnlineGame(onlineRoomCode, selfPlayerId).catch(err =>
          console.error('Error leaving online game on exit:', err)
        );
      }
    }

    // Otherwise, if the game is finished, we can safely clean up
    try {
      unsubscribeRef.current();
    } catch (e) {}
    unsubscribeRef.current = () => {};

    if (profile) {
      saveUserProfile(profile.uid, { activeSessionId: null }).catch(err =>
        console.error('Error clearing activeSessionId on exit:', err)
      );
      setProfile(prev => prev ? { ...prev, activeSessionId: null } : null);
    }

    setCurrentSession(null);
    setOnlineRoomCode(null);
    setViewState('lobby');
    setHasJumpedThisTurn(false);
    setSelectedPieceIndex(null);
    setActivePieceIndex(null);

    // Reset chat states
    setActiveChatTab('public');
    setOpenedPrivateChats([]);
    setLastReadTimestamps({});
    lastSeenMessageCountRef.current = 0;
    setIsChatOpen(false);
  };

  // Helper to preview winner template screen easily for verification & debugging
  const handlePreviewWinnerView = () => {
    playSound('select');
    const previewPlayers: Player[] = [
      {
        id: 'player_mock_1',
        name: profile?.displayName || 'اللاعب الأول (أنت)',
        color: 'bg-amber-400 text-slate-950',
        isHost: true,
        isActive: true,
        captured: { red: 5, blue: 3, green: 4, yellow: 2, purple: 3 }
      },
      {
        id: 'player_mock_2',
        name: 'الكمبيوتر الذكي 🤖',
        color: 'bg-emerald-400 text-slate-950',
        isHost: false,
        isActive: false,
        captured: { red: 2, blue: 4, green: 2, yellow: 3, purple: 1 }
      },
      {
        id: 'player_mock_3',
        name: 'مساعد ذكي',
        color: 'bg-indigo-500 text-white',
        isHost: false,
        isActive: false,
        captured: { red: 1, blue: 2, green: 2, yellow: 1, purple: 2 }
      },
      {
        id: 'player_mock_4',
        name: 'لاعب 4 المحترف',
        color: 'bg-pink-500 text-white',
        isHost: false,
        isActive: false,
        captured: { red: 0, blue: 1, green: 3, yellow: 0, purple: 1 }
      }
    ];

    setCurrentSession({
      id: 'preview_room',
      mode: 'local_pass',
      status: 'finished',
      board: [],
      players: previewPlayers,
      currentTurnPlayerId: 'player_mock_1',
      aiDifficulty: 'medium',
      history: ['جولة اختبار ومعاينة شاشة الفائز بنجاح!'],
      winnerId: 'player_mock_1',
      lastUpdated: Date.now()
    });
    setViewState('finished');
  };

  // Restart offline game session
  const handleRestartGameOffline = () => {
    playSound('select');
    if (gameMode === 'online') return;
    if (currentSession?.id === 'preview_room') {
      handlePreviewWinnerView();
      return;
    }

    const names = currentSession?.players.map((p) => p.name) || ['لاعب 1'];

    handleStartLocalGame(gameMode, names, currentSession?.aiDifficulty);
  };

  // Copy Online Lobby link to encourage sharing
  const handleCopyInviteLink = () => {
    if (!onlineRoomCode) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${onlineRoomCode}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      })
      .catch((err) => console.error('Failed to copy.'));
  };

  const isPlayerSpectator = gameMode === 'online' && currentSession ? !currentSession.players.some(p => p.id === selfPlayerId) : false;

  return (
    <div id="app-root-container" className="min-h-screen bg-slate-950 font-sans text-right pb-12">
      {/* Dynamic Animated subtle Background */}
      <div id="sky-grid" className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* Primary Navigation Header */}
      <header id="app-nav-header" className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between border-b border-slate-900 mb-6 sm:mb-8 relative z-50 gap-2">
        {/* Brand logo & title (renders on the right under RTL) */}
        <div id="navbar-brand" className="flex items-center gap-1.5 sm:gap-3 cursor-pointer select-none" onClick={handleExitGame}>
          <div id="brand-avatar-stack" className="hidden sm:flex -space-x-1.5 justify-end">
            <span className="text-sm">🟣</span>
            <span className="text-sm">🔴</span>
            <span className="text-sm">🟡</span>
          </div>
          <div>
            <h1 className="text-sm sm:text-base md:text-lg font-black bg-gradient-to-l from-amber-400 via-yellow-300 to-emerald-400 bg-clip-text text-transparent">
              لعبة سكيبتي - Skippity
            </h1>
            <p className="hidden sm:block text-[9px] text-slate-500 font-bold mt-0.5 text-left">ذكاء وتخطيط متواصل</p>
          </div>
        </div>

        {/* Global navigation and action options (renders on the left under RTL) */}
        <div id="sub-nav-options" className="flex items-center gap-1.5 sm:gap-3">
          {/* Quick manual overlay button */}
          <button
            id="toggle-quick-manual-btn"
            onClick={() => setShowHowToPlay((p) => !p)}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:text-white transition duration-200 text-slate-400 flex items-center gap-1 cursor-pointer text-xs font-bold"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">كيفية اللعب</span>
          </button>

          {/* Audio context clicker */}
          <button
            id="toggle-sound-btn"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:text-white transition duration-200 text-slate-400 cursor-pointer"
            title={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تشغيل المؤثرات الصوتية'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-red-400" />}
          </button>

          {profile && (
            <button
              id="header-profile-btn"
              onClick={() => {
                playSound('select');
                setShowSettings(true);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-amber-400 bg-slate-900 flex items-center justify-center transition hover:scale-105 hover:border-amber-300 cursor-pointer shadow-lg"
              title="الإعدادات والملف الشخصي"
            >
              {profile.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt={profile.displayName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-xs sm:text-sm font-black text-amber-400">
                  {profile.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          )}

          {/* Dynamically context-sensitive navigation controls (renders furthest left in the group under RTL) */}
          {viewState === 'lobby' && currentSession && (currentSession.status === 'playing' || currentSession.status === 'waiting') && (
            <button
              id="header-back-to-active-session-btn"
              onClick={() => {
                playSound('select');
                setViewState(currentSession.status === 'playing' ? 'playing' : 'waiting');
              }}
              className="px-2.5 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 text-xs font-black flex items-center gap-1.5 sm:gap-2 transition-all shadow-lg shadow-emerald-950 animate-pulse cursor-pointer border border-emerald-400/30 font-sans"
              title={currentSession.status === 'playing' ? 'العودة للمباراة الجارية' : 'العودة لغرفة الانتظار'}
            >
              <Gamepad2 className="w-4 h-4" />
              <span className="hidden sm:inline">{currentSession.status === 'playing' ? 'العودة للعب 🎮' : 'العودة للغرفة 👥'}</span>
            </button>
          )}

          {(viewState === 'playing' || viewState === 'waiting') && (
            <button
              id="header-back-to-lobby-btn"
              onClick={() => {
                playSound('select');
                if (isPlayerSpectator) {
                  handleExitGame(true);
                } else {
                  setViewState('lobby');
                }
              }}
              className="px-2.5 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-amber-400 hover:text-amber-300 text-xs font-black flex items-center gap-1.5 sm:gap-2 transition hover:scale-105 cursor-pointer shadow-lg font-sans"
              title="الذهاب للقائمة الرئيسية لمراجعة الإعدادات أو السجل"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">القائمة الرئيسية 🏛️</span>
            </button>
          )}
        </div>
      </header>

      {/* How To Play Global Drawer overlay */}
      {showHowToPlay && (
        <div id="pop-how-to-play-global" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div id="pop-modal-content" className="w-full max-w-xl">
            <HowToPlay onDismiss={() => setShowHowToPlay(false)} />
          </div>
        </div>
      )}

      {/* Settings Modal (only shown if clicked and profile is configured) */}
      {showSettings && profile && (
        <SettingsModal
          currentUser={profile}
          historyList={historyList}
          onSignOutGoogle={handleSignOutGoogle}
          onUpdateProfile={handleUpdateProfile}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* View Switchers */}
      <main id="app-workspace-flow" className="max-w-7xl mx-auto px-4 relative z-10">
        
        {/* LOBBY VIEW */}
        {viewState === 'lobby' && (
          <Lobby
            onStartLocalGame={handleStartLocalGame}
            onCreateOnlineGame={handleCreateOnlineGame}
            onJoinOnlineGame={handleJoinOnlineGame}
            roomCodeFromUrl={roomCodeFromUrl}
            isLoading={isLobbyLoading}
            errorMsg={lobbyError}
            onToggleHowToPlay={() => setShowHowToPlay(true)}
            currentUser={profile}
            historyList={historyList}
            onSignInGoogle={handleSignInGoogle}
            onSignOutGoogle={handleSignOutGoogle}
            onUpdateProfile={handleUpdateProfile}
            isAdmin={googleUser?.email === 'yamannewtab@gmail.com'}
            onAdminSpectateGame={handleAdminSpectateGame}
          />
        )}

        {/* WAITING ROOM (Online Lobby preparation) */}
        {viewState === 'waiting' && currentSession && (
          <div id="waiting-room-panel" className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white text-right space-y-6">
            <div id="prepare-headline" className="text-center pb-4 border-b border-slate-800">
              <h3 className="text-lg font-extrabold text-amber-400 flex items-center justify-center gap-2">
                <span>انتظار اللاعبين للانضمام 👥</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1.5">انسخ رمز الغرفة أو شارك الرابط المباشر مع أصدقائك</p>
            </div>

            {/* Invite share card */}
            <div id="invite-share-card" className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 relative">
              <span className="text-slate-400 text-[10px] block mb-1">رمز الغرفة لتسجيل الدخول:</span>
              <div className="flex items-center justify-between bg-slate-900 py-2.5 px-3 rounded-lg border border-slate-800">
                <button
                  id="btn-copy-roomcode"
                  onClick={() => {
                    navigator.clipboard.writeText(onlineRoomCode || '');
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 p-2 rounded-md transition cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <span className="text-lg font-mono font-black text-white tracking-widest">{onlineRoomCode}</span>
              </div>

              {/* Direct invitation URL */}
              <div className="mt-3">
                <button
                  id="btn-copy-invite-url"
                  onClick={handleCopyInviteLink}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{copiedLink ? 'تم النسخ!' : 'انسخ رابط الدعوة المباشر'}</span>
                </button>
              </div>
            </div>

            {/* Seated Players List */}
            <div id="seated-players" className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400">اللاعبون المتواجدون بالغرفة ({currentSession.players.length}/4):</h4>
              <div className="space-y-2">
                {currentSession.players.map((p, idx) => (
                  <div id={`seated-p-${p.id}`} key={p.id} className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
                    <div className="flex items-center gap-1.5">
                      {p.isHost && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/15 text-[8px] font-bold px-1.5 py-0.5 rounded">مضيف</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">{p.name}</span>
                      <div className={`w-6 h-6 rounded-md ${p.color} text-[10px] font-bold flex items-center justify-center`}>{idx + 1}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Launch Game controls (Host only) */}
            <div id="waiting-actions" className="pt-4 border-t border-slate-800 space-y-3">
              {currentSession.players.find(p => p.id === selfPlayerId)?.isHost ? (
                <button
                  id="btn-host-launch-game"
                  disabled={currentSession.players.length < 2}
                  onClick={handleHostStartOnlineGame}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-black py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg transition"
                >
                  <span>أطلق اللعبة (الحد الأدنى لاعبَين)</span>
                </button>
              ) : (
                <div id="waiting-for-host-alert" className="text-center text-xs text-slate-400 animate-pulse py-2">
                  بانتظار أن يقوم مضيف الغرفة بإطلاق اللعبة... ⏳
                </div>
              )}

              <button
                id="btn-leave-waiting-room"
                onClick={handleLeaveLobby}
                className="w-full bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 hover:border-red-500/40 text-red-400 hover:text-red-300 font-black py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>مغادرة الغرفة والعودة للرئيسية 🚪</span>
              </button>
            </div>

            {/* Chat Box (Online only) */}
            {gameMode === 'online' && (
              <div className="pt-4 border-t border-slate-900/40 space-y-4">
                <div className="flex justify-center">
                  <button
                    id="lobby-chat-toggle-btn"
                    onClick={() => {
                      setIsChatOpen(!isChatOpen);
                      if (!isChatOpen) {
                        setLastReadTimestamps((prev) => ({
                          ...prev,
                          [activeChatTab]: Date.now(),
                        }));
                      }
                    }}
                    className={`relative flex items-center justify-center gap-2 px-6 py-3 rounded-xl border text-xs font-black tracking-wide transition-all duration-200 cursor-pointer shadow-md w-full sm:w-auto ${
                      isChatOpen
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 border-amber-400 text-slate-950 hover:brightness-110 shadow-amber-500/10'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      {isChatOpen ? 'إغلاق المحادثة والدردشة ❌' : 'فتح المحادثة والدردشة 💬'}
                    </span>
                    
                    {/* Unread indicator badge */}
                    {!isChatOpen && (hasUnreadPublicMessage || unreadChatPlayerIds.length > 0) && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-slate-950"></span>
                      </span>
                    )}
                  </button>
                </div>

                {isChatOpen && (
                  <ChatBox
                    players={currentSession.players}
                    selfPlayerId={selfPlayerId}
                    messages={currentSession.messages || []}
                    activeChatTab={activeChatTab}
                    openedPrivateChats={openedPrivateChats}
                    onSelectTab={setActiveChatTab}
                    onClosePrivateTab={handleClosePrivateTab}
                    onSendMessage={handleSendMessage}
                    unreadChatPlayerIds={unreadChatPlayerIds}
                  />
                )}
              </div>
            )}

            <button
              id="waiting-exit-btn"
              onClick={handleLeaveLobby}
              className="w-full text-slate-500 hover:text-slate-300 text-xs text-center block font-semibold hover:underline"
            >
              الرجوع للقائمة الرئيسية
            </button>
          </div>
        )}

        {/* ACTIVE PLAYING VIEW */}
        {viewState === 'playing' && currentSession && (
          <div id="playing-layout-grid" className="max-w-4xl mx-auto space-y-6">
            
            {/* Board representation */}
            <div id="bd-col-playing" className="w-full space-y-6">

              {isPlayerSpectator && (
                <div id="spectator-mode-banner" className="bg-indigo-500/10 border border-indigo-500/25 p-4 rounded-2xl flex items-center justify-between text-right animate-pulse transition-all duration-300">
                  <span className="text-xs text-slate-400">
                    وضع المراقب 🎥 Spectator Mode
                  </span>
                  <span className="text-xs text-indigo-300 font-bold">
                    أنت تشاهد هذه المباراة كمراقب فقط لأن الغرفة ممتلئة تماماً باللاعبين. 👀
                  </span>
                </div>
              )}

              {/* Admin Mode Toggle Switch - Only visible for admin 'yamannewtab@gmail.com' */}
              {googleUser?.email === 'yamannewtab@gmail.com' && (
                <div id="admin-mode-toggle-banner" className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between text-right shadow-lg">
                  <div className="flex items-center gap-3">
                    <button
                      id="admin-mode-toggle-switch"
                      onClick={() => {
                        playSound('select');
                        setAdminModeOn(prev => !prev);
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        adminModeOn ? 'bg-amber-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                          adminModeOn ? '-translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="text-xs text-slate-300 font-bold font-sans">
                      {adminModeOn ? 'وضع المشرف مفعّل (رؤية بيانات اللاعبين المقفلة) 🟢' : 'وضع المشرف معطّل (عرض تجربة اللاعب العادي) 🔴'}
                    </span>
                  </div>
                  <span className="text-xs text-amber-400 font-black flex items-center gap-1.5">
                    ⚙️ تحكم المشرف (Yaman)
                  </span>
                </div>
              )}

              <GameBoard
                board={currentSession.board}
                players={currentSession.players}
                currentTurnPlayerId={currentSession.currentTurnPlayerId}
                selfPlayerId={selfPlayerId}
                activePieceIndex={currentSession.activePieceIndex !== null ? currentSession.activePieceIndex : activePieceIndex}
                selectedPieceIndex={selectedPieceIndex}
                onSelectPiece={handleSelectPiece}
                onExecuteJump={handleExecuteJump}
                onEndTurn={handleManualEndTurn}
                hasJumpedThisTurn={hasJumpedThisTurn}
                status={currentSession.status}
                onTogglePlayerLock={handleTogglePlayerLock}
                lostPlayers={currentSession.lostPlayers}
                onOpenPrivateChat={handleOpenPrivateChat}
                unreadChatPlayerIds={unreadChatPlayerIds}
                isAdmin={googleUser?.email === 'yamannewtab@gmail.com' && adminModeOn}
                isMyTurn={
                  isPlayerSpectator
                    ? false
                    : gameMode === 'local_pass'
                    ? true
                    : gameMode === 'local_ai'
                    ? !currentSession.currentTurnPlayerId.startsWith('ai_bot')
                    : gameMode === 'local_fast_ai'
                    ? false
                    : currentSession.currentTurnPlayerId === selfPlayerId
                }
              />

              {/* If it is local AI mode and it's computer's turn, show overlay banner - moved to the bottom of the board to prevent annoyance */}
              {(gameMode === 'local_ai' || gameMode === 'local_fast_ai') && currentSession.currentTurnPlayerId.startsWith('ai_bot') && (
                <div id="ai-loading-alert" className="bg-amber-500/10 border border-amber-500/25 p-4 rounded-2xl flex items-center justify-between text-right animate-pulse transition-all duration-300">
                  <span className="text-xs text-slate-400">
                    {gameMode === 'local_fast_ai' ? 'جولة محاكاة سريعة فائقة النشاط ⚡' : 'يرجى الانتظار لحين الانتهاء'}
                  </span>
                  <span className="text-xs text-amber-300 font-bold flex items-center gap-2">
                     ({currentSession.players.find(p => p.id === currentSession.currentTurnPlayerId)?.name}) {gameMode === 'local_fast_ai' ? 'ينفذ قفزته السريعة... ⚡' : 'يخطط ويحتسب أفضل القفزات الآن... 🤖'}
                  </span>
                </div>
              )}
            </div>

            {/* Chat Box (Online only) */}
            {(gameMode === 'online' || gameMode === 'team') && (
              <div className="w-full space-y-4">
                <div className="flex justify-center">
                  <button
                    id="playing-chat-toggle-btn"
                    onClick={() => {
                      setIsChatOpen(!isChatOpen);
                      if (!isChatOpen) {
                        setLastReadTimestamps((prev) => ({
                          ...prev,
                          [activeChatTab]: Date.now(),
                        }));
                      }
                    }}
                    className={`relative flex items-center justify-center gap-2 px-6 py-3 rounded-xl border text-xs font-black tracking-wide transition-all duration-200 cursor-pointer shadow-md w-full sm:w-auto ${
                      isChatOpen
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 border-amber-400 text-slate-950 hover:brightness-110 shadow-amber-500/10'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      {isChatOpen ? 'إغلاق المحادثة والدردشة ❌' : 'فتح المحادثة والدردشة 💬'}
                    </span>
                    
                    {/* Unread indicator badge */}
                    {!isChatOpen && (hasUnreadPublicMessage || unreadChatPlayerIds.length > 0) && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-slate-950"></span>
                      </span>
                    )}
                  </button>
                </div>

                {isChatOpen && (
                  <ChatBox
                    players={currentSession.players}
                    selfPlayerId={selfPlayerId}
                    selfPlayerTeam={currentSession.players.find(p => p.id === selfPlayerId)?.team}
                    messages={currentSession.messages || []}
                    activeChatTab={activeChatTab}
                    openedPrivateChats={openedPrivateChats}
                    onSelectTab={setActiveChatTab}
                    onClosePrivateTab={handleClosePrivateTab}
                    onSendMessage={handleSendMessage}
                    unreadChatPlayerIds={unreadChatPlayerIds}
                  />
                )}
              </div>
            )}
            
            {/* Exit/Surrender Option */}
            <div className="flex justify-center pt-2">
              <button
                id="playing-leave-room-btn"
                onClick={() => handleResignGame(false)}
                className="w-full max-w-xs bg-slate-900 hover:bg-red-950/30 border border-slate-800 hover:border-red-900/50 text-slate-400 hover:text-red-400 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>الانسحاب وتغيير نمط اللعب</span>
              </button>
            </div>
          </div>
        )}

        {/* WINNER END BANNER VIEW */}
        {viewState === 'finished' && currentSession && (
          <WinnerView
            players={currentSession.players}
            onRestart={gameMode === 'online' ? handleExitGame : handleRestartGameOffline}
            onGoHome={handleExitGame}
          />
        )}

        {/* EXIT CONFIRMATION MODAL */}
        {showExitConfirm && (
          <div id="exit-confirmation-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-right">
            <div 
              id="exit-confirmation-card" 
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-200"
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400">
                  <ShieldAlert className="w-10 h-10 animate-pulse" />
                </div>
                <h3 className="text-lg font-black text-white mt-2">
                  {exitConfirmType === 'resign' ? 'تأكيد الانسحاب من الجولة ⚠️' : 'تأكيد العودة للقائمة الرئيسية ⚠️'}
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
                  {exitConfirmType === 'resign' 
                    ? 'هل أنت متأكد من رغبتك في الانسحاب وتغيير نمط اللعب؟ سيؤدي هذا لإنهاء اللعبة الحالية واعتبارك منسحباً.' 
                    : 'هل أنت متأكد من رغبتك في الخروج للقائمة الرئيسية؟ لن تتمكن من استئناف الجولة الحالية.'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button
                  id="confirm-exit-btn"
                  onClick={() => {
                    setShowExitConfirm(false);
                    if (exitConfirmType === 'resign') {
                      handleResignGame(true);
                    } else {
                      handleExitGame(true);
                    }
                  }}
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:brightness-110 border border-red-500/30 text-white font-black py-3 px-4 rounded-xl text-xs transition cursor-pointer shadow-lg shadow-red-600/10 text-center"
                >
                  {exitConfirmType === 'resign' ? 'نعم، انسحاب وخروج' : 'نعم، خروج للقائمة'}
                </button>
                <button
                  id="cancel-exit-btn"
                  onClick={() => {
                    playSound('select');
                    setShowExitConfirm(false);
                    setExitConfirmType(null);
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 border border-slate-750 text-slate-300 font-bold py-3 px-4 rounded-xl text-xs transition cursor-pointer text-center"
                >
                  إلغاء وإكمال اللعب
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
