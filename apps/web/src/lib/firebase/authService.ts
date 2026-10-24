/**
 * Proposal Assistant – Firebase Authentication Client Service
 * Handles Google OAuth One-Click Popup, Email/Password Signup & Login,
 * and token exchange with the FastAPI backend.
 */
import {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  User,
} from "firebase/auth";
import { getFirebaseAuth } from "./config";

export interface AuthSession {
  accessToken: string;
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
}

/**
 * Exchanges a Firebase user ID token for an RFPilot application session token.
 */
async function exchangeFirebaseToken(user: User): Promise<AuthSession> {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/auth/firebase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    let errMsg = "Authentication failed.";
    try {
      const errData = await res.json();
      errMsg = errData?.detail?.error?.message || errData?.detail || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  const session: AuthSession = {
    accessToken: data.access_token,
    userId: data.user_id,
    workspaceId: data.workspace_id,
    name: data.name,
    email: data.email,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("proposal_assistant_token", session.accessToken);
    localStorage.setItem("proposal_assistant_user", JSON.stringify(session));
    document.cookie = `proposal_assistant_token=${encodeURIComponent(session.accessToken)}; path=/; max-age=2592000; SameSite=Lax`;
  }

  return session;
}

/**
 * Sign in or Sign up with Google OAuth.
 */
export async function signInWithGoogle(): Promise<AuthSession> {
  const { auth, googleProvider } = await getFirebaseAuth();
  const result = await signInWithPopup(auth, googleProvider);
  return await exchangeFirebaseToken(result.user);
}

/**
 * Sign up a new user with Email and Password.
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  displayName: string
): Promise<AuthSession> {
  const { auth } = await getFirebaseAuth();
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName) {
    try {
      await updateProfile(result.user, { displayName });
    } catch {}
  }
  return await exchangeFirebaseToken(result.user);
}

/**
 * Sign in an existing user with Email and Password.
 */
export async function signInWithEmail(
  email: string,
  pass: string
): Promise<AuthSession> {
  const { auth } = await getFirebaseAuth();
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return await exchangeFirebaseToken(result.user);
}

/**
 * Sign out of current session.
 */
export async function signOutUser(): Promise<void> {
  try {
    const { auth } = await getFirebaseAuth();
    await fbSignOut(auth);
  } catch {}
  if (typeof window !== "undefined") {
    localStorage.removeItem("proposal_assistant_token");
    localStorage.removeItem("proposal_assistant_user");
    document.cookie = "proposal_assistant_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  }
}

/**
 * Get current cached session profile.
 */
export function getCurrentSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("proposal_assistant_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
