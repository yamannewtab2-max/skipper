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
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    return result.user.uid;
  } catch (err: any) {
    console.error('Google popup sign-in failed:', err);
    throw new Error('فشل تسجيل الدخول عبر جوجل! يرجى السماح بالنوافذ المنبثقة.');
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
    await setDoc(doc(firestore, 'users', userId), defaultProfile);
    return defaultProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
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
    handleFirestoreError(err, OperationType.WRITE, path);
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
    handleFirestoreError(err, OperationType.WRITE, path);
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
    handleFirestoreError(err, OperationType.GET, path);
    return [];
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
): Promise<GameSession> {
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

  if (session.status !== 'waiting') {
    throw new Error('عذراً، اللعبة بدأت بالفعل أو انتهت.');
  }

  if (session.players.length >= 4) {
    throw new Error('عذراً، الغرفة ممتلئة تماماً (الحد الأقصى 4 لاعبين).');
  }

  const alreadyIn = session.players.find((p) => p.id === playerId);
  if (alreadyIn) {
    return session;
  }

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

  const updatedPlayers = [...session.players, newPlayer];
  const updatedHistory = [...session.history, `انضم ${playerName} إلى اللعبة.`];

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

export { firestore, isFirebaseConfigured, auth };
