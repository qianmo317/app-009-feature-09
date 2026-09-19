import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PrintOrientation = 'portrait' | 'landscape';

interface PrintSettingsState {
  orientation: PrintOrientation;
  rowsPerPage: number;
  setOrientation: (orientation: PrintOrientation) => void;
  setRowsPerPage: (rowsPerPage: number) => void;
}

export const usePrintSettingsStore = create<PrintSettingsState>()(
  persist(
    (set) => ({
      orientation: 'portrait',
      rowsPerPage: 40,
      setOrientation: (orientation) => set({ orientation }),
      setRowsPerPage: (n) => {
        if (!Number.isFinite(n) || n <= 0) return;
        set({ rowsPerPage: Math.min(500, Math.round(n)) });
      },
    }),
    { name: 'knitting-print-settings' }
  )
);
