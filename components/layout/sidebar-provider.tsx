"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type SidebarContextType = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar-collapsed");
      if (saved === "true") setCollapsed(true);
    } catch {}
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("sidebar-collapsed", String(collapsed));
    } catch {}
  }, [collapsed]);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle: () => setCollapsed((c) => !c) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
