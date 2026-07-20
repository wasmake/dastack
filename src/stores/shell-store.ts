"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ShellState = {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  selectedOrganizationId: string | null;
  selectedProjectId: string | null;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setSelectedOrganizationId: (id: string) => void;
  setSelectedProjectId: (id: string | null) => void;
};

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      selectedOrganizationId: null,
      selectedProjectId: null,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      setSelectedOrganizationId: (selectedOrganizationId) =>
        set({ selectedOrganizationId, selectedProjectId: null }),
      setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
    }),
    {
      name: "dastack-shell",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        selectedOrganizationId: state.selectedOrganizationId,
        selectedProjectId: state.selectedProjectId,
      }),
    },
  ),
);
