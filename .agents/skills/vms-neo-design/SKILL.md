---
name: vms-neo-design
description: Enforces the Neo-Glassmorphism aesthetic and Slate-based color palette for the vending manager UI.
---

# VMS Design System: Neo-Glassmorphism

NexGen Vending uses a custom "Neo" aesthetic characterized by glassmorphism, vibrant professional accents, and high-contrast accessibility.

## 🎨 Design Tokens (from globals.css)

### Core Utilities:
- **`.glass-panel`**: The standard container for all cards and sections. Provides backdrop-blur and borders.
- **`.glass-panel-hover`**: Adds transition effects and subtle border changes on hover.

### Color Tokens:
- **`neo-bg`**: The primary application background.
- **`neo-surface`**: The semi-transparent card background.
- **`neo-border`**: The standard subtle border for glass panels.

### Accent Accents:
- **`accent-blue`** (#3b82f6) - Primary actions.
- **`accent-purple`** (#6366f1) - Analytics / Secondary.
- **`accent-pink`** (#f43f5e) - Alerts / Warnings.
- **`accent-green`** (#10b981) - Success / High Stock.
- **`accent-orange`** (#f97316) - Low Stock / Urgency.

## 📐 Implementation Checklist
1.  [ ] **Use Semantic Classes**: Prefer `.glass-panel` over manual `bg-zinc-900/50 backdrop-blur`.
2.  [ ] **Dark/Light Support**: Always test components in both modes. Utilities are pre-configured in `globals.css`.
3.  [ ] **Typography**: Use standard weights (`font-medium` for headers, `text-sm` for secondary metadata).
4.  [ ] **Iconography**: Use consistent stroke widths when using icons (e.g., Lucide React).

## ✅ Correct Card Example:
```tsx
<div className="glass-panel glass-panel-hover p-4 rounded-xl">
    <h3 className="text-lg font-semibold text-accent-blue">Active Stock</h3>
    <p className="text-sm text-foreground/70">Metrics for terminal 4A</p>
</div>
```

## ❌ Avoid:
- Plain `bg-white` or `bg-slate-900`.
- Heavy shadows (`shadow-2xl` manually instead of using utility).
- Generic Tailwind reds/blues (use `accent-pink` or `accent-blue`).
