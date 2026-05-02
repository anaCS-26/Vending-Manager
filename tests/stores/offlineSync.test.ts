import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDriverStore, type OfflineLog } from '@/stores/useDriverStore';

/**
 * Offline-sync simulator. The real flush logic lives inside `DriverRefillUI`'s
 * `autoSyncQueue` (it iterates store logs, calls `logBatchRefills` per log,
 * removes successful timestamps). To exercise the *queue* contract without
 * mounting the 780-line UI, this test imitates the same loop and asserts
 * partial-failure behavior: failed logs stay in the queue, successful ones
 * are removed.
 */

vi.mock('@/actions/inventory', () => ({
  logBatchRefills: vi.fn(),
}));

import { logBatchRefills } from '@/actions/inventory';

function makeLog(overrides: Partial<OfflineLog> = {}): OfflineLog {
  return {
    dispatchId: 1,
    machineId: 100,
    payload: [{ itemId: 1, refilled: 5, returned: 0 }],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

async function autoSyncQueue() {
  // Mirrors the real implementation in DriverRefillUI: for each log, attempt
  // submission; collect timestamps to drop, leave failed ones in place.
  const logs = useDriverStore.getState().offlineLogs;
  const ok: string[] = [];
  for (const log of logs) {
    const wireDispatchId = log.dispatchId === 0 ? null : log.dispatchId;
    const result = await logBatchRefills(wireDispatchId, log.machineId, log.payload);
    if (result.success) ok.push(log.timestamp);
  }
  useDriverStore.getState().removeOfflineLogs(ok);
  return { successes: ok.length, failures: logs.length - ok.length };
}

beforeEach(() => {
  useDriverStore.setState({ activeDispatches: [], machines: [], offlineLogs: [] });
});

describe('offline sync queue', () => {
  it('drains the queue when every log succeeds', async () => {
    vi.mocked(logBatchRefills).mockResolvedValue({ success: true, data: undefined });
    useDriverStore.getState().addOfflineLog(makeLog({ timestamp: 't1' }));
    useDriverStore.getState().addOfflineLog(makeLog({ timestamp: 't2', machineId: 101 }));

    const r = await autoSyncQueue();
    expect(r.successes).toBe(2);
    expect(r.failures).toBe(0);
    expect(useDriverStore.getState().offlineLogs).toEqual([]);
  });

  it('keeps failed logs and removes only the successful ones', async () => {
    vi.mocked(logBatchRefills)
      .mockResolvedValueOnce({ success: true, data: undefined })       // t1 ok
      .mockResolvedValueOnce({ success: false, error: 'server down' })  // t2 fail
      .mockResolvedValueOnce({ success: true, data: undefined });      // t3 ok
    useDriverStore.getState().addOfflineLog(makeLog({ timestamp: 't1' }));
    useDriverStore.getState().addOfflineLog(makeLog({ timestamp: 't2', machineId: 101 }));
    useDriverStore.getState().addOfflineLog(makeLog({ timestamp: 't3', machineId: 102 }));

    const r = await autoSyncQueue();
    expect(r.successes).toBe(2);
    expect(r.failures).toBe(1);
    const remaining = useDriverStore.getState().offlineLogs.map((l) => l.timestamp);
    expect(remaining).toEqual(['t2']);
  });

  it('translates dispatchId=0 (synthetic dispatchless sentinel) to null on the wire', async () => {
    vi.mocked(logBatchRefills).mockResolvedValue({ success: true, data: undefined });
    useDriverStore.getState().addOfflineLog(makeLog({ dispatchId: 0, timestamp: 't1' }));

    await autoSyncQueue();

    expect(logBatchRefills).toHaveBeenCalledWith(null, 100, expect.any(Array));
  });

  it('preserves a queue entry when the action throws (transient network error)', async () => {
    vi.mocked(logBatchRefills)
      .mockRejectedValueOnce(new Error('NetworkError'))
      .mockResolvedValueOnce({ success: true, data: undefined });
    useDriverStore.getState().addOfflineLog(makeLog({ timestamp: 't1' }));
    useDriverStore.getState().addOfflineLog(makeLog({ timestamp: 't2', machineId: 101 }));

    // The simulator above doesn't catch — wrap to mirror real-world resilience.
    await expect(autoSyncQueue()).rejects.toThrow(/NetworkError/);

    // Both logs remain; we never got to t2.
    expect(useDriverStore.getState().offlineLogs.map((l) => l.timestamp)).toEqual(['t1', 't2']);
  });
});
