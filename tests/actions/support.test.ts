import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  submitProblemReport,
  reportClientError,
  markAnnouncementsSeen,
  setProblemReportResolved,
} from '@/actions/support';
import { prismaMock } from '../__helpers__/prisma-mock';
import {
  setAdminSession,
  setDriverSession,
  setSuperAdminSession,
  clearSession,
} from '../__helpers__/session-mock';
import { writeAuditLog } from '@/lib/audit-utils';
import { sendPushToSuperAdmins, sendPushToAdmins } from '@/lib/push';
import { sendProblemReportEmail } from '@/lib/email';
import { problemReportRateLimit, clientErrorRateLimit } from '@/lib/rate-limit';
import { put } from '@vercel/blob';
import { WHATS_NEW } from '@/lib/whats-new';

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const png = (bytes = 10, type = 'image/png') => new File([new Uint8Array(bytes)], 'shot.png', { type });

beforeEach(() => {
  vi.mocked(writeAuditLog).mockClear();
  vi.mocked(sendPushToSuperAdmins).mockClear();
  vi.mocked(sendPushToAdmins).mockClear();
  vi.mocked(sendProblemReportEmail).mockClear();
  vi.mocked(put).mockClear();
  vi.mocked(problemReportRateLimit.limit).mockResolvedValue({ success: true } as never);
  vi.mocked(clientErrorRateLimit.limit).mockResolvedValue({ success: true } as never);
  prismaMock.problemReport.create.mockResolvedValue({ id: 1 });
  prismaMock.errorEvent.create.mockResolvedValue({ id: 1 });
});

describe('support actions — RBAC', () => {
  it('every action rejects an unauthenticated caller', async () => {
    clearSession();
    await expect(submitProblemReport(form({ note: 'x' }))).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
    await expect(reportClientError({ source: 'client', message: 'x' })).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
    await expect(markAnnouncementsSeen(['a'])).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
    await expect(setProblemReportResolved(1, true)).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
  });

  it('resolving a report is super-admin only — a client admin cannot close their own complaint', async () => {
    setAdminSession(3);
    await expect(setProblemReportResolved(1, true)).rejects.toThrow(/FORBIDDEN/);
    setDriverSession(7);
    await expect(setProblemReportResolved(1, true)).rejects.toThrow(/FORBIDDEN/);
    expect(prismaMock.problemReport.update).not.toHaveBeenCalled();
  });
});

describe('submitProblemReport', () => {
  it('attributes the report to the SESSION, ignoring any identity in the form', async () => {
    setDriverSession(42, 'Khalid');
    const r = await submitProblemReport(
      form({ note: 'الشاشة لا تعمل', path: '/driver', actorId: '1', actorRole: 'super_admin', actorName: 'Root' }),
    );
    expect(r.success).toBe(true);
    const data = prismaMock.problemReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ actorId: 42, actorRole: 'driver', actorName: 'Khalid', path: '/driver', note: 'الشاشة لا تعمل' });
    expect(data.code).toMatch(/^R-[2-9A-Z]{5}$/);
    if (r.success) expect(r.data.code).toBe(data.code);
  });

  it('tells the developer, not the client: push goes to super-admins only, plus email', async () => {
    setAdminSession(3, 'Ahmed');
    await submitProblemReport(form({ note: 'cannot receive order' }));
    expect(sendPushToSuperAdmins).toHaveBeenCalledTimes(1);
    expect(sendPushToAdmins).not.toHaveBeenCalled();
    expect(sendProblemReportEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty report before writing anything', async () => {
    setDriverSession(1);
    const r = await submitProblemReport(form({ note: '   ' }));
    expect(r.success).toBe(false);
    expect(prismaMock.problemReport.create).not.toHaveBeenCalled();
  });

  it('an attached error code alone is enough (the error screen pre-fills it)', async () => {
    setDriverSession(1);
    const r = await submitProblemReport(form({ note: '', errorCode: 'E-7K3Q9' }));
    expect(r.success).toBe(true);
    expect(prismaMock.problemReport.create.mock.calls[0][0].data.errorCode).toBe('E-7K3Q9');
  });

  it('sanitises client-supplied context: external path, malformed code, unknown device keys', async () => {
    setDriverSession(1);
    await submitProblemReport(
      form({
        note: 'x',
        path: 'https://evil.example/phish',
        errorCode: '<script>alert(1)</script>',
        device: JSON.stringify({ viewport: '390x844', dpr: 3, standalone: true, evil: 'payload', nested: { a: 1 } }),
      }),
    );
    const data = prismaMock.problemReport.create.mock.calls[0][0].data;
    expect(data.path).toBeNull();
    expect(data.errorCode).toBeNull();
    expect(data.device).toEqual({ viewport: '390x844', dpr: 3, standalone: true });
  });

  it('caps the note length', async () => {
    setDriverSession(1);
    await submitProblemReport(form({ note: 'a'.repeat(5000) }));
    expect(prismaMock.problemReport.create.mock.calls[0][0].data.note).toHaveLength(2000);
  });

  it('uploads a screenshot under an unguessable name', async () => {
    setDriverSession(1);
    await submitProblemReport(form({ note: 'x', screenshot: png() }));
    expect(put).toHaveBeenCalledTimes(1);
    const [name, , opts] = vi.mocked(put).mock.calls[0];
    expect(name).toMatch(/^problem-reports\/R-[2-9A-Z]{5}\.png$/);
    expect(opts).toMatchObject({ addRandomSuffix: true });
    expect(prismaMock.problemReport.create.mock.calls[0][0].data.screenshotUrl).toContain('mock://blob/');
  });

  it('refuses non-images and oversized files', async () => {
    setDriverSession(1);
    const notImage = await submitProblemReport(form({ note: 'x', screenshot: png(10, 'application/pdf') }));
    expect(notImage.success).toBe(false);
    const tooBig = await submitProblemReport(form({ note: 'x', screenshot: png(5 * 1024 * 1024 + 1) }));
    expect(tooBig.success).toBe(false);
    expect(put).not.toHaveBeenCalled();
    expect(prismaMock.problemReport.create).not.toHaveBeenCalled();
  });

  it('a failed upload does not lose the report', async () => {
    setDriverSession(1);
    vi.mocked(put).mockRejectedValueOnce(new Error('blob store down'));
    const r = await submitProblemReport(form({ note: 'still matters', screenshot: png() }));
    expect(r.success).toBe(true);
    expect(prismaMock.problemReport.create.mock.calls[0][0].data).toMatchObject({ note: 'still matters', screenshotUrl: null });
  });

  it('is rate limited per user, before any write', async () => {
    setDriverSession(9);
    vi.mocked(problemReportRateLimit.limit).mockResolvedValueOnce({ success: false } as never);
    const r = await submitProblemReport(form({ note: 'x' }));
    expect(r.success).toBe(false);
    expect(problemReportRateLimit.limit).toHaveBeenCalledWith('driver:9');
    expect(prismaMock.problemReport.create).not.toHaveBeenCalled();
  });
});

