"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { Theme, CompanyInfo } from "@/types";

interface AppContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  notificationsCount: number;
  setNotificationsCount: (count: number) => void;
  incrementNotifications: (by?: number) => void;
  clearNotifications: () => void;
  companyInfo: CompanyInfo;
  setCompanyInfo: (info: CompanyInfo) => void;
  isMobile: boolean;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = "live_productions_theme";
const SIDEBAR_STORAGE_KEY = "live_productions_sidebar";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || "light";
}

function getStoredSidebarState(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsedState] = useState(
    getStoredSidebarState
  );
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [companyInfo, setCompanyInfoState] = useState<CompanyInfo>({
    name: "Live Productions",
    slug: "live-productions",
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (!user?.tenant?.slug) return;
    setCompanyInfoState({
      name: user.tenant.name,
      slug: user.tenant.slug,
    });
  }, [user]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const incrementNotifications = useCallback((by = 1) => {
    setNotificationsCount((prev) => prev + by);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotificationsCount(0);
  }, []);

  const setCompanyInfo = useCallback((info: CompanyInfo) => {
    setCompanyInfoState(info);
  }, []);

  return (
    <AppContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar,
        setSidebarCollapsed,
        theme,
        toggleTheme,
        setTheme,
        notificationsCount,
        setNotificationsCount,
        incrementNotifications,
        clearNotifications,
        companyInfo,
        setCompanyInfo,
        isMobile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
