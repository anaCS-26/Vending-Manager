import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import WarehouseInventoryTable, { deriveWarehouseRow, sortWarehouseRows } from '@/components/WarehouseInventoryTable';
import MachineInventoryTable, { deriveMachineRow, sortMachineRows } from '@/components/MachineInventoryTable';
import { itemDetailLine, showCategory } from '@/components/StockTableBits';

// The calibration modals are exercised in their own tests; here they are inert.
vi.mock('@/components/WarehouseAuditModal', () => ({ default: () => null }));
vi.mock('@/components/MachineAuditModal', () => ({ default: () => null }));
vi.mock('@/components/CostCorrectionModal', () => ({ default: () => null }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));

const item = (over: Record<string, unknown> = {}) => ({
    id: 1, name: 'Cola', sku: '0001', category: 'Uncategorized', bulk_format: '24*330ML',
    cost: 1.5, price_standard: 3, price_hospital: 3, price_hotel: 4,
    pieces_per_box: 24, packets_per_carton: null, piece_size: 330, piece_size_unit: 'ml',
    ...over,
});

const wh = (id: number, name: string) => ({ id, name }) as any;

const wRow = (over: Record<string, unknown> = {}, itemOver: Record<string, unknown> = {}) => ({
    id: 1, warehouseId: 1, itemId: 1, quantity_on_hand: 50, pending_deficit: 0,
    item: item(itemOver), warehouse: wh(1, 'Riyadh Central'),
    ...over,
}) as any;

const mRow = (over: Record<string, unknown> = {}, itemOver: Record<string, unknown> = {}) => ({
    id: 1, machineId: 1, itemId: 1, estimated_stock: 10, last_refilled_at: new Date('2026-09-01T08:00:00Z'),
    item: item(itemOver), machine: { id: 1, location_name: 'Hilton Hotel - Gym' },
    ...over,
}) as any;

describe('StockTableBits', () => {
    it('hides the seed default category but keeps a real one', () => {
        expect(showCategory('Uncategorized')).toBeNull();
        expect(showCategory('UNCATEGORIZED')).toBeNull();
        expect(showCategory('')).toBeNull();
        expect(showCategory('Snack')).toBe('Snack');
    });

    it('detail line is packaging then category, only what is set', () => {
        expect(itemDetailLine(item())).toBe('Carton of 24 × 330 ml');
        expect(itemDetailLine(item({ category: 'Snack' }))).toBe('Carton of 24 × 330 ml · Snack');
        // No structured packaging: fall back to the raw bulk format string.
        expect(itemDetailLine(item({ pieces_per_box: null, piece_size: null, piece_size_unit: null }))).toBe('24*330ML');
        expect(itemDetailLine(item({ pieces_per_box: null, piece_size: null, piece_size_unit: null, bulk_format: null }))).toBeNull();
    });
});

describe('deriveWarehouseRow', () => {
    it('folds owed stock, cartons and tier prices into one shape', () => {
        const r = deriveWarehouseRow(wRow({ quantity_on_hand: 50, pending_deficit: 24 }));
        expect(r).toMatchObject({ qty: 50, isZero: false, owed: 24, cost: 1.5, price: 3, value: 75, location: 'Riyadh Central' });
        expect(r.inCartons).toBe('2 cartons + 2 pcs');
        // Hotel differs from standard, so the tier line shows.
        expect(r.tierPrices).toEqual({ hospital: 3, hotel: 4 });
    });

    // SIPP GREEN in production: a carton of 8 packets of 20.
    it('counts a carton of packets as cartons, then packets, then pieces', () => {
        const r = deriveWarehouseRow(wRow({ quantity_on_hand: 3384 }, { pieces_per_box: 20, packets_per_carton: 8 }));
        expect(r.inCartons).toBe('21 cartons + 1 packet + 4 pcs');
        expect(itemDetailLine(item({ pieces_per_box: 20, packets_per_carton: 8, piece_size: 5, piece_size_unit: 'g' }))).toBe('Carton of 8 packets × 20 × 5 g');
    });

    it('drops the tier line when every tier equals the standard price', () => {
        const r = deriveWarehouseRow(wRow({}, { price_hospital: 3, price_hotel: 3 }));
        expect(r.tierPrices).toBeNull();
    });

    it('an empty row has no carton breakdown', () => {
        const r = deriveWarehouseRow(wRow({ quantity_on_hand: 0 }));
        expect(r.isZero).toBe(true);
        expect(r.inCartons).toBeNull();
        expect(r.value).toBe(0);
    });
});

