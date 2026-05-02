import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { useDriverStore, type OfflineLog } from '@/stores/useDriverStore';

const STORAGE_KEY = 'driver-offline-storage';

function makeLog(overrides: Partial<OfflineLog> = {}): OfflineLog {
  return {
    dispatchId: 1,
    machineId: 100,
    payload: [{ itemId: 1, refilled: 5, returned: 0 }],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Reset the in-memory Zustand state between tests. The persist middleware will
 * write to mocked idb-keyval; the global beforeEach in vitest.setup.ts wipes
 * the IndexedDB-backing object too.
 */
beforeEach(() => {
  useDriverStore.setState({ activeDispatches: [], machines: [], offlineLogs: [] });
});

describe('useDriverStore (in-memory state)', () => {
  it('starts with empty arrays', () => {
    const s = useDriverStore.getState();
    expect(s.activeDispatches).toEqual([]);
    expect(s.machines).toEqual([]);
    expect(s.offlineLogs).toEqual([]);
  });

  it('setServerData replaces dispatches and machines', () => {
    useDriverStore.getState().setServerData([{ id: 1 } as any], [{ id: 100 }]);
    const s = useDriverStore.getState();
    expect(s.activeDispatches).toHaveLength(1);
    expect(s.machines).toHaveLength(1);
  });

  it('addOfflineLog appends', () => {
    const log = makeLog();
    useDriverStore.getState().addOfflineLog(log);
    expect(useDriverStore.getState().offlineLogs).toEqual([log]);
  });

  it('removeOfflineLogs filters by timestamp set', () => {
    const a = makeLog({ timestamp: '2026-05-01T10:00:00Z' });
    const b = makeLog({ timestamp: '2026-05-01T11:00:00Z', machineId: 101 });
    useDriverStore.getState().addOfflineLog(a);
    useDriverStore.getState().addOfflineLog(b);

    useDriverStore.getState().removeOfflineLogs([a.timestamp]);
    expect(useDriverStore.getState().offlineLogs).toEqual([b]);
  });

  it('clearOfflineLogs empties the queue', () => {
    useDriverStore.getState().addOfflineLog(makeLog());
    useDriverStore.getState().clearOfflineLogs();
    expect(useDriverStore.getState().offlineLogs).toEqual([]);
  });
});

describe('useDriverStore persistence (round-trip through idb-keyval)', () => {
  // The Zustand persist middleware fires `setItem` after each mutation. Because
  // it goes through createJSONStorage, the value is serialized JSON. The mock
  // for idb-keyval lives in vitest.setup.ts; we observe it here.

  async function flushPersist() {
    // persist runs the setItem call asynchronously via the storage adapter
    await new Promise((r) => setTimeout(r, 0));
  }

  it('writes serialized state to IndexedDB on addOfflineLog', async () => {
    const log = makeLog({ timestamp: '2026-05-02T08:00:00Z' });
    useDriverStore.getState().addOfflineLog(log);
    await flushPersist();

    expect(vi.mocked(idbSet)).toHaveBeenCalled();
    // The most recent set call should contain the log timestamp.
    const calls = vi.mocked(idbSet).mock.calls;
    const last = calls[calls.length - 1];
    expect(last[0]).toBe(STORAGE_KEY);
    expect(String(last[1])).toContain(log.timestamp);
  });

  it('removeOfflineLogs persists the new (smaller) queue', async () => {
    const a = makeLog({ timestamp: '2026-05-02T08:00:00Z' });
    const b = makeLog({ timestamp: '2026-05-02T09:00:00Z' });
    useDriverStore.getState().addOfflineLog(a);
    useDriverStore.getState().addOfflineLog(b);
    await flushPersist();

    useDriverStore.getState().removeOfflineLogs([a.timestamp]);
    await flushPersist();

    const calls = vi.mocked(idbSet).mock.calls;
    const last = String(calls[calls.length - 1][1]);
    expect(last).not.toContain(a.timestamp);
    expect(last).toContain(b.timestamp);
  });

  it('clearOfflineLogs persists empty queue', async () => {
    useDriverStore.getState().addOfflineLog(makeLog());
    await flushPersist();
    useDriverStore.getState().clearOfflineLogs();
    await flushPersist();

    const calls = vi.mocked(idbSet).mock.calls;
    const last = String(calls[calls.length - 1][1]);
    // The persisted state has the empty offlineLogs array.
    expect(last).toMatch(/"offlineLogs":\s*\[\]/);
  });
});
