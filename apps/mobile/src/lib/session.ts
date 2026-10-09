import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@gassetu/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { setToken } from "./api";
import {
  restoreTenantSession,
  revokeTenantSession,
  setPlatformAccessToken,
  type TenantAccess,
  type TenantSessionUser,
} from "./platform-api";
import { clearSecureSessionToken, readSecureSessionToken, saveSecureSessionToken } from "./secure-session";

export type Mode = "business" | "delivery";
export type SessionKind = "demo" | "tenant" | null;

function mobileUser(user: TenantSessionUser): User {
  return {
    id: user.publicId,
    role: "business",
    name: user.fullName,
    phone: user.phoneE164.replace(/^\+91/, ""),
    language: "en",
    avatarColor: "#A31E21",
  };
}

interface SessionState {
  hydrated: boolean;
  sessionKind: SessionKind;
  mode: Mode;
  language: "en" | "hi" | "te";
  token: string | null;
  user: User | null;
  tenantUser: TenantSessionUser | null;
  tenants: TenantAccess[];
  activeTenantPublicId: string | null;
  /** onboarding checkpoints for a new business */
  onboarding: "profile" | "connection" | "done";
  setLanguage: (l: SessionState["language"]) => void;
  login: (token: string, user: User, opts?: { isNew?: boolean; hasProfile?: boolean; hasAgency?: boolean }) => void;
  loginTenant: (token: string, user: TenantSessionUser, tenants: TenantAccess[]) => Promise<void>;
  selectTenant: (tenantPublicId: string) => void;
  setOnboarding: (s: SessionState["onboarding"]) => void;
  setMode: (m: Mode) => void;
  updateUser: (u: Partial<User>) => void;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      sessionKind: null,
      mode: "business",
      language: "en",
      token: null,
      user: null,
      tenantUser: null,
      tenants: [],
      activeTenantPublicId: null,
      onboarding: "done",
      setLanguage: (language) => set({ language }),
      login: (token, user, opts) => {
        setToken(token);
        setPlatformAccessToken(null);
        const onboarding = user.role === "business" ? (opts?.hasProfile ? (opts?.hasAgency ? "done" : "connection") : "profile") : "done";
        set({ sessionKind: "demo", token, user, tenantUser: null, tenants: [], activeTenantPublicId: null, onboarding, mode: user.role === "delivery" ? "delivery" : "business" });
      },
      loginTenant: async (token, tenantUser, tenants) => {
        await saveSecureSessionToken(token);
        setToken(null);
        setPlatformAccessToken(token);
        set({
          sessionKind: "tenant",
          token,
          user: mobileUser(tenantUser),
          tenantUser,
          tenants,
          activeTenantPublicId: tenants.length === 1 ? tenants[0]!.publicId : null,
          onboarding: "done",
          mode: "business",
        });
      },
      selectTenant: (tenantPublicId) => {
        if (get().tenants.some((tenant) => tenant.publicId === tenantPublicId)) set({ activeTenantPublicId: tenantPublicId });
      },
      setOnboarding: (onboarding) => set({ onboarding }),
      setMode: (mode) => set({ mode }),
      updateUser: (u) => set((s) => ({ user: s.user ? { ...s.user, ...u } : s.user })),
      logout: async () => {
        const tenantSession = get().sessionKind === "tenant";
        setToken(null);
        set({ sessionKind: null, token: null, user: null, tenantUser: null, tenants: [], activeTenantPublicId: null, onboarding: "done", mode: "business" });
        try {
          if (tenantSession) await revokeTenantSession();
        } catch {
          // Local logout must still succeed if the network or server is unavailable.
        } finally {
          setPlatformAccessToken(null);
          await clearSecureSessionToken();
        }
      },
    }),
    {
      name: "gassetu.b2b.session",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        sessionKind: s.sessionKind,
        mode: s.mode,
        language: s.language,
        token: s.sessionKind === "demo" ? s.token : null,
        user: s.user,
        tenantUser: s.tenantUser,
        tenants: s.tenants,
        activeTenantPublicId: s.activeTenantPublicId,
        onboarding: s.onboarding,
      }),
      onRehydrateStorage: () => (state) => {
        void (async () => {
          try {
            if (state?.sessionKind === "tenant") {
              const secureToken = await readSecureSessionToken();
              if (secureToken) {
                setPlatformAccessToken(secureToken);
                const restored = await restoreTenantSession();
                const activeTenantPublicId = restored.tenants.some((tenant) => tenant.publicId === state.activeTenantPublicId)
                  ? state.activeTenantPublicId
                  : restored.tenants.length === 1
                    ? restored.tenants[0]!.publicId
                    : null;
                useSession.setState({
                  token: secureToken,
                  user: mobileUser(restored.user),
                  tenantUser: restored.user,
                  tenants: restored.tenants,
                  activeTenantPublicId,
                });
              } else {
                useSession.setState({ sessionKind: null, token: null, user: null, tenantUser: null, tenants: [], activeTenantPublicId: null });
              }
            } else if (state?.sessionKind === "demo" && state.token) {
              setToken(state.token);
            }
          } catch {
            setPlatformAccessToken(null);
            await clearSecureSessionToken().catch(() => undefined);
            useSession.setState({ sessionKind: null, token: null, user: null, tenantUser: null, tenants: [], activeTenantPublicId: null });
          } finally {
            useSession.setState({ hydrated: true });
          }
        })();
      },
    },
  ),
);
