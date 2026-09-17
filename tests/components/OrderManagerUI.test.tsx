import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrderManagerUI from '@/components/OrderManagerUI';

vi.mock('@/actions/orders', () => ({
    createPurchaseOrder: vi.fn(async () => ({ success: true, orderId: 1 })),
    completePurchaseOrder: vi.fn(async () => ({ success: true })),
    cancelPurchaseOrder: vi.fn(async () => ({ success: true })),
    createQuickItem: vi.fn(async () => ({ success: true })),
}));

import { createPurchaseOrder } from '@/actions/orders';

const warehouses = [{ id: 1, name: 'Riyadh Central', isActive: true }] as any;
const item = (id: number, name: string, batch: number, extra: object = {}) => ({
    id, name, sku: `000${id}`, category: 'Snacks', bulk_format: null, cost: 2, price_standard: 3,
    default_assignment_qty: batch, isActive: true,
    WarehouseStock: [{ warehouseId: 1, quantity_on_hand: 5, pending_deficit: 0 }],
    ...extra,
});
const items = [
    item(1, 'LAYS CLASSIC', 14),
    item(2, 'AQUAFINA WATER', 40),
    item(3, 'LOOSE GUM', 0),
    item(4, 'RETIRED BAR', 12, { isActive: false }),
] as any;

const lastOrder = {
    id: 42, warehouseId: 1, status: 'COMPLETED', createdAt: new Date('2026-09-01'), completedAt: new Date('2026-09-02'),
    warehouse: warehouses[0],
    Items: [
        { id: 1, itemId: 1, quantityRequested: 28, quantityReceived: 14, costPerUnit: 2, item: items[0] },
        { id: 2, itemId: 4, quantityRequested: 12, quantityReceived: 12, costPerUnit: 2, item: items[3] },
    ],
} as any;

// The tabs cross-fade through AnimatePresence, so the form mounts a tick later.
const openNewTab = async () => {
    fireEvent.click(screen.getByRole('button', { name: /create order/i }));
    await screen.findByRole('combobox', {}, { timeout: 3000 });
};
const renderNewTab = async (completed: any[] = []) => {
    render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[]} completedOrders={completed} />);
    await openNewTab();
};
const search = () => screen.getByRole('combobox') as HTMLInputElement;
const qtyOf = (id: number) => document.getElementById(`po-qty-${id}`) as HTMLInputElement;

beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(createPurchaseOrder).mockClear();
});

describe('OrderManagerUI — drafting a purchase order', () => {
    // The request this exists for: 60 lines, every one opening at 1.
    it('starts a new line at the item case pack, and at 1 when it has none', async () => {
        await renderNewTab();
        fireEvent.change(search(), { target: { value: 'lays' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        await waitFor(() => expect(qtyOf(1).value).toBe('14'));

        fireEvent.change(search(), { target: { value: 'gum' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        await waitFor(() => expect(qtyOf(3).value).toBe('1'));
    });

    it('is keyboard-only: Enter adds and lands in the quantity, Enter again returns to search', async () => {
        await renderNewTab();
        search().focus();
        fireEvent.change(search(), { target: { value: 'aqua' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        await waitFor(() => expect(document.activeElement).toBe(qtyOf(2)));
        expect(search().value).toBe('');

        fireEvent.keyDown(qtyOf(2), { key: 'Enter' });
        expect(document.activeElement).toBe(search());
    });

    it('steps by whole cases and will not drop a line below one case', async () => {
        await renderNewTab();
        fireEvent.change(search(), { target: { value: 'lays' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        await waitFor(() => expect(qtyOf(1)).toBeTruthy());

        expect(screen.getByRole('button', { name: /remove a case of 14/i })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /add a case of 14/i }));
        expect(qtyOf(1).value).toBe('28');
        expect(screen.getByText(/2 × case of 14/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /remove a case of 14/i }));
        expect(qtyOf(1).value).toBe('14');
    });

    it('never offers a deactivated item', async () => {
        await renderNewTab();
        fireEvent.change(search(), { target: { value: 'retired' } });
        expect(screen.queryByText('RETIRED BAR')).not.toBeInTheDocument();
    });

    it('repeats the last order for the warehouse using requested quantities, minus retired items', async () => {
        await renderNewTab([lastOrder]);
        // Pick the warehouse: the repeat button is per-destination.
        fireEvent.click(screen.getByRole('button', { name: /choose destination warehouse/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Riyadh Central' }));

        fireEvent.click(await screen.findByRole('button', { name: /repeat last order/i }));
        await waitFor(() => expect(qtyOf(1).value).toBe('28')); // requested 28, only 14 arrived
        expect(qtyOf(4)).toBeNull();
    });

    it('keeps the draft when the warehouse changes and restores it after a reload', async () => {
        const { unmount } = render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[]} completedOrders={[]} />);
        await openNewTab();
        fireEvent.change(search(), { target: { value: 'lays' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        await waitFor(() => expect(qtyOf(1)).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /choose destination warehouse/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Riyadh Central' }));
        expect(qtyOf(1).value).toBe('14');
        await waitFor(() => expect(window.localStorage.getItem('vms:po-draft')).toContain('"itemId":1'));

        unmount();
        render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[]} completedOrders={[]} />);
        await waitFor(() => expect(qtyOf(1)?.value).toBe('14'));
    });

    it('submits the quantities shown and clears the saved draft', async () => {
        await renderNewTab();
        fireEvent.click(screen.getByRole('button', { name: /choose destination warehouse/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Riyadh Central' }));
        fireEvent.change(search(), { target: { value: 'aqua' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        await waitFor(() => expect(qtyOf(2)).toBeTruthy());

        fireEvent.click(screen.getByRole('button', { name: /submit order/i }));
        await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalledWith({
            warehouseId: 1,
            items: [{ itemId: 2, quantityRequested: 40 }],
        }));
        await waitFor(() => expect(window.localStorage.getItem('vms:po-draft')).toBeNull());
    });
});
