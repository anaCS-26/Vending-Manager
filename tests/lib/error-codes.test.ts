import { describe, it, expect } from 'vitest';
import {
  classifyError,
  formatUserError,
  makeReferenceCode,
  normalizeReferenceCode,
  ERROR_COPY,
} from '@/lib/error-codes';

/** Structural stand-in: classifyError recognises Prisma by name + code, not instanceof. */
function prismaError(code: string, name = 'PrismaClientKnownRequestError'): Error {
  const e = new Error(`Invalid \`prisma.item.update()\` invocation: constraint "Item_sku_key"`);
  e.name = name;
  (e as Error & { code: string }).code = code;
  return e;
}

describe('classifyError', () => {
  it('treats a bare Error as the app talking to the user', () => {
    expect(classifyError(new Error('Insufficient stock for LAYS'))).toEqual({
      kind: 'BUSINESS_RULE',
      expected: true,
      prismaCode: null,
    });
  });

  it('maps the pooler timeout (P2028) — the failure a real SAR 124k invoice hit — to TIMEOUT', () => {
    expect(classifyError(prismaError('P2028'))).toMatchObject({ kind: 'TIMEOUT', expected: false, prismaCode: 'P2028' });
  });

  it.each([
    ['P2002', 'DUPLICATE'],
    ['P2003', 'IN_USE'],
    ['P2025', 'NOT_FOUND'],
    ['P1001', 'DATABASE_UNREACHABLE'],
    ['P9999', 'UNEXPECTED'],
  ])('maps %s to %s', (code, kind) => {
    expect(classifyError(prismaError(code)).kind).toBe(kind);
  });

  it('a Prisma init failure is "cannot reach the server", whatever its code', () => {
    expect(classifyError(prismaError('P1000', 'PrismaClientInitializationError')).kind).toBe('DATABASE_UNREACHABLE');
  });

  it('a TypeError is a bug, never a message for the user', () => {
    expect(classifyError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toMatchObject({
      kind: 'UNEXPECTED',
      expected: false,
    });
  });

  it('survives non-Error throwables', () => {
    expect(classifyError('boom').kind).toBe('UNEXPECTED');
    expect(classifyError(undefined).kind).toBe('UNEXPECTED');
  });
});

describe('formatUserError', () => {
  it('passes a business message through untouched, with NO code', () => {
    const err = new Error('Insufficient stock for LAYS');
    const out = formatUserError(err, classifyError(err), 'E-AAAAA', 'Failed');
    expect(out).toBe('Insufficient stock for LAYS');
  });

  it('never leaks Prisma text: the user gets English, Arabic and the code — nothing else', () => {
    const err = prismaError('P2028');
    const out = formatUserError(err, classifyError(err), 'E-7K3Q9', 'Failed to complete purchase order');
    expect(out).toBe(`${ERROR_COPY.TIMEOUT.en}\n${ERROR_COPY.TIMEOUT.ar}\nRef E-7K3Q9`);
    expect(out).not.toContain('prisma');
    expect(out).not.toContain('Item_sku_key');
  });

  it('every unexpected kind has Arabic copy', () => {
    for (const copy of Object.values(ERROR_COPY)) {
      expect(copy.ar).toMatch(/[؀-ۿ]/);
      expect(copy.en.length).toBeGreaterThan(0);
    }
  });
});

describe('reference codes', () => {
  it('has the documented shape and avoids look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeReferenceCode('E');
      expect(code).toMatch(/^E-[2-9A-HJKMNP-TV-Z]{5}$/);
      expect(code.slice(2)).not.toMatch(/[01ILOU]/);
    }
    expect(makeReferenceCode('R')).toMatch(/^R-/);
  });

  it('is deterministic given its byte source', () => {
    expect(makeReferenceCode('E', () => new Uint8Array([0, 1, 2, 3, 4]))).toBe('E-23456');
  });

  it('normalises what a person would actually type back', () => {
    expect(normalizeReferenceCode(' e-7k3q9 ')).toBe('E-7K3Q9');
    expect(normalizeReferenceCode('r7k3q9')).toBe('R-7K3Q9');
    expect(normalizeReferenceCode('E 7K3Q9')).toBe('E-7K3Q9');
    expect(normalizeReferenceCode('1234567890')).toBeNull();
    expect(normalizeReferenceCode('')).toBeNull();
  });
});