describe('sortWarehouseRows / sortMachineRows', () => {
    const a = wRow({ id: 1, quantity_on_hand: 5 }, { name: 'B', cost: 2 });
    const b = wRow({ id: 2, quantity_on_hand: 50 }, { name: 'A', cost: 1 });

    it('returns the input order when no key is chosen', () => {
        expect(sortWarehouseRows([a, b], { key: null, direction: 'desc' })).toEqual([a, b]);
    });

    it('sorts by name asc and by stock value desc without mutating the input', () => {
        const input = [a, b];
        expect(sortWarehouseRows(input, { key: 'name', direction: 'asc' }).map((r) => r.item.name)).toEqual(['A', 'B']);
        // value: a = 10, b = 50
        expect(sortWarehouseRows(input, { key: 'total_amount', direction: 'desc' }).map((r) => r.id)).toEqual([2, 1]);
        expect(input.map((r) => r.id)).toEqual([1, 2]);
    });

    it('sorts machine rows by last refill', () => {
        const older = mRow({ id: 1, last_refilled_at: new Date('2026-08-01T00:00:00Z') });
        const newer = mRow({ id: 2, last_refilled_at: new Date('2026-09-01T00:00:00Z') });
        expect(sortMachineRows([older, newer], { key: 'last_refilled_at', direction: 'desc' }).map((r) => r.id)).toEqual([2, 1]);
    });
});

describe('deriveMachineRow', () => {
    it('grades the level: empty, low, ok', () => {
        expect(deriveMachineRow(mRow({ estimated_stock: 0 })).level).toBe('empty');
        expect(deriveMachineRow(mRow({ estimated_stock: 4 })).level).toBe('low');
        expect(deriveMachineRow(mRow({ estimated_stock: 5 })).level).toBe('ok');
    });
});

describe('WarehouseInventoryTable', () => {
    it('renders each item once per view, without the "Uncategorized" label, and shows owed stock inline', () => {
        render(
            <WarehouseInventoryTable
                inventory={[wRow({ pending_deficit: 24 })]}
                warehouses={[wh(1, 'Riyadh Central')]}
                existingItems={[]}
            />,
        );
        // Table row + phone card both render (CSS decides which is visible).
        expect(screen.getAllByText('Cola')).toHaveLength(2);
        expect(screen.queryByText(/uncategorized/i)).toBeNull();
        expect(screen.getByText('+24 owed by supplier')).toBeInTheDocument();
    });

    it('with a single warehouse there is no location filter and no Location column', () => {
        render(<WarehouseInventoryTable inventory={[wRow()]} warehouses={[wh(1, 'Riyadh Central')]} existingItems={[]} />);
        expect(screen.queryByRole('combobox', { name: 'Location' })).toBeNull();
        expect(screen.queryByRole('columnheader', { name: /location/i })).toBeNull();
    });

    it('with two warehouses the Location column appears until one is picked', () => {
        render(
            <WarehouseInventoryTable
                inventory={[wRow(), wRow({ id: 2, warehouseId: 2, warehouse: wh(2, 'Jeddah') })]}
                warehouses={[wh(1, 'Riyadh Central'), wh(2, 'Jeddah')]}
                existingItems={[]}
            />,
        );
        expect(screen.getByRole('columnheader', { name: /location/i })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox', { name: 'Location' }), { target: { value: '2' } });
        expect(screen.queryByRole('columnheader', { name: /location/i })).toBeNull();
        expect(screen.getAllByRole('row')).toHaveLength(2); // header + Jeddah row
    });

    it('column headers sort, and the direction toggles on a second click', () => {
        render(
            <WarehouseInventoryTable
                inventory={[wRow({ id: 1, quantity_on_hand: 5 }, { name: 'Low' }), wRow({ id: 2, quantity_on_hand: 500 }, { name: 'High' })]}
                warehouses={[wh(1, 'Riyadh Central')]}
                existingItems={[]}
            />,
        );
        const header = screen.getByRole('columnheader', { name: /in stock/i });
        const names = () => within(screen.getByRole('table')).getAllByText(/^(Low|High)$/).map((e) => e.textContent);
        fireEvent.click(within(header).getByRole('button'));
        expect(header).toHaveAttribute('aria-sort', 'descending');
        expect(names()).toEqual(['High', 'Low']);
        fireEvent.click(within(header).getByRole('button'));
        expect(header).toHaveAttribute('aria-sort', 'ascending');
        expect(names()).toEqual(['Low', 'High']);
    });
});

describe('MachineInventoryTable', () => {
    it('flags low and empty rows in words, and drops the Location column once a machine is picked', () => {
        const machines = [{ id: 1, location_name: 'Hilton Hotel - Gym' }, { id: 2, location_name: 'Tech Park' }] as any;
        render(
            <MachineInventoryTable
                inventory={[mRow({ estimated_stock: 0 }), mRow({ id: 2, itemId: 2, estimated_stock: 2, item: item({ id: 2, name: 'Chips', sku: '0002' }) })]}
                machines={machines}
            />,
        );
        expect(screen.getAllByText('Empty').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Running low').length).toBeGreaterThan(0);
        expect(screen.getByRole('columnheader', { name: /location/i })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox', { name: 'Machine' }), { target: { value: '1' } });
        expect(screen.queryByRole('columnheader', { name: /location/i })).toBeNull();
    });
});
