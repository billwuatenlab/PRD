import { create } from 'zustand';

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  selectedCategoryId: number | null;
  setSelectedCategoryId: (id: number | null) => void;
  selectedProductId: number | null;
  setSelectedProductId: (id: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  selectedCategoryId: null,
  setSelectedCategoryId: (id) => set({ selectedCategoryId: id, selectedProductId: null }),
  selectedProductId: null,
  setSelectedProductId: (id) => set({ selectedProductId: id }),
}));
