# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- Fixed an issue in the driver portal where drivers could not return items from a machine if they started the dispatch with 0 of that item. The validation logic now properly distinguishes between refilling (which requires assigned stock) and returning (which does not).

### Changed
- Standardized all UI timestamps to Saudi Arabia timezone (Asia/Riyadh) using new utility functions `formatSaudiDate` and `formatSaudiTime`. Affected components include `UnifiedHistoryManager`, `OrderManagerUI`, `ReturnsManager`, `MachineInventoryTable`, `AnalyticsDashboardClient`, `FinancialsPage`, `SuperAdminsDashboard`, and `DispatchManager` and `HistoryList`. This ensures a consistent, location-aware time display for the Saudi administrative team regardless of their physical location.
