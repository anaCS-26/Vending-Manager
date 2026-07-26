import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WarehouseAuditModal from '@/components/WarehouseAuditModal';

vi.mock('@/actions/inventory', () => ({
    calibrateWarehouseStock: vi.fn(async () => ({ success: true })),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));

import { calibrateWarehouseStock } from '@/actions/inventory';

const warehouses = [{ id: 1, name: 'Riyadh Central' }] as any;
const inventory = [
    {
        id: 1, warehouseId: 1, itemId: 1, quantity_on_hand: 10, pending_deficit: 0,
        item: { id: 1, name: 'Cola', sku: 'C-1', cost: 2 },
        warehouse: { id: 1, name: 'Riyadh Central' },
    },
] as any;

beforeEach(() => {
    vi.mocked(calibrateWarehouseStock).mockClear();
    document.body.style.overflow = '';
});

describe('WarehouseAuditModal full flow', () => {
    it('opens, selects a warehouse, records a count, and submits', async () => {
        const onClose = vi.fn();
        render(
            <WarehouseAuditModal isOpen onClose={onClose} inventory={inventory} warehouses={warehouses} />,
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();

        // Pick the warehouse (rows only appear once one is selected).
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: '1' } });
        expect(await screen.findByText('Cola')).toBeInTheDocument();

        // Enter a physical count that differs from the 10 on hand.
        const countInput = screen
            .getAllByRole('textbox')
            .find((el) => (el as HTMLInputElement).value === '10') as HTMLInputElement;
        expect(countInput).toBeTruthy();
        fireEvent.change(countInput, { target: { value: '7' } });

        // Apply -> confirm dialog -> confirm.
        fireEvent.click(screen.getByRole('button', { name: /Apply Calibration/i }));
        const confirmBtn = await screen.findByRole('button', { name: /Yes, Apply Calibration/i });
        fireEvent.click(confirmBtn);

        await waitFor(() => expect(calibrateWarehouseStock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    /**
     * Regression: the confirm step used to render at z-[999] while this modal sits
     * at z-[9999]. Both are position:fixed siblings under the same portal wrapper
     * (a static div, so no stacking context of its own), which meant the confirm
     * dialog painted *behind* this modal's opaque panel — clicking "Apply
     * Calibration" produced no visible change whatsoever.
     *
     * jsdom does not paint, so the flow test above passes either way. Assert the
     * ordering invariant numerically instead.
     */
    it('renders the confirm step above the calibration panel', async () => {
        render(
            <WarehouseAuditModal isOpen onClose={vi.fn()} inventory={inventory} warehouses={warehouses} />,
        );

        fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
        const countInput = screen
            .getAllByRole('textbox')
            .find((el) => (el as HTMLInputElement).value === '10') as HTMLInputElement;
        fireEvent.change(countInput, { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: /Apply Calibration/i }));

        const confirmBtn = await screen.findByRole('button', { name: /Yes, Apply Calibration/i });

        // Walk up to the nearest ancestor declaring a stacking level. Tailwind is
        // not compiled under jsdom, so getComputedStyle().zIndex is always 'auto' —
        // read the authored `z-[N]` utility off the class list instead.
        const layerZ = (from: Element | null): number => {
            for (let el = from; el; el = el.parentElement) {
                const match = el.className?.toString().match(/(?:^|\s)z-\[(\d+)\]/);
                if (match) return parseInt(match[1], 10);
            }
            throw new Error('no z-[N] utility found on ancestor chain');
        };

        const confirmZ = layerZ(confirmBtn);
        const panelZ = layerZ(screen.getByRole('button', { name: /Close calibration/i }));

        expect(confirmZ).toBeGreaterThan(panelZ);
    });
});
