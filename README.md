# 🚀 Adaptive Inventory Intelligence (AII)

**Adaptive Inventory Intelligence (AII)** is a sophisticated, real-time inventory and logistics management ecosystem. Originally designed for automated retail (vending), it architecture is built to leverage AI-driven insights for demand forecasting, route optimization, and autonomous inventory reconciliation.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: Prisma + D1/SQLite
- **UI/UX**: Framer Motion + Tailwind CSS
- **Runtime**: Node.js / Default Edge
- **Real-time**: Server-Sent Events (SSE) for driver-to-warehouse synchronization

---

## 📈 AI & ML Engineering Roadmap

While currently serving as a robust operational backbone, AII is designed for the following AI/ML integrations:

1.  **Demand Forecasting Engine**: Leveraging historical sales data (from `RefillLogs`) to predict item sell-out times per location.
2.  **Autonomous Reconciliation Agent**: Using anomaly detection on `DispatchItems` and `ReturnVerification` logs to identify shrinkage or reporting errors automatically.
3.  **Optimal Routing**: An upcoming module to calculate the most "value-per-mile" routes for drivers based on real-time machine stock levels.

---

## 📦 Features

- **Driver Management**: End-to-end dispatch-to-reconciliation workflows.
- **Machine Health Monitoring**: Real-time stock estimates vs. actual capacity.
- **Warehouse Synchronization**: Multi-location inventory tracking with strict transaction safety.
- **Asset Verification**: Robust damaged/expired item reporting and verification system.

---

## 🚀 Deployment

The project is optimized for local or standard VPS deployment.

```bash
# Production Build
npm run build
# Start Server
npm start
```

---

## 👨‍💻 Developer Note

This project serves as a demonstration of high-concurrency architecture, complex data relationships (Prisma), and the implementation of a scalable foundation for AI-augmented logistics.
