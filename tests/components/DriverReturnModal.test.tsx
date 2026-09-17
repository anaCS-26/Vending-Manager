import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DriverReturnModal from '@/components/DriverReturnModal';

vi.mock('@/actions/driver-stock', () => ({
    returnDriverStockToWarehouse: vi.fn(async () => ({ success: true, data: { lines: 1, units: 5 } })),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));

import { returnDriverStockToWarehouse } from '@/actions/driver-stock';

const driver = { id: 10, name: 'Cheeto' };
const warehouses = [{ id: 1, name: 'Riyadh Central', isActive: true }] as any;
const bag = [
    { itemId: 1, quantity_on_hand: 10, item: { id: 1, name: 'KITKAT', sku: 'K-1' } },
    { itemId: 2, quantity_on_hand: 24, item: { id: 2, name: 'AQUAFINA WATER', sku: 'W-1' } },
];

const qtyBox = (name: string) => screen.getByLabelText(`Quantity of ${name} returned`) as HTMLInputElement;

beforeEach(() => {
    vi.mocked(returnDriverStockToWarehouse).mockClear();
    document.body.style.overflow = '';
});

describe('DriverReturnModal', () => {
    it('starts with every quantity empty — drinks stay in the van unless the admin says otherwise', () => {
        render(<DriverReturnModal isOpen onClose={vi.fn()} driver={driver} bag={bag} warehouses={warehouses} />);

        expect(qtyBox('KITKAT').value).toBe('');
        expect(qtyBox('AQUAFINA WATER').value).toBe('');
        expect(screen.getByRole('button', { name: /^Return to Warehouse$/i })).toBeDisabled();
    });

    it('sends only the lines the admin typed, and closes on success', async () => {
        const onClose = vi.fn();
        render(<DriverReturnModal isOpen onClose={onClose} driver={driver} bag={bag} warehouses={warehouses} />);

        fireEvent.change(qtyBox('KITKAT'), { target: { value: '5' } });
        expect(screen.getByText('5 of 10 stay in the bag')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Return to Warehouse$/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Yes, Return Them/i }));

        await waitFor(() => expect(returnDriverStockToWarehouse).toHaveBeenCalledTimes(1));
        // The water was left empty, so it is not in the payload at all.
        expect(returnDriverStockToWarehouse).toHaveBeenCalledWith(10, 1, [{ itemId: 1, quantity: 5 }]);
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('cannot return more than the bag holds', () => {
        render(<DriverReturnModal isOpen onClose={vi.fn()} driver={driver} bag={bag} warehouses={warehouses} />);
        fireEvent.change(qtyBox('KITKAT'), { target: { value: '99' } });
        expect(qtyBox('KITKAT').value).toBe('10');
    });

    it('"Fill everything" stages the whole bag, and a line can then be emptied again', async () => {
        render(<DriverReturnModal isOpen onClose={vi.fn()} driver={driver} bag={bag} warehouses={warehouses} />);

        fireEvent.click(screen.getByRole('button', { name: /Fill everything/i }));
        expect(qtyBox('KITKAT').value).toBe('10');
        expect(qtyBox('AQUAFINA WATER').value).toBe('24');

        fireEvent.change(qtyBox('AQUAFINA WATER'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /^Return to Warehouse$/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Yes, Return Them/i }));

        await waitFor(() =>
            expect(returnDriverStockToWarehouse).toHaveBeenCalledWith(10, 1, [{ itemId: 1, quantity: 10 }]),
        );
    });

    it('keeps the sheet open with the typed count when the server refuses', async () => {
        vi.mocked(returnDriverStockToWarehouse).mockResolvedValueOnce({ success: false, error: 'The bag changed' } as any);
        const onClose = vi.fn();
        render(<DriverReturnModal isOpen onClose={onClose} driver={driver} bag={bag} warehouses={warehouses} />);

        fireEvent.change(qtyBox('KITKAT'), { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: /^Return to Warehouse$/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Yes, Return Them/i }));

        await waitFor(() => expect(returnDriverStockToWarehouse).toHaveBeenCalled());
        expect(onClose).not.toHaveBeenCalled();
        expect(qtyBox('KITKAT').value).toBe('5');
    });

    // jsdom does not paint, so finding the confirm button proves nothing about
    // whether it is visible — see WarehouseAuditModal.test.tsx for the bug this pins.
    it('renders the confirm step above the return panel', async () => {
        render(<DriverReturnModal isOpen onClose={vi.fn()} driver={driver} bag={bag} warehouses={warehouses} />);
        fireEvent.change(qtyBox('KITKAT'), { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: /^Return to Warehouse$/i }));
        const confirmBtn = await screen.findByRole('button', { name: /Yes, Return Them/i });

        const layerZ = (from: Element | null): number => {
            for (let el = from; el; el = el.parentElement) {
                const match = el.className?.toString().match(/(?:^|\s)z-\[(\d+)\]/);
                if (match) return parseInt(match[1], 10);
            }
            throw new Error('no z-[N] utility found on ancestor chain');
        };

        expect(layerZ(confirmBtn)).toBeGreaterThan(layerZ(screen.getByRole('button', { name: /Close return to warehouse/i })));
    });
});
