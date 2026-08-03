import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    cachedApp = existingApps[0];
    return cachedApp;
  }

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!privateKey || !process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
    throw new Error("Firebase Admin credentials not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.");
  }

  cachedApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });

  return cachedApp;
}

export function getAdminAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getAdminApp());
  return cachedAuth;
}

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(getAdminApp());
  return cachedDb;
}

export { getAdminApp };
export type { App, Auth, Firestore };
