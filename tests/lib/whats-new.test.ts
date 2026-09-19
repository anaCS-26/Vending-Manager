import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WHATS_NEW,
  audienceForRole,
  entriesFor,
  replacementFor,
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

  it('an outdated note points at a newer, current note that everyone who read the old one can see', () => {
    WHATS_NEW.forEach((e, i) => {
      if (!e.supersededBy) return;
      const j = WHATS_NEW.findIndex((n) => n.id === e.supersededBy);
      expect(j, `${e.id} → ${e.supersededBy} does not exist`).toBeGreaterThanOrEqual(0);
      expect(j, `${e.id} must be replaced by a NEWER entry`).toBeLessThan(i);
      expect(WHATS_NEW[j].supersededBy, `${e.supersededBy} is itself outdated — point ${e.id} at the newest`).toBeUndefined();
      for (const a of e.audience) expect(WHATS_NEW[j].audience, `${e.id}: ${a} would lose the replacement`).toContain(a);
    });
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

  it('an outdated note is never prompted, and resolves to its replacement', () => {
    const entries = [entry('new', ['admin']), { ...entry('old', ['admin']), supersededBy: 'new' }];
    expect(unseenEntries('admin', [], entries).map((e) => e.id)).toEqual(['new']);
    expect(replacementFor(entries[1], entries)?.id).toBe('new');
    expect(replacementFor(entries[0], entries)).toBeUndefined();
  });

  it('validEntryIds drops unknown ids, other audiences, non-strings and duplicates', () => {
    expect(validEntryIds('driver', ['a', 'a', 'c', 'nope', 42, null, "'; DROP TABLE"], SAMPLE)).toEqual(['a']);
  });
});
