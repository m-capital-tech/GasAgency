import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@gassetu/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { setToken } from "./api";

export type Mode = "customer" | "delivery";

interface SessionState {
  hydrated: boolean;
  mode: Mode;
  language: "en" | "hi" | "te";
  token: string | null;
  user: User | null;
  /** onboarding checkpoints for a new customer */
  onboarding: "profile" | "connection" | "done";
  setLanguage: (l: SessionState["language"]) => void;
  login: (token: string, user: User, opts?: { isNew?: boolean; hasProfile?: boolean; hasAgency?: boolean }) => void;
  setOnboarding: (s: SessionState["onboarding"]) => void;
  setMode: (m: Mode) => void;
  updateUser: (u: Partial<User>) => void;
  logout: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      hydrated: false,
      mode: "customer",
      language: "en",
      token: null,
      user: null,
      onboarding: "done",
      setLanguage: (language) => set({ language }),
      login: (token, user, opts) => {
        setToken(token);
        const onboarding = user.role === "customer" ? (opts?.hasProfile ? (opts?.hasAgency ? "done" : "connection") : "profile") : "done";
        set({ token, user, onboarding, mode: user.role === "delivery" ? "delivery" : "customer" });
      },
      setOnboarding: (onboarding) => set({ onboarding }),
      setMode: (mode) => set({ mode }),
      updateUser: (u) => set((s) => ({ user: s.user ? { ...s.user, ...u } : s.user })),
      logout: () => {
        setToken(null);
        set({ token: null, user: null, onboarding: "done", mode: "customer" });
      },
    }),
    {
      name: "gassetu.session",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ mode: s.mode, language: s.language, token: s.token, user: s.user, onboarding: s.onboarding }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) setToken(state.token);
        useSession.setState({ hydrated: true });
      },
    },
  ),
);
