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
});
