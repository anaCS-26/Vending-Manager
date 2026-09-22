import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WhatsNewEntry } from '@/lib/whats-new';

let pathname = '/admin/orders';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { WhatsNewHint } from '@/components/whats-new/WhatsNewHint';
import { WhatsNewList } from '@/components/whats-new/WhatsNewList';

const note = (id: string, date: string, extra: Partial<WhatsNewEntry> = {}): WhatsNewEntry => ({
    id, date, audience: ['admin'], href: '/admin/orders',
    title: { en: `Title ${id}`, ar: 'عنوان' },
    body: { en: `Body ${id}`, ar: 'نص' },
    ...extra,
});

describe('WhatsNewHint — "New on this page"', () => {
    beforeEach(() => {
        window.localStorage.clear();
        pathname = '/admin/orders';
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-25T10:00:00+03:00'));
    });
    afterEach(() => vi.useRealTimers());

    it('shows a one-line strip on the page the note is about, and opens it in place', async () => {
        render(<WhatsNewHint entries={[note('cartons', '2026-09-22')]} />);
        expect(await screen.findByText('Title cartons')).toBeInTheDocument();
        expect(screen.queryByText('Body cartons')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /show me/i }));
        expect(screen.getByText('Body cartons')).toBeInTheDocument();
        // No "Try it" — it would point at the page already open.
        expect(screen.queryByRole('link', { name: /try it/i })).toBeNull();
    });

    it('stays away from other pages', async () => {
        pathname = '/admin/warehouse';
        const { container } = render(<WhatsNewHint entries={[note('cartons', '2026-09-22')]} />);
        await waitFor(() => expect(container).toBeEmptyDOMElement());
    });

    it('closes for good on this device', async () => {
        const { unmount } = render(<WhatsNewHint entries={[note('cartons', '2026-09-22')]} />);
        fireEvent.click(await screen.findByRole('button', { name: /don't show this again/i }));
        expect(screen.queryByText('Title cartons')).toBeNull();
        unmount();

        const again = render(<WhatsNewHint entries={[note('cartons', '2026-09-22')]} />);
        await waitFor(() => expect(again.container).toBeEmptyDOMElement());
    });
});

describe("WhatsNewList — the What's New page", () => {
    const entries = [
        note('cartons', '2026-09-22'),
        note('stock', '2026-09-19'),
        { ...note('boxes', '2026-09-19'), supersededBy: 'cartons' },
        note('push', '2026-08-10'),
    ];

    it('opens only the newest change; older ones are a title that opens on tap', () => {
        render(<WhatsNewList entries={entries} />);
        expect(screen.getByText('Body cartons')).toBeVisible();

        const stock = document.getElementById('stock') as HTMLDetailsElement;
        expect(stock.tagName).toBe('DETAILS');
        expect(stock.open).toBe(false);
        expect(screen.getByText('Title stock')).toBeInTheDocument();
        expect(screen.getByText('September 2026')).toBeInTheDocument();
        expect(screen.getByText('August 2026')).toBeInTheDocument();
    });

    it('keeps outdated notes behind one link at the bottom', () => {
        render(<WhatsNewList entries={entries} />);
        const older = screen.getByText(/older notes that have since changed \(1\)/i).closest('details') as HTMLDetailsElement;
        expect(older.open).toBe(false);
        expect(older).toContainElement(document.getElementById('boxes'));
    });
});
