/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  deleteDoc,
  Firestore 
} from 'firebase/firestore';
import { GameSession, Player } from './types';
import { initializeBoard } from './gameUtils';
import firebaseConfig from '../firebase-applet-config.json';

// Define Operations for standard tracking and error mapping
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoUrl: string | null;
  createdAt: number;
  activeSessionId?: string | null;
  allowViewProgress?: boolean;
}

export interface CompactHistoryItem {
  id: string;
  won: boolean; // true if player won
  mode: 'local_ai' | 'local_pass' | 'online';
  capturedRed: number;
  capturedBlue: number;
  capturedGreen: number;
  capturedYellow: number;
  capturedPurple: number;
  totalPoints: number; // calculated total score
  playedAt: number;
}

// Parse configuration securely
let firebaseApp;
let firestore: Firestore;
let isFirebaseConfigured = false;
let auth: any;

try {
  if (getApps().length === 0) {
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    firebaseApp = getApp();
  }
  // Initialize firestore with Custom Database ID from configuration
  const dbId = firebaseConfig.firestoreDatabaseId;
  if (dbId && dbId !== '(default)' && dbId.trim().length > 0) {
    firestore = getFirestore(firebaseApp, dbId);
  } else {
    firestore = getFirestore(firebaseApp);
  }
  auth = getAuth(firebaseApp);
  isFirebaseConfigured = true;
  console.log('Firebase and Firestore successfully initialized!');
} catch (error) {
  console.error('Firebase failed to initialize:', error);
}

// Global exception formatter for secure diagnostics
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Ensures the user is signed in to Google
 */
export async function ensureAuthenticated(): Promise<string> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('قالب Firebase غير مهيأ بالكامل حالياً.');
  }
  if (auth.currentUser) {
    return auth.currentUser.uid;
  }
  // Sign in with Google
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user.uid;
  } catch (err: any) {
    console.warn('Google popup sign-in failed:', err);
    
    // Check if the error is due to popup-blocking or iframe restriction
    const isPopupError = err.code === 'auth/popup-blocked' || 
                         err.code === 'auth/popup-closed-by-user' || 
                         err.code === 'auth/cancelled-popup-request' ||
                         err.message?.includes('popup');
                         
    if (isPopupError) {
      throw new Error('فشل فتح نافذة تسجيل الدخول المنبثقة! يرجى السماح بالنوافذ المنبثقة في متصفحك أو الضغط على زر "فتح في نافذة جديدة" أعلى اليمين لتفادي قيود الحماية داخل الإطار (iframe).');
    }
    throw new Error(err.message || 'فشل تسجيل الدخول عبر جوجل! يرجى السماح بالنوافذ المنبثقة أو فتح اللعبة في نافذة جديدة.');
  }
}

/**
 * Logs out the current Google user
 */
export async function logoutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

/**
 * Loads the user profile from Firestore or creates a default based on Google metadata
 */
export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured || !firestore) return null;
  const path = `users/${userId}`;
  try {
    const docSnap = await getDoc(doc(firestore, 'users', userId));
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    // Create lazy default profile
    const user = auth.currentUser as User | null;
    const defaultProfile: UserProfile = {
      uid: userId,
      displayName: user?.displayName || `لاعب سكيبتي ${Math.floor(100 + Math.random() * 900)} 🎲`,
      photoUrl: user?.photoURL || null,
      createdAt: Date.now(),
      allowViewProgress: true
    };
    try {
      await setDoc(doc(firestore, 'users', userId), defaultProfile);
    } catch (writeErr) {
      console.warn('Could not write new profile to firestore (continuing with local profile):', writeErr);
    }
    return defaultProfile;
  } catch (err) {
    console.warn('Failed to load user profile from firestore (using local fallback profile):', err);
    const user = auth?.currentUser as User | null;
    return {
      uid: userId,
      displayName: user?.displayName || `لاعب سكيبتي ${Math.floor(100 + Math.random() * 900)} 🎲`,
      photoUrl: user?.photoURL || null,
      createdAt: Date.now(),
      allowViewProgress: true,
      activeSessionId: localStorage.getItem('skippity_online_room_code') || null
    };
  }
}

/**
 * Updates/Saves the user profile to Firestore
 */
