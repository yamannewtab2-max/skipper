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
  SkipperColor 
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
  Trophy
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

  const [googleUser, setGoogleUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
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
                  } else {
                    // Session finished/deleted, clear association so they don't see go-back button
                    setCurrentSession(null);
                    setOnlineRoomCode(null);
                    saveUserProfile(user.uid, { activeSessionId: null }).catch(err => 
                      console.error('Error clearing stale activeSessionId:', err)
                    );
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
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showMyProgress, setShowMyProgress] = useState(true);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [isLobbyLoading, setIsLobbyLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Read invite code from URL on load
  const [roomCodeFromUrl, setRoomCodeFromUrl] = useState<string | null>(null);

  // App Master state
  const [viewState, setViewState] = useState<'lobby' | 'playing' | 'waiting' | 'finished'>('lobby');
  const viewStateRef = useRef(viewState);
  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const [gameMode, setGameMode] = useState<GameMode>('local_pass');
  
  // Real-time synchronization
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(null);
  const unsubscribeRef = useRef<() => void>(() => {});

  // Complete offline state mimicry or online snapshot sync
  const [currentSession, setCurrentSession] = useState<GameSession | null>(null);
  const [nextAiGameStarter, setNextAiGameStarter] = useState<'human' | 'ai'>('human');

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
          players: prev.players.map(p => p.id === aiPlayer.id ? { ...p, captured: { ...currentCaptured } } : p),
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
  const handleStartLocalGame = (mode: 'local_ai' | 'local_pass' | 'local_fast_ai', playerNames: string[], difficulty?: 'easy' | 'medium' | 'hard') => {
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
  const handleCreateOnlineGame = async (hostName: string, colorClass: string) => {
    if (!isFirebaseConfigured) {
      setLobbyError('قاعدة البيانات غير مفعلة الآن بلطف حاول لاحقاً.');
      return;
    }
    try {
      setIsLobbyLoading(true);
      setLobbyError(null);
      playSound('select');

      const code = await createOnlineGame(
        hostName, 
        selfPlayerId, 
        colorClass, 
        profile?.photoUrl, 
        profile?.allowViewProgress !== false
      );
      setOnlineRoomCode(code);
      setGameMode('online');

      if (profile) {
        await saveUserProfile(profile.uid, { activeSessionId: code });
      }

      // Subscribe to real-time syncs
      const unsub = subscribeToGame(
        code,
        (updatedSession) => {
          if (updatedSession) {
            setCurrentSession(updatedSession);
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

  // Host triggers startGame Online
  const handleHostStartOnlineGame = async () => {
    if (!currentSession || !onlineRoomCode) return;
    try {
      playSound('select');
      await updateGameData(onlineRoomCode, {
        status: 'playing',
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
    const updatedPlayers = currentSession.players.map((p) => {
      if (p.id === currentPlayerId) {
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

      if (profile && currentSession?.id && currentSession.id !== 'local_room') {
        await updateGameData(currentSession.id, {
          board: updatedBoard,
          players: updatedPlayers,
          activePieceIndex: endIndex,
          history: [...currentSession.history, newLogItem]
        });
      } else {
        setCurrentSession({
          ...currentSession,
          board: updatedBoard,
          players: updatedPlayers,
          activePieceIndex: endIndex,
          history: [...currentSession.history, newLogItem]
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

    if (profile && currentSession?.id && currentSession.id !== 'local_room') {
      await updateGameData(currentSession.id, {
        board: updatedBoard,
        players: updatedPlayers,
        currentTurnPlayerId: nextTurnPlayerId,
        activePieceIndex: null,
        history: historyLogs,
        status: gameStatus,
        winnerId: finalWinnerId
      });
    } else {
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

  // Exit game to main menu
  const handleExitGame = () => {
    playSound('select');
    // Unsubscribe from firebase
    try {
      unsubscribeRef.current();
    } catch (e) {}
    unsubscribeRef.current = () => {};

    // Clear active session from profile
    if (profile) {
      saveUserProfile(profile.uid, { activeSessionId: null }).catch(err =>
        console.error('Error clearing activeSessionId on exit:', err)
      );
    }

    // Reset state
    setCurrentSession(null);
    setOnlineRoomCode(null);
    setViewState('lobby');
    setHasJumpedThisTurn(false);
    setSelectedPieceIndex(null);
    setActivePieceIndex(null);
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
                setViewState('lobby');
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
            <div id="waiting-actions" className="pt-4 border-t border-slate-800">
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
            </div>

            <button
              id="waiting-exit-btn"
              onClick={handleExitGame}
              className="w-full text-slate-500 hover:text-slate-300 text-xs text-center block font-semibold hover:underline"
            >
              الرجوع للقائمة الرئيسية
            </button>
          </div>
        )}

        {/* ACTIVE PLAYING VIEW */}
        {viewState === 'playing' && currentSession && (
          <div id="playing-layout-grid" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Board representation - 8 Columns equivalent */}
            <div id="bd-col-playing" className="lg:col-span-8 space-y-6">

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
                isMyTurn={
                  gameMode === 'local_pass'
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

              {/* Checkbox to Allow Other Players to See My Progress */}
              <div id="progress-view-preference-card" className="flex items-center justify-end bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80 mt-4 text-right">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-black text-amber-400 select-none">
                  <input
                    id="allow-others-view-progress-checkbox"
                    type="checkbox"
                    checked={
                      (() => {
                        if (!currentSession) return true;
                        const hasSelfId = currentSession.players.some(p => p.id === selfPlayerId);
                        const myPlayer = hasSelfId 
                          ? currentSession.players.find(p => p.id === selfPlayerId) 
                          : currentSession.players[0];
                        return !(myPlayer?.allowViewProgress === false);
                      })()
                    }
                    onChange={(e) => {
                      handleToggleAllowViewProgress(e.target.checked);
                    }}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-850 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>Show my progress to others / إظهار تقدمي للآخرين 👁️</span>
                </label>
              </div>

              {/* Personal Progress Display Component */}
              {showMyProgress && (
                <div id="personal-progress-card" className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-right text-white shadow-xl relative overflow-hidden transition-all duration-305">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      مباشر من المباراة 👤
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-100 flex items-center gap-1.5 justify-end">
                      <span>تقدم رصيدي من النقاط والقطع</span>
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                    </h4>
                  </div>

                  {(() => {
                    const myPlayer = currentSession.players.find(p => p.id === selfPlayerId) || currentSession.players[0];
                    if (!myPlayer) return <p className="text-xs text-slate-500">لم يتم العثور على بيانات اللاعب.</p>;
                    
                    const sets = countCompleteSets(myPlayer.captured);
                    const totalPieces = Object.values(myPlayer.captured).reduce((a: number, b: any) => a + (b as number), 0);
                    const counts = SKIPPER_COLORS.map(c => myPlayer.captured[c] || 0);
                    const minCount = Math.min(...counts);
                    const missingForNextSet = SKIPPER_COLORS.filter(c => (myPlayer.captured[c] || 0) === minCount);
                    
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-850 text-center">
                            <span className="text-[10px] text-slate-500 block">المجموعات الكاملة</span>
                            <span className="text-xl font-black text-amber-400">{sets}</span>
                          </div>
                          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-850 text-center">
                            <span className="text-[10px] text-slate-500 block">إجمالي القطع</span>
                            <span className="text-xl font-black text-emerald-400">{totalPieces}</span>
                          </div>
                          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-850 text-center">
                            <span className="text-[10px] text-slate-500 block">اكتمال المجموعة {sets + 1}</span>
                            <span className="text-sm font-black text-slate-300">
                              {5 - missingForNextSet.length} / 5
                            </span>
                          </div>
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>{Math.round(((5 - missingForNextSet.length) / 5) * 100)}%</span>
                            <span>التقدم نحو المجموعة التالية</span>
                          </div>
                          <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                            <div 
                              className="h-full bg-gradient-to-l from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                              style={{ width: `${((5 - missingForNextSet.length) / 5) * 105}%` }}
                            />
                          </div>
                        </div>

                        {/* What color is missing */}
                        {missingForNextSet.length > 0 && missingForNextSet.length < 5 && (
                          <div className="text-xs bg-amber-500/5 border border-amber-500/10 p-2 rounded-xl text-amber-300/90 text-center flex items-center justify-center gap-1">
                            <span>القطع الناقصة لإكمال المجموعة:</span>
                            <div className="flex gap-1">
                              {missingForNextSet.map(color => (
                                <span key={color} className="text-sm" title={COLOR_METADATA[color].name}>
                                  {COLOR_METADATA[color].dot}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            
            {/* Sidebar scoreboards - 4 Columns equivalent */}
            <div id="sb-col-playing" className="lg:col-span-4 space-y-6">
              <Scoreboard
                players={currentSession.players}
                currentTurnPlayerId={currentSession.currentTurnPlayerId}
                selfPlayerId={selfPlayerId}
              />

              {/* Action logs history console */}
              <div id="session-logs-card" className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-right text-white shadow-xl relative overflow-hidden">
                <h4 className="text-sm font-extrabold text-slate-200 border-b border-slate-800 pb-2.5 mb-3 flex items-center gap-1.5 justify-end">
                  <span>سجل الحركات الأخير</span>
                  <History className="w-4 h-4 text-slate-400" />
                </h4>
                <div id="log-entries-scrollable" className="space-y-1.5 max-h-36 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-400 pr-1 select-text">
                  {currentSession.history.slice(-10).reverse().map((log, idx) => (
                    <div id={`log-entry-${idx}`} key={idx} className="border-r-2 border-slate-800 pr-2 pb-1 text-slate-300 text-right">
                      {log}
                    </div>
                  ))}
                  {currentSession.history.length === 0 && (
                    <span className="text-slate-600 block text-center">لا توجد حركات مسجلة حالياً.</span>
                  )}
                </div>
              </div>

              {/* Exit/Surrender Option */}
              <button
                id="playing-leave-room-btn"
                onClick={handleExitGame}
                className="w-full bg-slate-900 hover:bg-red-950/30 border border-slate-800 hover:border-red-900/50 text-slate-400 hover:text-red-400 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
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

      </main>
    </div>
  );
}
