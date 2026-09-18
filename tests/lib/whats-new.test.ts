import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WHATS_NEW,
  audienceForRole,
  entriesFor,
  unseenEntries,
  validEntryIds,
  type WhatsNewEntry,
} from '@/lib/whats-new';

const entry = (id: string, audience: WhatsNewEntry['audience']): WhatsNewEntry => ({
  id,
  date: '2026-01-01',
  audience,
  title: { en: id, ar: 'عنوان' },
  body: { en: 'body', ar: 'نص' },
});

const SAMPLE = [entry('c', ['admin']), entry('b', ['driver']), entry('a', ['admin', 'driver'])];

describe("What's New — the shipped entries", () => {
  it('ids are unique (an id is the AnnouncementSeen key — a duplicate hides a note forever)', () => {
    const ids = WHATS_NEW.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry is written in both languages', () => {
    for (const e of WHATS_NEW) {
      for (const text of [e.title, e.body]) {
        expect(text.en.trim().length, e.id).toBeGreaterThan(0);
        expect(text.ar, e.id).toMatch(/[؀-ۿ]/);
      }
      expect(e.audience.length, e.id).toBeGreaterThan(0);
      expect(e.date, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('is newest-first, so the prompt leads with the latest feature', () => {
    const dates = WHATS_NEW.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('every media file exists, and clips are mp4 (iOS Safari will not play webm)', () => {
    for (const e of WHATS_NEW) {
      if (!e.media) continue;
      expect(e.media.src.startsWith('/whats-new/'), e.id).toBe(true);
      expect(existsSync(resolve(__dirname, '../../public', `.${e.media.src}`)), `${e.id}: ${e.media.src}`).toBe(true);
      if (e.media.type === 'video') expect(e.media.src, e.id).toMatch(/\.mp4$/);
    }
  });

  it('links point inside the zone their audience can open', () => {
    for (const e of WHATS_NEW) {
      if (!e.href) continue;
      if (e.href.startsWith('/admin')) expect(e.audience, e.id).toEqual(['admin']);
      if (e.href.startsWith('/driver')) expect(e.audience, e.id).toEqual(['driver']);
    }
  });
});

describe('audience + seen rules', () => {
  it('maps roles; a super-admin reads what the client admins read', () => {
    expect(audienceForRole('driver')).toBe('driver');
    expect(audienceForRole('admin')).toBe('admin');
    expect(audienceForRole('super_admin')).toBe('admin');
    expect(audienceForRole(undefined)).toBeNull();
    expect(audienceForRole('hacker')).toBeNull();
  });

  it('filters by audience and preserves order', () => {
    expect(entriesFor('admin', SAMPLE).map((e) => e.id)).toEqual(['c', 'a']);
    expect(entriesFor('driver', SAMPLE).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('unseen = audience entries minus receipts', () => {
    expect(unseenEntries('admin', ['a'], SAMPLE).map((e) => e.id)).toEqual(['c']);
    expect(unseenEntries('admin', ['a', 'c'], SAMPLE)).toEqual([]);
  });

  it('validEntryIds drops unknown ids, other audiences, non-strings and duplicates', () => {
    expect(validEntryIds('driver', ['a', 'a', 'c', 'nope', 42, null, "'; DROP TABLE"], SAMPLE)).toEqual(['a']);
  });
});
