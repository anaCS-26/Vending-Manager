import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import type { DispatchWithRelations } from "@/types";

export interface OfflineLog {
  dispatchId: number;
  machineId: number;
  payload: {
    itemId: number;
    refilled: number;
    returned: number;
    capacity: number;
  }[];
  timestamp: string;
}

interface DriverState {
  activeDispatches: DispatchWithRelations[];
  machines: any[];
  offlineLogs: OfflineLog[];
  setServerData: (dispatches: DispatchWithRelations[], machines: any[]) => void;
  addOfflineLog: (log: OfflineLog) => void;
  clearOfflineLogs: () => void;
  removeOfflineLogs: (logTimestamps: string[]) => void;
}

// Custom storage utilizing idb-keyval
const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

export const useDriverStore = create<DriverState>()(
  persist(
    (setAct, getAct) => ({
      activeDispatches: [],
      machines: [],
      offlineLogs: [],
      setServerData: (dispatches, machines) => setAct({ activeDispatches: dispatches, machines }),
      addOfflineLog: (log) =>
        setAct((state) => ({ offlineLogs: [...state.offlineLogs, log] })),
      clearOfflineLogs: () => setAct({ offlineLogs: [] }),
      removeOfflineLogs: (logTimestamps) =>
        setAct((state) => ({
          offlineLogs: state.offlineLogs.filter(
            (log) => !logTimestamps.includes(log.timestamp)
          ),
        })),
    }),
    {
      name: 'driver-offline-storage',
      storage: createJSONStorage(() => idbStorage),
    }
  )
);
