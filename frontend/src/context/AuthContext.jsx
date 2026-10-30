
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "@/lib/api";
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";

const AuthContext = createContext(null);

function firebaseUserHasPassword(firebaseUser) {
  return Boolean(
    firebaseUser?.providerData?.some(
      (provider) => provider.providerId === "password"
    )
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [showPasswordReminder, setShowPasswordReminder] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setFirebaseUser(currentUser);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;

    api
      .get("/auth/me")
      .then((res) => {
        if (active) setUser(res.data);
      })
      .catch(() => {
        if (active) setUser(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", {
      email,
      password,
    });

    setUser(data);
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", {
      name,
      email,
      password,
    });

    setUser(data);
    return data;
  };

  const googleLogin = useCallback(async (credential) => {
    const firebaseCredential =
      GoogleAuthProvider.credential(credential);

    const firebaseResult = await signInWithCredential(
      auth,
      firebaseCredential
    );

    try {
      const { data } = await api.post("/auth/google", {
        credential,
      });

      setUser(data);
      const needsPassword = !data.has_password;
      setShowPasswordReminder(needsPassword);

      return {
        ...data,
        requiresPassword: needsPassword,
      };
    } catch (error) {
      await firebaseSignOut(auth).catch(() => {});
      throw error;
    }
  }, []);

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Continue signing out locally if the backend is unavailable.
    }

    await firebaseSignOut(auth).catch(() => {});
    setUser(false);
    setShowPasswordReminder(false);
  };

  const dismissPasswordReminder = () => setShowPasswordReminder(false);
  const clearPasswordReminder = () => setShowPasswordReminder(false);

  const value = {
    user,
    checking,
    firebaseUser,
    hasFirebasePassword: firebaseUserHasPassword(firebaseUser),
    showPasswordReminder,
    dismissPasswordReminder,
    clearPasswordReminder,
    login,
    register,
    googleLogin,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
