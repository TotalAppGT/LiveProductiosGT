"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  initializeApp,
  getApps,
  FirebaseApp,
} from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  Auth,
  User as FirebaseUser,
} from "firebase/auth";
import type {
  AuthState,
  User,
  LoginCredentials,
  RegisterData,
  ApiResponse,
} from "@/types";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const AUTH_STORAGE_KEY = "live_productions_auth";

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getFirebaseApp(): FirebaseApp {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApps()[0];
}

function getPersistedAuth(): { token: string | null; user: User | null } {
  if (typeof window === "undefined") {
    return { token: null, user: null };
  }
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { token: parsed.token || null, user: parsed.user || null };
    }
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  return { token: null, user: null };
}

function persistAuth(token: string | null, user: User | null) {
  if (typeof window === "undefined") return;
  try {
    if (token && user) {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token, user })
      );
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable
  }
}

async function syncWithBackend(
  firebaseUser: FirebaseUser
): Promise<{ user: User; token: string }> {
  const idToken = await firebaseUser.getIdToken();

  const response = await fetch("/api/auth/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to sync with backend");
  }

  const result: ApiResponse<{ user: User; token: string }> =
    await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Backend sync returned no data");
  }

  return result.data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
    initialized: false,
  });

  const [authInstance, setAuthInstance] = useState<Auth | null>(null);

  useEffect(() => {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    setAuthInstance(auth);

    const persisted = getPersistedAuth();
    if (persisted.token && persisted.user) {
      setState((prev) => ({
        ...prev,
        user: persisted.user,
        token: persisted.token,
        loading: true,
      }));
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const { user, token } = await syncWithBackend(firebaseUser);
          persistAuth(token, user);
          setState({
            user,
            token,
            loading: false,
            initialized: true,
          });
        } catch {
          await signOut(auth);
          persistAuth(null, null);
          setState({
            user: null,
            token: null,
            loading: false,
            initialized: true,
          });
        }
      } else {
        persistAuth(null, null);
        setState({
          user: null,
          token: null,
          loading: false,
          initialized: true,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchUserFromBackend = useCallback(async () => {
    if (!state.token) return;
    try {
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      if (response.ok) {
        const result: ApiResponse<User> = await response.json();
        if (result.success && result.data) {
          persistAuth(state.token, result.data);
          setState((prev) => ({ ...prev, user: result.data }));
        }
      }
    } catch {
      // Silently fail on refresh
    }
  }, [state.token]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      if (!authInstance) throw new Error("Auth not initialized");
      setState((prev) => ({ ...prev, loading: true }));

      try {
        const firebaseCredential = await signInWithEmailAndPassword(
          authInstance,
          credentials.email,
          credentials.password
        );
        const { user, token } = await syncWithBackend(
          firebaseCredential.user
        );
        persistAuth(token, user);
        setState({
          user,
          token,
          loading: false,
          initialized: true,
        });
      } catch (error) {
        setState((prev) => ({ ...prev, loading: false }));
        throw error;
      }
    },
    [authInstance]
  );

  const register = useCallback(
    async (data: RegisterData) => {
      if (!authInstance) throw new Error("Auth not initialized");
      setState((prev) => ({ ...prev, loading: true }));

      try {
        const firebaseCredential = await createUserWithEmailAndPassword(
          authInstance,
          data.email,
          data.password
        );

        const idToken = await firebaseCredential.user.getIdToken();

        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            firebaseUid: firebaseCredential.user.uid,
            email: data.email,
            name: data.name,
            phone: data.phone,
            whatsappNumber: data.whatsappNumber,
          }),
        });

        if (!response.ok) {
          await firebaseCredential.user.delete();
          throw new Error("Failed to register with backend");
        }

        const result: ApiResponse<{ user: User; token: string }> =
          await response.json();

        if (!result.success || !result.data) {
          await firebaseCredential.user.delete();
          throw new Error(result.error || "Registration failed");
        }

        persistAuth(result.data.token, result.data.user);
        setState({
          user: result.data.user,
          token: result.data.token,
          loading: false,
          initialized: true,
        });
      } catch (error) {
        setState((prev) => ({ ...prev, loading: false }));
        throw error;
      }
    },
    [authInstance]
  );

  const logout = useCallback(async () => {
    if (authInstance) {
      try {
        await signOut(authInstance);
      } catch {
        // Proceed even if Firebase signOut fails
      }
    }

    if (state.token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${state.token}` },
        });
      } catch {
        // Proceed even if backend logout fails
      }
    }

    persistAuth(null, null);
    setState({
      user: null,
      token: null,
      loading: false,
      initialized: true,
    });
  }, [authInstance, state.token]);

  const refreshUser = useCallback(async () => {
    await fetchUserFromBackend();
  }, [fetchUserFromBackend]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        register,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
