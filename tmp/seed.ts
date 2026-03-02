import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Cleaning existing data...')

    // 1. Delete Child Records First (FK Constraints)
    await prisma.returnVerification.deleteMany({})
    await prisma.refillLog.deleteMany({})
    await prisma.dispatchItem.deleteMany({})
    await prisma.inventoryAdjustment.deleteMany({})
    await prisma.purchaseInvoiceItem.deleteMany({})
    await prisma.customerRefund.deleteMany({})

    // 2. Delete Intermediate Records
    await prisma.dispatch.deleteMany({})
    await prisma.purchaseInvoice.deleteMany({})
    await prisma.warehouseStock.deleteMany({})
    await prisma.machineStock.deleteMany({})

    // 3. Delete Parent Records
    await prisma.warehouse.deleteMany({})
    await prisma.item.deleteMany({})
    await prisma.machine.deleteMany({})
    await prisma.driver.deleteMany({})
    await prisma.supplier.deleteMany({})

    console.log('Seeding new data...')

    // 1. Create 5 Drivers
    const drivers = await Promise.all([
        prisma.driver.create({ data: { name: 'Ahmed Khan', phone: '0501234567', email: 'ahmed@vending.com' } }),
        prisma.driver.create({ data: { name: 'Sami Hassan', phone: '0502345678', email: 'sami@vending.com' } }),
        prisma.driver.create({ data: { name: 'Omar Malik', phone: '0503456789', email: 'omar@vending.com' } }),
        prisma.driver.create({ data: { name: 'Zaid Bakri', phone: '0504567890', email: 'zaid@vending.com' } }),
        prisma.driver.create({ data: { name: 'Yusuf Ali', phone: '0505678901', email: 'yusuf@vending.com' } }),
    ])
    console.log(`Created ${drivers.length} drivers.`)

    // 2. Create 2 Warehouses
    const warehouseA = await prisma.warehouse.create({
        data: {
            name: 'Main Hub - Riyadh',
            location: 'Central District',
            address: 'King Fahd Rd, Riyadh',
            latitude: 24.7136,
            longitude: 46.6753
        }
    })
    const warehouseB = await prisma.warehouse.create({
        data: {
            name: 'East Depot - Al Khobar',
            location: 'Eastern Province',
            address: 'Prince Turki St, Al Khobar',
            latitude: 26.2825,
            longitude: 50.2086
        }
    })
    console.log('Created 2 warehouses.')

    // 3. Create 20 unique items and assign 10 to each warehouse
    const itemNames = [
        { name: 'Pepsi 330ml', category: 'Soda', price: 2.5, sku: 'SKU-001', format: '30x1' },
        { name: 'Coca Cola 330ml', category: 'Soda', price: 2.5, sku: 'SKU-002', format: '30x1' },
        { name: 'Lays Classic 40g', category: 'Chips', price: 2.0, sku: 'SKU-003', format: '14x1' },
        { name: 'Lays Salt & Vinegar 40g', category: 'Chips', price: 2.0, sku: 'SKU-004', format: '14x1' },
        { name: 'KitKat 4-Finger', category: 'Candy', price: 3.5, sku: 'SKU-005', format: '24x1' },
        { name: 'Snickers 50g', category: 'Candy', price: 3.5, sku: 'SKU-006', format: '24x1' },
        { name: 'Aquafina 500ml', category: 'Water', price: 1.0, sku: 'SKU-007', format: '24x1' },
        { name: 'Arwa Water 500ml', category: 'Water', price: 1.0, sku: 'SKU-008', format: '24x1' },
        { name: 'Oreo Original 38g', category: 'Snacks', price: 2.0, sku: 'SKU-009', format: '12x1' },
        { name: '7-Up 330ml', category: 'Soda', price: 2.5, sku: 'SKU-010', format: '30x1' },
        { name: 'Cheetos Crunchy 45g', category: 'Chips', price: 2.0, sku: 'SKU-011', format: '14x1' },
        { name: 'Pringles Original 40g', category: 'Chips', price: 5.0, sku: 'SKU-012', format: '12x1' },
        { name: 'Galaxy Milk Chocolate', category: 'Candy', price: 4.0, sku: 'SKU-013', format: '24x1' },
        { name: 'Twix 50g', category: 'Candy', price: 3.5, sku: 'SKU-014', format: '24x1' },
        { name: 'Red Bull 250ml', category: 'Energy', price: 12.0, sku: 'SKU-015', format: '24x1' },
        { name: 'Mountain Dew 330ml', category: 'Soda', price: 2.5, sku: 'SKU-016', format: '30x1' },
        { name: 'Mars Bar 51g', category: 'Candy', price: 3.5, sku: 'SKU-017', format: '24x1' },
        { name: 'Mundies Cookies', category: 'Snacks', price: 2.5, sku: 'SKU-018', format: '12x1' },
        { name: 'Doritos Nacho 40g', category: 'Chips', price: 2.0, sku: 'SKU-019', format: '14x1' },
        { name: 'Nova Water 500ml', category: 'Water', price: 1.0, sku: 'SKU-020', format: '24x1' },
    ]

    const items = await Promise.all(itemNames.map(i =>
        prisma.item.create({
            data: { name: i.name, category: i.category, price: i.price, sku: i.sku, bulk_format: i.format }
        })
    ))

    // Seed Warehouse A with items 0-9
    await Promise.all(items.slice(0, 10).map(item =>
        prisma.warehouseStock.create({
            data: { warehouseId: warehouseA.id, itemId: item.id, quantity_on_hand: 500 }
        })
    ))

    // Seed Warehouse B with items 10-19
    await Promise.all(items.slice(10, 20).map(item =>
        prisma.warehouseStock.create({
            data: { warehouseId: warehouseB.id, itemId: item.id, quantity_on_hand: 500 }
        })
    ))
    console.log('Created 20 items and stocked 10 in each warehouse.')

    // 4. Create 20 Machine Locations
    const machineLocations = [
        { name: 'King Saud University - Bldg 4', dist: 'Diriyah', addr: 'KSU Campus, Riyadh', term: 'TERM-001', lat: 24.7233, lon: 46.6186 },
        { name: 'Riyadh Mall - Main Entrance', dist: 'Olaya', addr: 'Olaya St, Riyadh', term: 'TERM-002', lat: 24.7431, lon: 46.6666 },
        { name: 'King Khalid Airport - T3', dist: 'Airport', addr: 'KKIA, Riyadh', term: 'TERM-003', lat: 24.9576, lon: 46.6988 },
        { name: 'Digital City - Zone A', dist: 'Nakhil', addr: 'Prince Turki Rd, Riyadh', term: 'TERM-004', lat: 24.7397, lon: 46.6416 },
        { name: 'Al Rashid Mall - Food Court', dist: 'Khobar', addr: 'Firas bin Nadhir, Al Khobar', term: 'TERM-005', lat: 26.2941, lon: 50.1947 },
        { name: 'KAUST Library - G Floor', dist: 'Thuwal', addr: 'KAUST Campus, Jeddah', term: 'TERM-006', lat: 22.3095, lon: 39.1044 },
        { name: 'Aramco HQ - Gate 2', dist: 'Dhahran', addr: 'Dhahran Main Rd', term: 'TERM-007', lat: 26.3045, lon: 50.1481 },
        { name: 'Panorama Mall - Play Area', dist: 'Mathar', addr: 'Takhassusi St, Riyadh', term: 'TERM-008', lat: 24.6970, lon: 46.6680 },
        { name: 'Kingdom Centre - Lobby', dist: 'Olaya', addr: 'Olaya St, Riyadh', term: 'TERM-009', lat: 24.7114, lon: 46.6744 },
        { name: 'Al Faisaliah Office 1', dist: 'Olaya', addr: 'King Fahd Rd, Riyadh', term: 'TERM-010', lat: 24.6903, lon: 46.6853 },
        { name: 'Jeddah Waterfront - North', dist: 'Corniche', addr: 'Corniche Rd, Jeddah', term: 'TERM-011', lat: 21.5833, lon: 39.1083 },
        { name: 'Medina Train Station', dist: 'Medina', addr: 'King Abdulaziz Rd', term: 'TERM-012', lat: 24.4589, lon: 39.6355 },
        { name: 'Dammam Port - Waiting Room', dist: 'Dammam', addr: 'King Faisal Rd', term: 'TERM-013', lat: 26.4444, lon: 50.1333 },
        { name: 'Riyadh Park - Cinema Hall', dist: 'Aqeeq', addr: 'Northern Ring Rd', term: 'TERM-014', lat: 24.7571, lon: 46.6291 },
        { name: 'Sabic HQ - Reception', dist: 'Granada', addr: 'Airport Rd, Riyadh', term: 'TERM-015', lat: 24.7953, lon: 46.7336 },
        { name: 'Sky Tower Rooftop', dist: 'Olaya', addr: 'King Fahd Rd', term: 'TERM-016', lat: 24.7161, lon: 46.6711 },
        { name: 'Hospital Specialist Mall', dist: 'Sulaimaniyah', addr: 'Takhassusi St', term: 'TERM-017', lat: 24.6736, lon: 46.6781 },
        { name: 'Green Plaza - P2', dist: 'Rawdah', addr: 'Rawdah St, Riyadh', term: 'TERM-018', lat: 24.7214, lon: 46.7606 },
        { name: 'Metro Station - Olaya Line', dist: 'Olaya', addr: 'Olaya Station', term: 'TERM-019', lat: 24.7086, lon: 46.6833 },
        { name: 'Vending Lab HQ', dist: 'Mughrizat', addr: 'Lab St, Riyadh', term: 'TERM-020', lat: 24.7675, lon: 46.7119 },
    ]

    await Promise.all(machineLocations.map(m =>
        prisma.machine.create({
            data: {
                location_name: m.name,
                district: m.dist,
                address: m.addr,
                terminalId: m.term,
                latitude: m.lat,
                longitude: m.lon,
                locationRent: 500,
                adminExpenses: 150
            }
        })
    ))
    console.log(`Created ${machineLocations.length} machine locations.`)

    console.log('Seeding completed successfully!')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