describe('reportClientError', () => {
  it('records the event against the session and returns a fresh E- code', async () => {
    setDriverSession(5);
    const r = await reportClientError({ source: 'client', message: 'x is not a function', stack: 'at y', path: '/driver' });
    expect(r.success).toBe(true);
    const data = prismaMock.errorEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: 'client', actorId: 5, actorRole: 'driver', path: '/driver', expected: false });
    expect(data.code).toMatch(/^E-/);
  });

  it('uses the Next digest as the code, so the number on screen is the number in the table', async () => {
    setAdminSession(2);
    const r = await reportClientError({ source: 'boundary', message: 'boom', digest: '2847193650' });
    expect(r).toEqual({ success: true, data: { code: '2847193650' } });
    expect(prismaMock.errorEvent.create.mock.calls[0][0].data.code).toBe('2847193650');
  });

  it('is rate limited, and writes nothing when limited', async () => {
    setDriverSession(5);
    vi.mocked(clientErrorRateLimit.limit).mockResolvedValueOnce({ success: false } as never);
    const r = await reportClientError({ source: 'client', message: 'loop' });
    expect(r.success).toBe(false);
    expect(prismaMock.errorEvent.create).not.toHaveBeenCalled();
  });
});

describe('markAnnouncementsSeen', () => {
  const adminEntry = WHATS_NEW.find((e) => e.audience.includes('admin') && !e.audience.includes('driver'))!;
  const driverEntry = WHATS_NEW.find((e) => e.audience.includes('driver'))!;

  it('writes receipts for the session owner only, idempotently', async () => {
    setDriverSession(8);
    prismaMock.announcementSeen.createMany.mockResolvedValue({ count: 1 });
    await markAnnouncementsSeen([driverEntry.id]);
    expect(prismaMock.announcementSeen.createMany).toHaveBeenCalledWith({
      data: [{ entryId: driverEntry.id, driverId: 8 }],
      skipDuplicates: true,
    });
  });

  it('an admin session writes adminId', async () => {
    setAdminSession(3);
    prismaMock.announcementSeen.createMany.mockResolvedValue({ count: 1 });
    await markAnnouncementsSeen([adminEntry.id]);
    expect(prismaMock.announcementSeen.createMany.mock.calls[0][0].data).toEqual([{ entryId: adminEntry.id, adminId: 3 }]);
  });

  it('drops ids that are not real entries for the caller — no arbitrary strings reach the table', async () => {
    setDriverSession(8);
    const r = await markAnnouncementsSeen(['made-up', adminEntry.id]);
    expect(r).toEqual({ success: true, data: { marked: 0 } });
    expect(prismaMock.announcementSeen.createMany).not.toHaveBeenCalled();
  });
});

describe('setProblemReportResolved', () => {
  it('flips status, stamps resolvedAt and audits', async () => {
    setSuperAdminSession(1);
    prismaMock.problemReport.findUnique.mockResolvedValue({ status: 'OPEN', code: 'R-ABCDE' });
    prismaMock.problemReport.update.mockResolvedValue({});
    const r = await setProblemReportResolved(4, true);
    expect(r.success).toBe(true);
    const args = prismaMock.problemReport.update.mock.calls[0][0];
    expect(args.data.status).toBe('RESOLVED');
    expect(args.data.resolvedAt).toBeInstanceOf(Date);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), 'RESOLVE_PROBLEM_REPORT', 'ProblemReport', 4, { status: 'OPEN' }, { status: 'RESOLVED' }, expect.any(String),
    );
  });
});
