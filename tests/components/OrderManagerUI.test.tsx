import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import OrderManagerUI from '@/components/OrderManagerUI';

vi.mock('@/actions/orders', () => ({
    createPurchaseOrder: vi.fn(async () => ({ success: true, orderId: 1 })),
    completePurchaseOrder: vi.fn(async () => ({ success: true })),
    cancelPurchaseOrder: vi.fn(async () => ({ success: true })),
    createQuickItem: vi.fn(async () => ({ success: true })),
}));

import { createPurchaseOrder, completePurchaseOrder } from '@/actions/orders';

const warehouses = [{ id: 1, name: 'Riyadh Central', isActive: true }] as any;
// `box` is Item.pieces_per_box and `packets` Item.packets_per_carton: the
// carton is box × packets, which is what ordering and receiving count in. The
// driver batch is deliberately different on one item (MOVENPICK: carton of
// 10, batch of 3) to prove ordering ignores it.
const item = (id: number, name: string, box: number | null, extra: object = {}) => ({
    id, name, sku: `000${id}`, category: 'Snacks', bulk_format: null, cost: 2, last_purchase_cost: 2,
    price_standard: 3, price_hospital: 3, price_hotel: 4,
    pieces_per_box: box, packets_per_carton: null, piece_size: null, piece_size_unit: null,
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
    // The reported item: "1 carton × 8 packets × 20 pieces = 160".
    item(6, 'SIPP GREEN', 20, { packets_per_carton: 8, last_purchase_cost: 0.31 }),
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
    await waitFor(() => expect(search()).toBeTruthy(), { timeout: 3000 });
};
const renderNewTab = async (completed: any[] = []) => {
    render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[]} completedOrders={completed} />);
    await openNewTab();
};
const search = () => document.querySelector('input[role="combobox"]') as HTMLInputElement;
const qtyOf = (id: number) => document.getElementById(`po-qty-${id}`) as HTMLInputElement;
const piecesOf = (id: number) => screen.getByTestId(`po-pieces-${id}`);
const add = async (query: string, id: number) => {
    fireEvent.change(search(), { target: { value: query } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    await waitFor(() => expect(qtyOf(id)).toBeTruthy());
};
const pickWarehouse = () => {
    fireEvent.click(screen.getByRole('button', { name: /choose destination warehouse/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Riyadh Central' }));
};

beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(createPurchaseOrder).mockClear();
});

describe('OrderManagerUI — drafting a purchase order', () => {
    // The request this exists for: 60 lines, every one opening at 1 piece.
    it('starts a new line at one carton, and at 1 piece when the item has no carton', async () => {
        await renderNewTab();
        await add('lays', 1);
        expect(qtyOf(1).value).toBe('1');
        expect(screen.getByRole('combobox', { name: /unit for lays classic/i })).toHaveValue('carton');
        expect(piecesOf(1)).toHaveTextContent('14 pcs');

        await add('gum', 3);
        expect(qtyOf(3).value).toBe('1');
        expect(screen.queryByRole('combobox', { name: /unit for loose gum/i })).toBeNull();
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

    it('orders in supplier cartons, not the driver batch', async () => {
        await renderNewTab();
        await add('movenpick', 5);
        expect(qtyOf(5).value).toBe('1');
        expect(piecesOf(5)).toHaveTextContent('10 pcs');
    });

    // The report, R-FPWZK: 1 carton × 8 packets × 20 pieces = 160.
    it('multiplies cartons of packets out to pieces', async () => {
        await renderNewTab();
        pickWarehouse();
        await add('sipp', 6);
        expect(piecesOf(6)).toHaveTextContent('160 pcs');

        fireEvent.change(qtyOf(6), { target: { value: '5' } });
        expect(piecesOf(6)).toHaveTextContent('800 pcs');

        fireEvent.click(screen.getByRole('button', { name: /submit order/i }));
        await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalledWith({
            warehouseId: 1,
            items: [{ itemId: 6, quantityRequested: 800 }],
        }));
    });

    // Cartons or pieces only: "packets" would be a second meaning beside the carton's size.
    it('can switch one line to pieces for an odd amount', async () => {
        await renderNewTab();
        await add('sipp', 6);
        const unit = screen.getByRole('combobox', { name: /unit for sipp green/i });
        expect(within(unit).getAllByRole('option').map(o => o.textContent)).toEqual(['carton', 'pc']);

        fireEvent.change(unit, { target: { value: 'piece' } });
        expect(qtyOf(6).value).toBe('160'); // 1 carton = 160 pieces
        fireEvent.change(qtyOf(6), { target: { value: '60' } });
        expect(qtyOf(6).value).toBe('60');
    });

    it('steps by one carton and will not drop a line below one', async () => {
        await renderNewTab();
        await add('lays', 1);

        expect(screen.getByRole('button', { name: /one carton less of lays/i })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /one carton more of lays/i }));
        expect(qtyOf(1).value).toBe('2');
        expect(piecesOf(1)).toHaveTextContent('28 pcs');
        fireEvent.click(screen.getByRole('button', { name: /one carton less of lays/i }));
        expect(qtyOf(1).value).toBe('1');
    });

    it('starts an item at what was ordered last time, and says so', async () => {
        await renderNewTab([lastOrder]);
        await add('lays', 1);
        expect(qtyOf(1).value).toBe('2'); // 28 last time = 2 cartons of 14
        expect(screen.getByText(/last time: 2 cartons/i)).toBeInTheDocument();
    });

    it('never offers a deactivated item', async () => {
        await renderNewTab();
        fireEvent.change(search(), { target: { value: 'retired' } });
        expect(screen.queryByText('RETIRED BAR')).not.toBeInTheDocument();
    });

    it('repeats the last order for the warehouse using requested quantities, minus retired items', async () => {
        await renderNewTab([lastOrder]);
        // Pick the warehouse: the repeat button is per-destination.
        pickWarehouse();

        fireEvent.click(await screen.findByRole('button', { name: /repeat last order/i }));
        await waitFor(() => expect(qtyOf(1).value).toBe('2')); // requested 28 = 2 cartons, only 14 arrived
        expect(qtyOf(4)).toBeNull();
    });

    it('keeps the draft when the warehouse changes and restores it after a reload', async () => {
        const { unmount } = render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[]} completedOrders={[]} />);
        await openNewTab();
        await add('lays', 1);
        fireEvent.change(qtyOf(1), { target: { value: '3' } });
        pickWarehouse();
        expect(qtyOf(1).value).toBe('3');
        await waitFor(() => expect(window.localStorage.getItem('vms:po-draft')).toContain('"itemId":1'));

        unmount();
        render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[]} completedOrders={[]} />);
        await waitFor(() => expect(qtyOf(1)?.value).toBe('3'));
    });

    it('submits the quantities shown, in pieces, and clears the saved draft', async () => {
        await renderNewTab();
        pickWarehouse();
        await add('aqua', 2);

        fireEvent.click(screen.getByRole('button', { name: /submit order/i }));
        await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalledWith({
            warehouseId: 1,
            items: [{ itemId: 2, quantityRequested: 40 }],
        }));
        await waitFor(() => expect(window.localStorage.getItem('vms:po-draft')).toBeNull());
    });
});

