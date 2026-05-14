import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { loginQF, type QFUser } from "./qfUserApi";

const TOKEN_KEY = "qf-auth-token-v1";
const USER_KEY = "qf-auth-user-v1";

export interface QFAuthState {
  token: string | null;
  user: QFUser | null;
  isSignedIn: boolean;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

export function useQFAuth(): QFAuthState {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<QFUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore persisted session on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(USER_KEY),
    ])
      .then(([storedToken, storedUser]) => {
        if (cancelled) return;
        if (storedToken) setToken(storedToken);
        if (storedUser) {
          try { setUser(JSON.parse(storedUser)); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setSigningIn(true);
    setError(null);
    try {
      const { token: newToken, user: newUser } = await loginQF(email, password);
      setToken(newToken);
      setUser(newUser);
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      if (newUser) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
      }
    } catch (err) {
      setError((err as Error).message ?? "Sign in failed");
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setError(null);
    AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]).catch(() => {});
  }, []);

  return {
    token,
    user,
    isSignedIn: !!token,
    loading,
    signingIn,
    error,
    signIn,
    signOut,
  };
}
