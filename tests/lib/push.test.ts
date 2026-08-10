import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../__helpers__/prisma-mock';

/**
 * The transport, tested against the real module. @/lib/push is mocked globally
 * in vitest.setup.ts (it reaches the network), so this file pulls the genuine
 * implementation in via importActual. `web-push` itself stays mocked — the unit
 * under test is our failure handling, not RFC 8291 encryption.
 */

class FakeWebPushError extends Error {
  statusCode: number;
  constructor(statusCode: number) {
    super(`push service returned ${statusCode}`);
    this.statusCode = statusCode;
  }
}

const sendNotification = vi.fn();

vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
  },
  WebPushError: FakeWebPushError,
}));

async function realPush() {
  return vi.importActual<typeof import('@/lib/push')>('@/lib/push');
}

const SUBS = [
  { id: 1, endpoint: 'https://push.test/alive', keys: { p256dh: 'p', auth: 'a' } },
  { id: 2, endpoint: 'https://push.test/gone', keys: { p256dh: 'p', auth: 'a' } },
];

beforeEach(() => {
  sendNotification.mockReset();
  process.env.VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  process.env.VAPID_SUBJECT = 'mailto:ops@test.local';
});

describe('isPushConfigured', () => {
  it('is false when the keys are absent, so callers can say so instead of failing', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const { isPushConfigured } = await realPush();
    expect(isPushConfigured()).toBe(false);
  });

  it('is true once both keys are present', async () => {
    const { isPushConfigured } = await realPush();
    expect(isPushConfigured()).toBe(true);
  });
});

describe('sendToSubscriptions', () => {
  it('degrades to a logged skip when VAPID is unconfigured, never a throw', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sendToSubscriptions } = await realPush();

    const result = await sendToSubscriptions(SUBS, { title: 't', body: 'b' });

    expect(result.skipped).toBe('not-configured');
    expect(sendNotification).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports "no-subscriptions" distinctly from "not-configured"', async () => {
    const { sendToSubscriptions } = await realPush();
    const result = await sendToSubscriptions([], { title: 't', body: 'b' });
    expect(result.skipped).toBe('no-subscriptions');
  });

  it('DELETES an endpoint the push service reports as permanently gone (410)', async () => {
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('/gone')) throw new FakeWebPushError(410);
      return { statusCode: 201 };
    });
    const { sendToSubscriptions } = await realPush();

    const result = await sendToSubscriptions(SUBS, { title: 't', body: 'b' });

    expect(result).toMatchObject({ sent: 1, failed: 1, pruned: 1 });
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.test/gone' },
    });
  });

  it('also prunes a 404 — same permanence, different service', async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError(404));
    const { sendToSubscriptions } = await realPush();

    const result = await sendToSubscriptions([SUBS[0]], { title: 't', body: 'b' });
    expect(result.pruned).toBe(1);
  });

  it('KEEPS an endpoint that failed retryably (429), only counting the failure', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendNotification.mockRejectedValue(new FakeWebPushError(429));
    const { sendToSubscriptions } = await realPush();

    const result = await sendToSubscriptions([SUBS[0]], { title: 't', body: 'b' });

    expect(result).toMatchObject({ sent: 0, failed: 1, pruned: 0 });
    // The row survives; only its failure counter moves.
    expect(prismaMock.pushSubscription.updateMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ['https://push.test/alive'] } },
      data: { failureCount: { increment: 1 } },
    });
    err.mockRestore();
  });

  it('marks successful endpoints delivered and clears their failure count', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { sendToSubscriptions } = await realPush();

    await sendToSubscriptions([SUBS[0]], { title: 't', body: 'b' });

    const call = prismaMock.pushSubscription.updateMany.mock.calls.find(
      (c: any) => c[0]?.data?.failureCount === 0,
    );
    expect(call).toBeDefined();
  });

  it('sends the payload as JSON the service worker can parse', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { sendToSubscriptions } = await realPush();

    await sendToSubscriptions([SUBS[0]], {
      title: 'New stock',
      body: '12 × Water',
      url: '/driver',
      tag: 'assignment-7',
    });

    const [, body] = sendNotification.mock.calls[0];
    expect(JSON.parse(body as string)).toEqual({
      title: 'New stock',
      body: '12 × Water',
      url: '/driver',
      tag: 'assignment-7',
    });
  });

  it('one bad device does not stop the others (fan-out is not sequential)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('/gone')) throw new FakeWebPushError(500);
      return { statusCode: 201 };
    });
    const { sendToSubscriptions } = await realPush();

    const result = await sendToSubscriptions(SUBS, { title: 't', body: 'b' });

    expect(result.sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });
});

describe('sendPushToDriver / sendPushToAdmins', () => {
  it('never throws into the caller when the store itself fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.pushSubscription.findMany.mockRejectedValue(new Error('db down'));
    const { sendPushToDriver, sendPushToAdmins } = await realPush();

    // An assignment whose stock has already moved must not be failed by a
    // notification problem.
    await expect(sendPushToDriver(7, { title: 't', body: 'b' })).resolves.toMatchObject({ failed: 1 });
    await expect(sendPushToAdmins({ title: 't', body: 'b' })).resolves.toMatchObject({ failed: 1 });
    err.mockRestore();
  });

  it('targets only the requested driver', async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);
    const { sendPushToDriver } = await realPush();

    await sendPushToDriver(7, { title: 't', body: 'b' });

    expect(prismaMock.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { driverId: 7 } }),
    );
  });

  it('targets every admin device for the ops audience', async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);
    const { sendPushToAdmins } = await realPush();

    await sendPushToAdmins({ title: 't', body: 'b' });

    expect(prismaMock.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { adminId: { not: null } } }),
    );
  });
});
