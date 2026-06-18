/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot,
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
  firestore = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
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

// Generate unique 5-letter game room codes
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // eye-friendly, no ambiguous letters
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
  avatarColor: string
): Promise<string> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase integration is not configured properly.');
  }

  const roomCode = generateRoomCode();
  const initialBoard = initializeBoard();

  const host: Player = {
    id: hostPlayerId,
    name: hostName,
    color: avatarColor,
    isHost: true,
    captured: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
    isActive: true,
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
  avatarColor: string
): Promise<GameSession> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase integration is not configured.');
  }

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

  // Check if player is already in room
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

  return onSnapshot(
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
}

/**
 * Direct session edits
 */
export async function updateGameData(roomCode: string, fields: Partial<GameSession>): Promise<void> {
  if (!isFirebaseConfigured) return;
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

export { firestore, isFirebaseConfigured, auth };