export async function saveUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  const path = `users/${userId}`;
  try {
    await setDoc(doc(firestore, 'users', userId), {
      ...data,
      uid: userId
    }, { merge: true });
  } catch (err) {
    console.warn('Failed to save user profile to firestore (updating local storage fallback state):', err);
    if (data.activeSessionId !== undefined) {
      if (data.activeSessionId) {
        localStorage.setItem('skippity_online_room_code', data.activeSessionId);
      } else {
        localStorage.removeItem('skippity_online_room_code');
      }
    }
  }
}

/**
 * Saves a single match record into the user's gamesHistory subcollection
 */
export async function saveGameHistory(userId: string, item: Omit<CompactHistoryItem, 'id' | 'playedAt'>): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  const historyId = 'h_' + Date.now();
  const path = `users/${userId}/gamesHistory/${historyId}`;
  try {
    const historyItem: CompactHistoryItem = {
      ...item,
      id: historyId,
      playedAt: Date.now()
    };
    await setDoc(doc(firestore, 'users', userId, 'gamesHistory', historyId), historyItem);
  } catch (err) {
    console.warn('Failed to save game history to Firestore (falling back to local history list):', err);
    try {
      const guestHistory = JSON.parse(localStorage.getItem('skippity_guest_history') || '[]');
      const localItem: CompactHistoryItem = {
        ...item,
        id: 'fallback_h_' + Date.now(),
        playedAt: Date.now()
      };
      localStorage.setItem('skippity_guest_history', JSON.stringify([localItem, ...guestHistory]));
    } catch (e) {
      console.error('Failed to save to local fallback history:', e);
    }
  }
}

/**
 * Loads the player's history of games ordered by date
 */
export async function loadGameHistory(userId: string): Promise<CompactHistoryItem[]> {
  if (!isFirebaseConfigured || !firestore) return [];
  const path = `users/${userId}/gamesHistory`;
  try {
    const q = query(
      collection(firestore, 'users', userId, 'gamesHistory'),
      orderBy('playedAt', 'desc')
    );
    const snap = await getDocs(q);
    const result: CompactHistoryItem[] = [];
    snap.forEach((doc) => {
      result.push(doc.data() as CompactHistoryItem);
    });
    return result;
  } catch (err) {
    console.warn('Failed to load game history from Firestore (falling back to local history list):', err);
    try {
      return JSON.parse(localStorage.getItem('skippity_guest_history') || '[]');
    } catch (e) {
      return [];
    }
  }
}

// Generate unique 5-letter game room codes
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Creates a brand new game session in Firestore
 */
