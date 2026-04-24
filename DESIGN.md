---
colors:
  background:
    light: "#f8fafc"
    dark: "#09090b"
  foreground:
    light: "#0f172a"
    dark: "#f8fafc"
  border:
    light: "rgba(0, 0, 0, 0.1)"
    dark: "rgba(255, 255, 255, 0.08)"
  ring:
    value: "{colors.accent.blue}"
  surface:
    light: "rgba(255, 255, 255, 0.75)"
    dark: "rgba(24, 24, 27, 0.6)"
  surfaceHover:
    light: "rgba(241, 245, 249, 0.9)"
    dark: "rgba(39, 39, 42, 0.8)"
  surfaceBorder:
    light: "rgba(0, 0, 0, 0.08)"
    dark: "rgba(255, 255, 255, 0.08)"
  glassBorderHover:
    light: "rgba(0, 0, 0, 0.15)"
    dark: "rgba(255, 255, 255, 0.2)"
  accent:
    blue: "#3b82f6"
    purple: "#6366f1"
    pink: "#f43f5e"
    green: "#10b981"
    orange: "#f97316"

typography:
  fonts:
    sans: "Outfit, ui-sans-serif, system-ui, sans-serif"
    mono: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"

effects:
  blur:
    glass: "blur-xl (24px)"
  shadows:
    textGlow: "0 0 20px rgba(0, 240, 255, 0.5)"
    glassLight: "shadow-md"
    glassDark: "shadow-2xl"
  gradients:
    backgroundGlow: "radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.08) 0%, transparent 40%), radial-gradient(circle at 85% 30%, rgba(59, 130, 246, 0.08) 0%, transparent 40%)"

motion:
  duration:
    base: "300ms"
    themeToggle: "500ms"
  easing:
    themeToggle: "cubic-bezier(0.4, 0, 0.2, 1)"
---

# NexGen Vending System Design

## Core Aesthetic: Neo-Glassmorphism

The NexGen Vending System employs a "Neo-Glassmorphism" visual language. This design approach creates a premium, high-contrast, professional interface tailored for administrative, dispatch, and financial tasks. It combines modern semi-transparent surfaces with precise, vibrant accent colors that communicate context clearly, establishing a tool that feels both state-of-the-art and highly utilitarian.

### Philosophy and Intent
- **Clarity Through Layers:** The interface relies on subtle elevation and depth to distinguish interactive elements from the background canvas. The base background is animated with a very soft dual radial glow (incorporating the indigo and blue accents) that provides visual interest without distracting from the data.
- **Semantic Accents:** Colors are never used arbitrarily. The slate-based neutral palette is punctuated by highly intentional accent colors:
  - **Blue:** Primary actions, functional UI elements, and interactive state highlights (like the focus ring).
  - **Purple:** Analytical data points and specific managerial metrics.
  - **Green:** Success states, high capacity indicators, or positive confirmations.
  - **Orange:** Warnings, low stock, or situations requiring attention.
  - **Pink:** Critical errors, destructible actions, or urgent system badges.
- **Tactile Interactivity:** Surfaces respond to user engagement. Hovering over a glass panel subtly increases its opacity and border prominence, providing immediate tactile feedback.

## Layout and Surface Hierarchy

The visual hierarchy is established through a strict z-index of visual weight:

1. **The Canvas:** The deepest layer, representing either a clean slate (`#f8fafc`) in light mode or a deep dark canvas (`#09090b`) in dark mode, softly illuminated by radial gradient background glows.
2. **The Surface (Glass Panels):** Containers for content (modules, cards, tables). These use a distinct glassmorphic treatment: semi-transparent backgrounds with a strong background blur, defined by a very subtle translucent border. The drop shadow dynamically scales based on the theme (a tighter drop shadow for light mode, a deeper drop shadow for dark mode) to maintain contrast.
3. **The Content Layer:** Text and interactive elements resting on the surfaces. Typography utilizes "Outfit" for a geometric, highly legible sans-serif presentation, and "JetBrains Mono" for technical data, SKUs, and tabular alignments.

## Component Paradigms

### Glass Panels
The foundational container component. It is strictly defined as having a heavy backdrop blur, a semi-transparent surface background, and a subtle border. When interactive, the panel background becomes slightly more opaque and the border gently thickens or increases in opacity, accompanied by a smooth transition.

### Theming and Transitions
The design system supports full Light and Dark modes seamlessly. The transition between themes is not instantaneous; it utilizes a smooth cubic-bezier transition applied globally to root elements, ensuring the interface gently shifts between its vibrant light presentation and its sleek, high-contrast dark mode.

### Form Inputs and Controls
Inputs, selects, and textareas share a unified interaction pattern. Upon focus, they reveal a distinctive focus ring tinted with the primary blue accent, accompanied by an accented border. This ensures that the active interactive element is unmistakable. The default numeric input arrows are globally stripped to maintain a sleek, uninterrupted aesthetic.

### Scrollbars
The native scrollbar is overridden to be exceptionally sleek. It features a transparent track with a rounded, pill-like thumb that subtly changes color upon hover, matching the slate/zinc undertones of the respective theme to never detract from the main content layout.
