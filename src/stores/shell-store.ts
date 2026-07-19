"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ShellState = {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  selectedOrganizationId: string | null;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setSelectedOrganizationId: (id: string) => void;
};

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      selectedOrganizationId: null,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      setSelectedOrganizationId: (selectedOrganizationId) =>
        set({ selectedOrganizationId }),
    }),
    {
      name: "dastack-shell",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        selectedOrganizationId: state.selectedOrganizationId,
      }),
    },
  ),
);
