# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Standardized all UI timestamps to Saudi Arabia timezone (Asia/Riyadh) using new utility functions `formatSaudiDate` and `formatSaudiTime`. Affected components include `UnifiedHistoryManager`, `OrderManagerUI`, `ReturnsManager`, `MachineInventoryTable`, `AnalyticsDashboardClient`, `FinancialsPage`, `SuperAdminsDashboard`, and `DispatchManager` and `HistoryList`. This ensures a consistent, location-aware time display for the Saudi administrative team regardless of their physical location.
