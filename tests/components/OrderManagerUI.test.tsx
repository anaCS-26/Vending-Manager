import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrderManagerUI from '@/components/OrderManagerUI';

vi.mock('@/actions/orders', () => ({
    createPurchaseOrder: vi.fn(async () => ({ success: true, orderId: 1 })),
    completePurchaseOrder: vi.fn(async () => ({ success: true })),
    cancelPurchaseOrder: vi.fn(async () => ({ success: true })),
    createQuickItem: vi.fn(async () => ({ success: true })),
}));

import { createPurchaseOrder, completePurchaseOrder } from '@/actions/orders';

const warehouses = [{ id: 1, name: 'Riyadh Central', isActive: true }] as any;
// `box` is the supplier box (Item.pieces_per_box), which is what ordering and
// receiving count in. The driver batch is deliberately different on one item
// (MOVENPICK: box of 10, batch of 3) to prove ordering ignores it.
const item = (id: number, name: string, box: number | null, extra: object = {}) => ({
    id, name, sku: `000${id}`, category: 'Snacks', bulk_format: null, cost: 2, last_purchase_cost: 2,
    price_standard: 3, price_hospital: 3, price_hotel: 4,
    pieces_per_box: box, piece_size: null, piece_size_unit: null,
    default_assignment_qty: box ?? 0, isActive: true,
    WarehouseStock: [{ warehouseId: 1, quantity_on_hand: 5, pending_deficit: 0 }],
    ...extra,
});
const items = [
    item(1, 'LAYS CLASSIC', 14),
    item(2, 'AQUAFINA WATER', 40),
    item(3, 'LOOSE GUM', null),
    item(4, 'RETIRED BAR', 12, { isActive: false }),
    item(5, 'MOVENPICK', 10, { default_assignment_qty: 3 }),
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
    it('starts a new line at one box, and at 1 when the item has no box', async () => {
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

    it('orders in supplier boxes, not the driver batch', async () => {
        await renderNewTab();
        fireEvent.change(search(), { target: { value: 'movenpick' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        await waitFor(() => expect(qtyOf(5).value).toBe('10'));
    });

    it('steps by whole boxes and will not drop a line below one box', async () => {
        await renderNewTab();
        fireEvent.change(search(), { target: { value: 'lays' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        await waitFor(() => expect(qtyOf(1)).toBeTruthy());

        expect(screen.getByRole('button', { name: /remove a box of 14/i })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /add a box of 14/i }));
        expect(qtyOf(1).value).toBe('28');
        expect(screen.getByText(/2 × box of 14/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /remove a box of 14/i }));
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

// The client: "we receive the stock in boxes, but it is dispatched by pieces —
// and whether he received a 24-piece box or a 20-piece box needs to be specified."
describe('OrderManagerUI — receiving a delivery in boxes', () => {
    const pendingOrder = {
        id: 77, warehouseId: 1, status: 'PENDING', createdAt: new Date('2026-09-18'), completedAt: null,
        warehouse: warehouses[0],
        Items: [
            // 1,000 ordered; boxes of 24 → opens as 41 boxes + 16 loose.
            { id: 501, itemId: 1, quantityRequested: 1000, quantityReceived: 0, costPerUnit: 2, boxesReceived: null, piecesPerBox: null,
              item: { ...items[0], pieces_per_box: 24, last_purchase_cost: 1.98, price_standard: 4 } },
            // No box size saved: counted piece by piece.
            { id: 502, itemId: 3, quantityRequested: 30, quantityReceived: 0, costPerUnit: 0.5, boxesReceived: null, piecesPerBox: null,
              item: { ...items[2], last_purchase_cost: 0.5 } },
        ],
    } as any;

    const input = (id: string) => document.getElementById(id) as HTMLInputElement;

    const startReceipt = async () => {
        render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[pendingOrder]} completedOrders={[]} />);
        fireEvent.click(await screen.findByRole('button', { name: /start receipt/i }));
        await waitFor(() => expect(input('rcv-boxes-501')).toBeTruthy());
    };

    const confirm = async () => {
        fireEvent.click(screen.getByRole('button', { name: /complete & store check-in/i }));
        fireEvent.click(await screen.findByRole('button', { name: /confirm receipt/i }));
        await waitFor(() => expect(completePurchaseOrder).toHaveBeenCalled());
        return vi.mocked(completePurchaseOrder).mock.calls[0][1];
    };

    beforeEach(() => vi.mocked(completePurchaseOrder).mockClear());

    it("opens each line as the order, in the item's usual box, with a price per box", async () => {
        await startReceipt();
        expect(input('rcv-boxes-501').value).toBe('41');
        expect(input('rcv-perbox-501').value).toBe('24');
        expect(input('rcv-loose-501').value).toBe('16');
        expect(screen.getByTestId('rcv-pieces-501')).toHaveTextContent('1,000 pcs');
        // 1.98 a piece × 24 = 47.52 a box — what the invoice prints.
        expect(input('rcv-price-501').value).toBe('47.52');

        // An item with no box is counted in pieces, with no loose field to confuse it.
        expect(screen.getByLabelText('Pieces', { selector: '#rcv-boxes-502' })).toBeTruthy();
        expect(input('rcv-loose-502')).toBeNull();
    });

    it('records a 20-piece box when that is what arrived, and stores pieces', async () => {
        await startReceipt();
        fireEvent.change(input('rcv-boxes-501'), { target: { value: '10' } });
        fireEvent.change(input('rcv-perbox-501'), { target: { value: '20' } });
        fireEvent.change(input('rcv-loose-501'), { target: { value: '0' } });
        fireEvent.change(input('rcv-price-501'), { target: { value: '40' } });

        expect(screen.getByTestId('rcv-pieces-501')).toHaveTextContent('200 pcs');
        expect(screen.getByText(/usually 24 per box/i)).toBeInTheDocument();

        const payload = await confirm();
        expect(payload).toEqual(expect.arrayContaining([
            expect.objectContaining({
                purchaseOrderItemId: 501,
                quantityReceived: 200,     // stock moves in pieces
                costPerUnit: 2,            // 40.00 a box ÷ 20
                boxesReceived: 10,
                piecesPerBox: 20,
            }),
            expect.objectContaining({ purchaseOrderItemId: 502, quantityReceived: 30, costPerUnit: 0.5, piecesPerBox: 1 }),
        ]));
    });

    // AQUAFINA in production: a box price typed as the price of one bottle.
    it('warns when one piece would cost more than it sells for', async () => {
        await startReceipt();
        expect(screen.queryByRole('alert')).toBeNull();
        fireEvent.change(input('rcv-perbox-501'), { target: { value: '1' } });
        expect(await screen.findByRole('alert')).toHaveTextContent(/would cost .* but sells for/i);
    });

    it('restates boxes and pieces in the confirmation', async () => {
        await startReceipt();
        fireEvent.click(screen.getByRole('button', { name: /complete & store check-in/i }));
        expect(await screen.findByText(/checking in 1,030 pieces \(41 boxes\)/i)).toBeInTheDocument();
    });
});
