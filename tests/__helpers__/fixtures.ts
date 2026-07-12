/**
 * Lightweight fixture factories. Override any field via the `overrides` arg —
 * everything else gets a sensible default so individual tests stay short.
 */

export function makeItem(overrides: Partial<any> = {}) {
  return {
    id: 1,
    name: 'Cola',
    sku: 'COLA-330',
    category: 'BEVERAGE',
    price_standard: 5,
    price_hospital: 6,
    price_hotel: 8,
    cost: 3,
    last_purchase_cost: 3,
    bulk_format: null,
    isActive: true,
    imageUrl: null,
    ...overrides,
  };
}

export function makeMachine(overrides: Partial<any> = {}) {
  return {
    id: 100,
    location_name: 'Main Lobby',
    district: 'Olaya',
    address: 'King Fahd Rd',
    notes: null,
    terminalId: 'T-100',
    latitude: 24.7,
    longitude: 46.7,
    operating_cost: 0,
    rental_cost: 0,
    tier: 'STANDARD',
    isActive: true,
    ...overrides,
  };
}

export function makeWarehouse(overrides: Partial<any> = {}) {
  return {
    id: 1,
    name: 'Central Warehouse',
    location: 'Riyadh',
    isActive: true,
    ...overrides,
  };
}

export function makeWarehouseStock(overrides: Partial<any> = {}) {
  return {
    id: 1,
    warehouseId: 1,
    itemId: 1,
    quantity_on_hand: 100,
    pending_deficit: 0,
    ...overrides,
  };
}

export function makeDriverStock(overrides: Partial<any> = {}) {
  return {
    id: 1,
    driverId: 10,
    itemId: 1,
    quantity_on_hand: 50,
    ...overrides,
  };
}

export function makeStockAssignment(overrides: Partial<any> = {}) {
  return {
    id: 1,
    driverId: 10,
    itemId: 1,
    warehouseId: 1,
    quantity: 20,
    cost_at_assignment: 3,
    notes: null,
    assigned_by: 1,
    assigned_at: new Date('2026-05-01T08:00:00Z'),
    acknowledged_at: null,
    acknowledged_qty: null,
    status: 'PENDING_ACK',
    ...overrides,
  };
}

export function makeReturnVerification(overrides: Partial<any> = {}) {
  return {
    id: 1,
    dispatchId: null,
    driverId: 10,
    machineId: null,
    itemId: 1,
    quantity: 5,
    reason: 'SURPLUS',
    status: 'PENDING',
    notes: null,
    reported_at: new Date('2026-05-01T09:00:00Z'),
    verified_at: null,
    ...overrides,
  };
}

export function makeRefillLog(overrides: Partial<any> = {}) {
  return {
    id: 1,
    dispatchId: null,
    driverId: 10,
    machineId: 100,
    itemId: 1,
    quantity_refilled: 10,
    items_sold_since_last_refill: 10,
    sales_revenue: 50,
    price_at_refill: 5,
    cost_at_refill: 3,
    damaged_quantity: 0,
    expired_quantity: 0,
    refilled_at: new Date('2026-05-01T10:00:00Z'),
    ...overrides,
  };
}

export function makeDriver(overrides: Partial<any> = {}) {
  return {
    id: 10,
    name: 'Ali',
    phone: '0500000000',
    email: null,
    pin: '$2a$10$test.bcrypt.hash.placeholder',
    isActive: true,
    ...overrides,
  };
}

export function makeDispatch(overrides: Partial<any> = {}) {
  return {
    id: 500,
    driverId: 10,
    warehouseId: 1,
    status: 'OPEN',
    dispatch_date: new Date('2026-05-01T07:00:00Z'),
    ...overrides,
  };
}

export function makeDispatchItem(overrides: Partial<any> = {}) {
  return {
    id: 1,
    dispatchId: 500,
    itemId: 1,
    quantity_given: 50,
    quantity_returned: 0,
    quantity_damaged: 0,
    price_at_dispatch: 5,
    ...overrides,
  };
}

export function makeDispatchTemplateItem(overrides: Partial<any> = {}) {
  return {
    id: 1,
    templateId: 700,
    itemId: 1,
    quantity: 30,
    item: makeItem(),
    ...overrides,
  };
}

export function makeDispatchTemplate(overrides: Partial<any> = {}) {
  return {
    id: 700,
    name: 'Morning Route A',
    createdAt: new Date('2026-07-01T06:00:00Z'),
    updatedAt: new Date('2026-07-01T06:00:00Z'),
    Items: [makeDispatchTemplateItem()],
    ...overrides,
  };
}
