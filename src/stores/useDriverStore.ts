import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import type { DispatchWithRelations, RefillEntryMode, RefillHint } from "@/types";

export interface OfflineLog {
  dispatchId: number;
  machineId: number;
  payload: {
    itemId: number;
    refilled: number;
    returned: number;
    bag_returned?: number;
  }[];
  timestamp: string;
  /**
   * Idempotency key, generated once when the entry is queued and kept stable
   * across retries. `timestamp` is a local ordering key the server never sees;
   * this is what lets the server recognise a replay of a batch that already
   * committed but whose response was lost. Optional so entries queued before
   * this field existed still drain.
   */
  clientRequestId?: string;
}

interface DriverState {
  activeDispatches: DispatchWithRelations[];
  machines: any[];
  offlineLogs: OfflineLog[];
  /**
   * Last-visit quantities per machine+item, refreshed whenever the portal loads
   * online. Persisted with the rest of the store because the driver is often out
   * of signal at the machine — a suggestion that only works online is missing at
   * precisely the moment it would save typing.
   */
  refillHints: RefillHint[];
  /** Which entry style the refill sheet uses. Per-device, survives reinstall. */
  refillMode: RefillEntryMode;
  setServerData: (dispatches: DispatchWithRelations[], machines: any[]) => void;
  setRefillHints: (hints: RefillHint[]) => void;
  setRefillMode: (mode: RefillEntryMode) => void;
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
      refillHints: [],
      refillMode: 'quick',
      setServerData: (dispatches, machines) => setAct({ activeDispatches: dispatches, machines }),
      setRefillHints: (hints) => setAct({ refillHints: hints }),
      setRefillMode: (mode) => setAct({ refillMode: mode }),
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
