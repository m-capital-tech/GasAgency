"use client";
import type { Agency, User } from "@gassetu/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  user: User | null;
  agency: Agency | null;
  login: (user: User, agency: Agency | null) => void;
  logout: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      agency: null,
      login: (user, agency) => set({ user, agency }),
      logout: () => set({ user: null, agency: null }),
    }),
    { name: "gassetu.web.session" },
  ),
);
