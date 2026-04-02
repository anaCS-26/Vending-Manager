---
name: vms-neo-design
description: Use whenever creating or modifying React components, layouts, or visual elements to enforce the Neo-Glassmorphism aesthetic standard.
---

# Skill: VMS Neo-Glassmorphism Design Standard

## 🎯 Objective
Maintain a premium, high-contrast, professional "Neo-Glassmorphism" aesthetic across the entire application interface, tailored for the Next.js/Tailwind stack.

## 🚨 Strict Constraints
- **Never** use generic Tailwind colors like `bg-red-500` or `text-blue-600`.
- **Always** leverage predefined semantic accent tokens (`accent-blue`, `accent-purple`, `neo-bg`).
- **Ensure Consistency:** Reuse existing standard interaction paradigms (dropdowns, data-tables, inputs).
- **Responsive:** Ensure layouts function on mobile (relevant for Driver flows) and desktop (Admin flows).

## 🎨 Theme Tokens (`globals.css`)
- **Containers:** Use `.glass-panel` for cards/modules, and `.glass-panel-hover` for interactive zones.
- **Backgrounds:** `neo-bg` (main app layer), `neo-surface` (semi-transparent card layers).
- **Accents:** 
  - `text-accent-blue` (Primary actions/Buttons)
  - `text-accent-purple` (Analytics)
  - `bg-accent-pink/10 text-accent-pink` (Warnings/Errors/Badges)
  - `text-accent-green` (High capacity/Success)
  - `text-accent-orange` (Urgency/Low Stock)

## ⚙️ Execution Steps
1. Identify the purpose of the UI component.
2. Select the correct semantic token wrapper (e.g., warning alert -> use `accent-pink` utility classes).
3. Apply standard weights (`font-medium` for titles, `text-sm` for subtitles).
4. Utilize Lucide React icons with consistent stroke widths.
5. Review both dark and light mode variable compatibility (handled intrinsically if you use the semantic classes).

## 📝 Example Output
### ✅ Correct Markup
```tsx
<div className="glass-panel glass-panel-hover p-4 rounded-xl flex items-center justify-between">
    <div>
        <h3 className="text-lg font-semibold text-accent-blue">Active Locations</h3>
        <p className="text-sm text-foreground/70">Terminal list for Dhahran</p>
    </div>
    <span className="bg-accent-green/10 text-accent-green px-2 py-1 rounded text-xs font-medium">Synced</span>
</div>
```
### ❌ Invalid Pattern
```tsx
{/* NEVER use direct raw tailwind colors that break the slate mode */}
<div className="bg-zinc-800 shadow-2xl p-4">
    <h3 className="text-blue-500">Active Locations</h3>
</div>
```
