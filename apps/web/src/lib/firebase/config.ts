import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";

let cachedConfig: Record<string, string> | null = null;
let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;

export async function getFirebaseConfig(): Promise<Record<string, string>> {
  if (cachedConfig) return cachedConfig;

  // 1. Inlined environment variables (if provided at build/runtime)
  if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    cachedConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    };
    return cachedConfig;
  }

  // 2. Fetch runtime public config from backend
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/auth/firebase-config");
      if (res.ok) {
        const data = await res.json();
        if (data.apiKey) {
          cachedConfig = data;
          return cachedConfig!;
        }
      }
    } catch {}
  }

  return {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  };
}

export async function getFirebaseAuth(): Promise<{ auth: Auth; googleProvider: GoogleAuthProvider }> {
  if (authInstance && googleProviderInstance) {
    return { auth: authInstance, googleProvider: googleProviderInstance };
  }

  const config = await getFirebaseConfig();
  if (!config.apiKey) {
    throw new Error("Firebase is not configured. Please ensure environment variables are provided.");
  }

  appInstance = !getApps().length ? initializeApp(config) : getApp();
  authInstance = getAuth(appInstance);
  googleProviderInstance = new GoogleAuthProvider();
  googleProviderInstance.setCustomParameters({ prompt: "select_account" });

  return { auth: authInstance, googleProvider: googleProviderInstance };
}