export async function createOnlineGame(
  hostName: string,
  hostPlayerId: string,
  avatarColor: string,
  photoUrl?: string | null,
  allowViewProgress?: boolean
): Promise<string> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase integration is not configured properly.');
  }

  await ensureAuthenticated();

  const roomCode = generateRoomCode();
  const initialBoard = initializeBoard();

  const host: Player = {
    id: hostPlayerId,
    name: hostName,
    color: avatarColor,
    isHost: true,
    captured: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
    isActive: true,
    photoUrl: photoUrl || null,
    allowViewProgress: allowViewProgress !== undefined ? allowViewProgress : true,
  };

  const session: GameSession = {
    id: roomCode,
    status: 'waiting',
    mode: 'online',
    board: initialBoard,
    players: [host],
    currentTurnPlayerId: hostPlayerId,
    activePieceIndex: null,
    winnerId: null,
    history: [`أنشأ ${hostName} الغرفة كلاعب مضيف.`],
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };

  const path = `games/${roomCode}`;
  try {
    const docRef = doc(firestore, 'games', roomCode);
    await setDoc(docRef, session);
    return roomCode;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Join an existing online game session and update Firestore
 */
export async function joinOnlineGame(
  roomCode: string,
  playerName: string,
  playerId: string,
  avatarColor: string,
  photoUrl?: string | null,
  allowViewProgress?: boolean
): Promise<GameSession & { isSpectator?: boolean }> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase integration is not configured.');
  }

  await ensureAuthenticated();

  const cleanCode = roomCode.trim().toUpperCase();
  const path = `games/${cleanCode}`;
  let docSnap;

  try {
    const docRef = doc(firestore, 'games', cleanCode);
    docSnap = await getDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    throw err;
  }

  if (!docSnap.exists()) {
    throw new Error('عذراً، كود الغرفة غير موجود. يرجى التحقق وإعادة المحاولة.');
  }

  const session = docSnap.data() as GameSession;

  if (session.status === 'finished') {
    throw new Error('عذراً، اللعبة انتهت بالفعل.');
  }

  // If already in active players list, return session directly
  const alreadyIn = session.players.find((p) => p.id === playerId);
  if (alreadyIn) {
    return session;
  }

  // If the game has 4 players already, join as a spectator!
  if (session.players.length >= 4) {
    const updatedHistory = [...session.history, `انضم ${playerName} كمراقب للعبة. 👀`];
    try {
      const docRef = doc(firestore, 'games', cleanCode);
      await updateDoc(docRef, {
        history: updatedHistory,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      throw err;
    }
    return {
      ...session,
      history: updatedHistory,
      isSpectator: true,
    };
  }

  // Join as an active player
  const newPlayer: Player = {
    id: playerId,
    name: playerName,
    color: avatarColor,
    isHost: false,
    captured: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
    isActive: true,
    photoUrl: photoUrl || null,
    allowViewProgress: allowViewProgress !== undefined ? allowViewProgress : true,
  };

  const combinedPlayers = [...session.players, newPlayer];

  // Fisher-Yates Shuffle to randomize seating order of all players in the lobby
  const updatedPlayers = [...combinedPlayers];
  for (let i = updatedPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = updatedPlayers[i];
    updatedPlayers[i] = updatedPlayers[j];
    updatedPlayers[j] = temp;
  }

  const updatedHistory = [...session.history, `انضم ${playerName} إلى اللعبة (تمت إعادة ترتيب اللاعبين عشوائياً 🎲).`];

  try {
    const docRef = doc(firestore, 'games', cleanCode);
    await updateDoc(docRef, {
      players: updatedPlayers,
      history: updatedHistory,
      lastUpdated: Date.now(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }

  return {
    ...session,
    players: updatedPlayers,
    history: updatedHistory,
  };
}

/**
 * Sync status real-time listeners
 */
export function subscribeToGame(
  roomCode: string,
  onUpdate: (session: GameSession | null) => void,
  onError: (error: Error) => void
) {
  if (!isFirebaseConfigured) {
    onError(new Error('Firebase integration not configured'));
    return () => {};
  }

  const cleanCode = roomCode.trim().toUpperCase();
  const path = `games/${cleanCode}`;
  const docRef = doc(firestore, 'games', cleanCode);

  let unsubscribing = false;
  let unsubscribeFn: (() => void) | null = null;

  ensureAuthenticated()
    .then(() => {
      if (unsubscribing) return;
      unsubscribeFn = onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            onUpdate(docSnap.data() as GameSession);
          } else {
            onUpdate(null);
          }
        },
        (err) => {
          console.error('Error listening to game changes:', err);
          try {
            handleFirestoreError(err, OperationType.GET, path);
          } catch (formattedError) {
            onError(formattedError as Error);
          }
        }
      );
    })
    .catch((err) => {
      onError(err);
    });

  return () => {
    unsubscribing = true;
    if (unsubscribeFn) {
      unsubscribeFn();
    }
  };
}

/**
 * Direct session edits
 */
export async function updateGameData(roomCode: string, fields: Partial<GameSession>): Promise<void> {
  if (!isFirebaseConfigured) return;
  await ensureAuthenticated();
  const cleanCode = roomCode.toUpperCase();
  const path = `games/${cleanCode}`;
  try {
    const docRef = doc(firestore, 'games', cleanCode);
    await updateDoc(docRef, {
      ...fields,
      lastUpdated: Date.now(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Handle a player leaving an online game session (marked as lost and deleted from active players)
 */
export async function leaveOnlineGame(roomCode: string, playerId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await ensureAuthenticated();
  const cleanCode = roomCode.trim().toUpperCase();
  const path = `games/${cleanCode}`;
  const docRef = doc(firestore, 'games', cleanCode);

  try {
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;

    const session = docSnap.data() as GameSession;
    const leavingPlayer = session.players.find(p => p.id === playerId);
    
    if (!leavingPlayer) return;

    const updatedPlayers = session.players.filter(p => p.id !== playerId);
    
    // Save as lost player
    const lostPlayers = session.lostPlayers || [];
    const updatedLostPlayers = [...lostPlayers, { ...leavingPlayer, isActive: false }];

    // Notify history
    const updatedHistory = [...session.history, `غادر اللاعب ${leavingPlayer.name} اللعبة وتم اعتباره خاسراً! 🚪`];

    let nextTurnPlayerId = session.currentTurnPlayerId;
    let gameStatus = session.status;
    let winnerId = session.winnerId;

    // Handle turn transition if it was the leaving player's turn
    if (session.currentTurnPlayerId === playerId && updatedPlayers.length > 0) {
      const activeIdx = session.players.findIndex(p => p.id === playerId);
      const nextPlayerIdx = (activeIdx + 1) % session.players.length;
      let targetNext = session.players[nextPlayerIdx];
      if (targetNext.id === playerId) {
        targetNext = updatedPlayers[0];
      }
      nextTurnPlayerId = targetNext.id;
    }

    // Reassign host if the host is leaving
    if (leavingPlayer.isHost && updatedPlayers.length > 0) {
      updatedPlayers[0].isHost = true;
      updatedHistory.push(`أصبح ${updatedPlayers[0].name} هو مستضيف الغرفة الجديد. 👑`);
    }

    // Auto-resolve game if only 1 active player remains in active play
    if (updatedPlayers.length === 1 && gameStatus === 'playing') {
      gameStatus = 'finished';
      winnerId = updatedPlayers[0].id;
      updatedHistory.push(`انتهت اللعبة! فاز ${updatedPlayers[0].name} لانسحاب بقية اللاعبين. 🎉`);
    } else if (updatedPlayers.length === 0) {
      gameStatus = 'finished';
    }

    await updateDoc(docRef, {
      players: updatedPlayers,
      lostPlayers: updatedLostPlayers,
      currentTurnPlayerId: nextTurnPlayerId,
      status: gameStatus,
      winnerId: winnerId,
      history: updatedHistory,
      lastUpdated: Date.now()
    });

  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Saves a full game session document directly (useful for local games persistence)
 */
export async function saveGameSession(roomCode: string, session: GameSession): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  await ensureAuthenticated();
  const cleanCode = roomCode.toUpperCase();
  const path = `games/${cleanCode}`;
  try {
    const docRef = doc(firestore, 'games', cleanCode);
    await setDoc(docRef, session);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Deletes any game session from Firestore that has not been updated for more than 10 minutes
 */
export async function cleanupStaleGames(): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  try {
    const now = Date.now();
    const stalenessThreshold = 10 * 60 * 1000; // 10 minutes
    const staleThreshold = now - stalenessThreshold;

    // Use where filter to only fetch and clean stale games
    const q = query(
      collection(firestore, 'games'), 
      where('lastUpdated', '<', staleThreshold)
    );
    const snap = await getDocs(q);
    
    const promises: Promise<void>[] = [];
    snap.forEach((docSnap) => {
      console.log(`Cleaning up stale game session: ${docSnap.id}`);
      promises.push(deleteDoc(doc(firestore, 'games', docSnap.id)));
    });
    
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  } catch (err) {
    console.error('Error during stale games cleanup:', err);
  }
}

/**
 * Loads all active game sessions in the system (for admin/developer view)
 */
export async function loadActiveGames(): Promise<GameSession[]> {
  if (!isFirebaseConfigured || !firestore) return [];
  const path = 'games';
  try {
    // Run stale games cleanup in the background to ensure instantaneous list loading
    cleanupStaleGames().catch(err => console.error('Stale games background cleanup failed:', err));

    const q = query(
      collection(firestore, 'games'),
      orderBy('lastUpdated', 'desc')
    );
    const snap = await getDocs(q);
    const result: GameSession[] = [];
    snap.forEach((doc) => {
      const data = doc.data() as GameSession;
      if (data && data.status !== 'finished') {
        result.push(data);
      }
    });
    return result;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Deletes a game session from Firestore (Admin only)
 */
export async function deleteGameSession(gameId: string): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  await ensureAuthenticated();
  await deleteDoc(doc(firestore, 'games', gameId));
}

export { firestore, isFirebaseConfigured, auth };
