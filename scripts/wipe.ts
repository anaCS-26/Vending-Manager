import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Wiping database...");
    await prisma.refillLog.deleteMany();
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.dispatchItem.deleteMany();
    await prisma.returnVerification.deleteMany();
    await prisma.dispatch.deleteMany();
    await prisma.machineStock.deleteMany();
    await prisma.warehouseStock.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.item.deleteMany();
    await prisma.driver.deleteMany();
    await prisma.warehouse.deleteMany();

    console.log("Creating warehouses...");
    const wh1 = await prisma.warehouse.create({
        data: {
            name: "Dammam Central Warehouse",
            location: "Dammam",
            latitude: 26.4207,
            longitude: 50.115
        }
    });

    const wh2 = await prisma.warehouse.create({
        data: {
            name: "Khobar Secondary Hub",
            location: "Al Khobar",
            latitude: 26.2831,
            longitude: 50.208
        }
    });

    console.log("Creating drivers...");
    await prisma.driver.createMany({
        data: [
            { name: "Tariq Al-Faisal", phone: "0501234567" },
            { name: "Omar Hassan", phone: "0507654321" },
            { name: "Khalid Ali", phone: "0501112222" }
        ]
    });

    console.log("Creating items...");
    const baseItems = [
        { name: "Lays Classic", category: "Snacks", price: 2.50 },
        { name: "Pepsi Cola", category: "Beverages", price: 3.00 },
        { name: "Snickers Bar", category: "Snacks", price: 4.00 },
        { name: "Water Bottle", category: "Beverages", price: 1.00 },
        { name: "Charger Cable", category: "Electronics", price: 25.00 },
        { name: "Doritos Nacho", category: "Snacks", price: 2.50 },
        { name: "Seven Up", category: "Beverages", price: 3.00 },
        { name: "Galaxy Chocolate", category: "Snacks", price: 4.50 },
        { name: "Apple Juice", category: "Beverages", price: 3.50 },
        { name: "Power Bank", category: "Electronics", price: 50.00 },

        { name: "Pringles Original", category: "Snacks", price: 8.00 },
        { name: "Mountain Dew", category: "Beverages", price: 3.00 },
        { name: "Mars Bar", category: "Snacks", price: 4.00 },
        { name: "Sparkling Water", category: "Beverages", price: 4.00 },
        { name: "Earbuds", category: "Electronics", price: 35.00 },
        { name: "Cheetos Flamin", category: "Snacks", price: 3.00 },
        { name: "Coca Cola Zero", category: "Beverages", price: 3.00 },
        { name: "Twix Caramel", category: "Snacks", price: 4.00 },
        { name: "Orange Juice", category: "Beverages", price: 4.00 },
        { name: "USB Drive", category: "Electronics", price: 20.00 },
    ];

    for (let i = 0; i < 20; i++) {
        const itemObj = baseItems[i];
        const item = await prisma.item.create({
            data: {
                name: itemObj.name,
                sku: `PRD-${(i + 1).toString().padStart(3, '0')}`,
                category: itemObj.category,
                price: itemObj.price,
                bulk_format: itemObj.category === "Electronics" ? "Unit" : "Box of 24"
            }
        });

        await prisma.warehouseStock.createMany({
            data: [
                {
                    warehouseId: wh1.id,
                    itemId: item.id,
                    quantity_on_hand: Math.floor(Math.random() * 50) + 5 // Generate 5-54 stock
                },
                {
                    warehouseId: wh2.id,
                    itemId: item.id,
                    quantity_on_hand: Math.floor(Math.random() * 50) + 5 // Generate 5-54 stock
                }
            ]
        });
    }

    console.log("Creating machines...");
    const saudiLocations = [
        { name: "Dhahran Mall", lat: 26.2995, lng: 50.1583 },
        { name: "KFUPM Campus", lat: 26.3045, lng: 50.1481 },
        { name: "Alrashid Mall", lat: 26.2863, lng: 50.1857 },
        { name: "Khobar Corniche", lat: 26.3005, lng: 50.2223 },
        { name: "Dammam Corniche", lat: 26.4389, lng: 50.1118 },
        { name: "Sheraton Dammam", lat: 26.4363, lng: 50.1032 },
        { name: "King Fahad Park", lat: 26.3860, lng: 50.1340 },
        { name: "Aramco Camp", lat: 26.3151, lng: 50.1328 },
        { name: "Ithra Center", lat: 26.3355, lng: 50.1245 },
        { name: "Half Moon Beach", lat: 26.1585, lng: 50.0150 },
        { name: "Modon Industrial", lat: 26.2570, lng: 49.9270 },
        { name: "Jubail Industrial", lat: 27.0545, lng: 49.5630 }, // Very far apart to test zoom out
        { name: "Al Ahsa Mall", lat: 25.3370, lng: 49.5930 }, // Far south to test bounds
        { name: "Dammam UoD", lat: 26.3824, lng: 50.1865 },
        { name: "Khobar Hospital", lat: 26.2628, lng: 50.2104 }
    ];

    for (let i = 0; i < 15; i++) {
        const loc = saudiLocations[i];
        await prisma.machine.create({
            data: {
                terminalId: `SA-M-${(i + 1).toString().padStart(3, '0')}`,
                location_name: loc.name,
                district: "Eastern Province",
                latitude: loc.lat,
                longitude: loc.lng
            }
        });
    }

    console.log("Database seeded successfully.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