// The client: "we receive the stock in cartons, but it is dispatched by pieces —
// and whether he received a 24-piece carton or a 20-piece carton needs to be specified."
describe('OrderManagerUI — receiving a delivery in cartons', () => {
    const pendingOrder = {
        id: 77, warehouseId: 1, status: 'PENDING', createdAt: new Date('2026-09-18'), completedAt: null,
        warehouse: warehouses[0],
        Items: [
            // 1,000 ordered; cartons of 24 → opens as 41 cartons + 16 loose.
            { id: 501, itemId: 1, quantityRequested: 1000, quantityReceived: 0, costPerUnit: 2, boxesReceived: null, piecesPerBox: null,
              item: { ...items[0], pieces_per_box: 24, last_purchase_cost: 1.98, price_standard: 4 } },
            // No carton size saved: counted piece by piece.
            { id: 502, itemId: 3, quantityRequested: 30, quantityReceived: 0, costPerUnit: 0.5, boxesReceived: null, piecesPerBox: null,
              item: { ...items[2], last_purchase_cost: 0.5 } },
        ],
    } as any;
    // SIPP GREEN on PO 29: 1,000 = 6 cartons of 8 × 20 (960) + 40 loose pieces.
    const sippOrder = {
        ...pendingOrder, id: 29,
        Items: [{ id: 503, itemId: 6, quantityRequested: 1000, quantityReceived: 0, costPerUnit: 0.31, boxesReceived: null, piecesPerBox: null, item: items[5] }],
    } as any;

    const input = (id: string) => document.getElementById(id) as HTMLInputElement;

    const startReceipt = async (order = pendingOrder) => {
        render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[order]} completedOrders={[]} />);
        fireEvent.click(await screen.findByRole('button', { name: /start receipt/i }));
        await waitFor(() => expect(document.querySelector('[id^="rcv-price-"]')).toBeTruthy());
    };

    const confirm = async () => {
        fireEvent.click(screen.getByRole('button', { name: /complete & store check-in/i }));
        fireEvent.click(await screen.findByRole('button', { name: /confirm receipt/i }));
        await waitFor(() => expect(completePurchaseOrder).toHaveBeenCalled());
        return vi.mocked(completePurchaseOrder).mock.calls[0][1];
    };

    beforeEach(() => vi.mocked(completePurchaseOrder).mockClear());

    it('lists a pending order in cartons before it is received', () => {
        render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[pendingOrder]} completedOrders={[]} />);
        expect(screen.getByText('41 cartons + 16 pcs')).toBeInTheDocument();
        expect(screen.getByText('30 pcs')).toBeInTheDocument();
    });

    it('copies the order as a message for the supplier', async () => {
        const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
        Object.assign(navigator, { clipboard: { writeText } });
        render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[sippOrder]} completedOrders={[]} />);
        fireEvent.click(screen.getByRole('button', { name: /copy order/i }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        expect(writeText.mock.calls[0][0]).toContain('1. SIPP GREEN — 6 cartons + 40 pcs');
    });

    it("opens each line as the order, in the item's usual carton, with a price per carton", async () => {
        await startReceipt();
        expect(input('rcv-cartons-501').value).toBe('41');
        expect(input('rcv-pieces-501').value).toBe('16');
        expect(screen.getByTestId('rcv-total-501')).toHaveTextContent('1,000 pcs');
        expect(screen.getByText(/1 carton = 24 pcs/)).toBeInTheDocument();
        // 1.98 a piece × 24 = 47.52 a carton — what the invoice prints.
        expect(input('rcv-price-501').value).toBe('47.52');

        // An item with no carton is counted in pieces, with no carton field to confuse it.
        expect(screen.getByLabelText('Pieces', { selector: '#rcv-pieces-502' })).toBeTruthy();
        expect(input('rcv-cartons-502')).toBeNull();
    });

    // The admin's request, kept simple: cartons and loose pieces are the only
    // counts. Packets appear once, as the carton's size.
    it('receives a carton of packets as cartons + loose pieces', async () => {
        await startReceipt(sippOrder);
        expect(input('rcv-cartons-503').value).toBe('6');
        expect(input('rcv-pieces-503').value).toBe('40');
        expect(document.getElementById('rcv-packets-503')).toBeNull();
        expect(screen.getByText('1 carton = 8 packets × 20 = 160 pcs')).toBeInTheDocument();
        // 0.31 a piece × 160 = 49.60 a carton.
        expect(input('rcv-price-503').value).toBe('49.6');

        fireEvent.change(input('rcv-cartons-503'), { target: { value: '4' } });
        fireEvent.change(input('rcv-pieces-503'), { target: { value: '60' } });
        expect(screen.getByTestId('rcv-total-503')).toHaveTextContent('700 pcs');

        const payload = await confirm();
        expect(payload).toEqual([expect.objectContaining({
            purchaseOrderItemId: 503,
            quantityReceived: 700,
            costPerUnit: 0.31,
            boxesReceived: 32,        // the 4 × 8 packets inside the cartons
            piecesPerBox: 20,
            cartonsReceived: 4,
            packetsPerCarton: 8,
        })]);
    });

    it('records a 20-piece carton when that is what arrived, and stores pieces', async () => {
        await startReceipt();
        const row = input('rcv-cartons-501').closest('.rounded-xl') as HTMLElement;
        fireEvent.click(within(row).getByRole('button', { name: /different this time/i }));
        fireEvent.change(input('rcv-perpacket-501'), { target: { value: '20' } });
        fireEvent.change(input('rcv-cartons-501'), { target: { value: '10' } });
        fireEvent.change(input('rcv-pieces-501'), { target: { value: '0' } });
        fireEvent.change(input('rcv-price-501'), { target: { value: '40' } });

        expect(screen.getByTestId('rcv-total-501')).toHaveTextContent('200 pcs');
        expect(screen.getByText(/usually 1 carton = 24 pcs/i)).toBeInTheDocument();

        const payload = await confirm();
        expect(payload).toEqual(expect.arrayContaining([
            expect.objectContaining({
                purchaseOrderItemId: 501,
                quantityReceived: 200,     // stock moves in pieces
                costPerUnit: 2,            // 40.00 a carton ÷ 20
                boxesReceived: 10,
                piecesPerBox: 20,
                cartonsReceived: null,
                packetsPerCarton: null,
            }),
            expect.objectContaining({ purchaseOrderItemId: 502, quantityReceived: 30, costPerUnit: 0.5, boxesReceived: null, piecesPerBox: null }),
        ]));
    });

    it('keeps selling prices as one sentence until asked to change them', async () => {
        await startReceipt();
        expect(input('rcv-price_standard-501')).toBeNull();
        const row = input('rcv-cartons-501').closest('.rounded-xl') as HTMLElement;
        fireEvent.click(within(row).getByRole('button', { name: /change selling prices/i }));
        expect(input('rcv-price_standard-501').value).toBe('4');
    });

    // AQUAFINA in production: a carton price typed as the price of one bottle.
    it('warns when one piece would cost more than it sells for', async () => {
        await startReceipt();
        expect(screen.queryByRole('alert')).toBeNull();
        fireEvent.change(input('rcv-price-501'), { target: { value: '500' } });
        expect(await screen.findByRole('alert')).toHaveTextContent(/would cost .* but sells for/i);
    });

    it('restates cartons and pieces in the confirmation', async () => {
        await startReceipt();
        fireEvent.click(screen.getByRole('button', { name: /complete & store check-in/i }));
        expect(await screen.findByText(/checking in 1,030 pieces \(41 cartons\)/i)).toBeInTheDocument();
    });
});

describe('OrderManagerUI — order history', () => {
    it('flags an order that arrived short', async () => {
        render(<OrderManagerUI warehouses={warehouses} items={items} pendingOrders={[]} completedOrders={[lastOrder]} />);
        fireEvent.click(screen.getByRole('button', { name: /order history/i }));
        expect(await screen.findByText(/1 item arrived short/i)).toBeInTheDocument();
    });
});
