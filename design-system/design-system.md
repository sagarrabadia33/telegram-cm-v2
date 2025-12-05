# Telegram CRM Design System
## Inspired by Linear

A dark-mode-first design system for the Telegram CRM application.

---

## Colors

### Backgrounds (Dark Mode)

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--bg-primary` | `#08090A` | `8, 9, 10` | Main app background |
| `--bg-secondary` | `#0F0F10` | `15, 15, 16` | Cards, sidebars, panels |
| `--bg-tertiary` | `#151516` | `21, 21, 22` | Elevated surfaces, inputs |
| `--bg-hover` | `#1C1C1E` | `28, 28, 30` | Hover states |
| `--bg-active` | `#232326` | `35, 35, 38` | Active/pressed states |

### Borders

| Token | Hex | Usage |
|-------|-----|-------|
| `--border-subtle` | `#1E1E20` | Subtle dividers |
| `--border-default` | `#2E2E30` | Default borders |
| `--border-strong` | `#3E3E42` | Emphasized borders |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#F7F8F8` | Primary text, headings |
| `--text-secondary` | `#EEEFF1` | Secondary text |
| `--text-tertiary` | `#95A2B3` | Muted text, labels, placeholders |
| `--text-quaternary` | `#5C6370` | Disabled, hints |

### Brand / Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary` | `#5E6AD2` | Primary actions, links, focus rings |
| `--accent-hover` | `#4551B5` | Button hover states |
| `--accent-active` | `#3D4799` | Button active/pressed states |
| `--accent-subtle` | `rgba(94, 106, 210, 0.15)` | Accent backgrounds |

### Accent Gradient

```css
background: linear-gradient(92.88deg, #455EB5 9.16%, #5643CC 43.89%, #673FD7 64.72%);
```

### Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--success` | `#2AF598` | Success states |
| `--success-subtle` | `rgba(42, 245, 152, 0.15)` | Success backgrounds |
| `--error` | `#D25E65` | Error states |
| `--error-subtle` | `rgba(210, 94, 101, 0.15)` | Error backgrounds |
| `--warning` | `#F5A623` | Warning states |
| `--warning-subtle` | `rgba(245, 166, 35, 0.15)` | Warning backgrounds |
| `--info` | `#08AEEA` | Info states |
| `--info-subtle` | `rgba(8, 174, 234, 0.15)` | Info backgrounds |

---

## Typography

### Font Families

| Token | Value | Usage |
|-------|-------|-------|
| `--font-sans` | `"Inter", "Inter UI", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif` | Default UI text |
| `--font-display` | `"Inter Display", "Inter", -apple-system, BlinkMacSystemFont, sans-serif` | Headings, hero text |
| `--font-mono` | `"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace` | Code, timestamps |

### Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `--font-normal` | `400` | Body text |
| `--font-medium` | `500` | Buttons, emphasized text |
| `--font-semibold` | `600` | Headings, labels |
| `--font-bold` | `700` | Strong emphasis |
| `--font-extrabold` | `800` | Display text |

### Type Scale

| Token | Size | Line Height | Letter Spacing | Usage |
|-------|------|-------------|----------------|-------|
| `--text-xs` | 11px | 14px | 0.01em | Badges, timestamps, metadata |
| `--text-sm` | 12px | 16px | 0.01em | Labels, captions, secondary info |
| `--text-base` | 13px | 20px | 0 | **Default body text** |
| `--text-md` | 14px | 20px | 0 | Emphasized body, inputs |
| `--text-lg` | 15px | 22px | -0.01em | Large body text |
| `--title-xs` | 12px | 16px | 0.05em | Uppercase labels |
| `--title-sm` | 14px | 20px | -0.01em | Small headings |
| `--title-md` | 16px | 24px | -0.02em | Section titles |
| `--title-lg` | 20px | 28px | -0.02em | Page titles |
| `--title-xl` | 24px | 32px | -0.02em | Major headings |
| `--display-sm` | 32px | 40px | -0.03em | Display text |
| `--display-md` | 48px | 56px | -0.03em | Hero text |
| `--display-lg` | 62px | 72px | -0.03em | Large hero text |

---

## Spacing

Based on 4px base unit.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0px | None |
| `--space-0.5` | 2px | Micro spacing |
| `--space-1` | 4px | Tight spacing |
| `--space-1.5` | 6px | Small gap |
| `--space-2` | 8px | Default gap |
| `--space-2.5` | 10px | Medium-small |
| `--space-3` | 12px | Medium |
| `--space-4` | 16px | Standard |
| `--space-5` | 20px | Comfortable |
| `--space-6` | 24px | Generous |
| `--space-8` | 32px | Large |
| `--space-10` | 40px | Extra large |
| `--space-12` | 48px | Section spacing |
| `--space-16` | 64px | Major sections |
| `--space-20` | 80px | Page sections |
| `--space-24` | 96px | Hero spacing |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | 0px | No rounding |
| `--radius-sm` | 4px | Small elements, badges |
| `--radius-md` | 6px | Buttons, inputs, tags |
| `--radius-lg` | 8px | Cards, dropdowns |
| `--radius-xl` | 12px | Large cards, modals |
| `--radius-2xl` | 16px | Feature cards |
| `--radius-full` | 9999px | Pills, avatars, circles |

---

## Shadows (Dark Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-xs` | `0 1px 2px rgba(0, 0, 0, 0.2)` | Subtle lift |
| `--shadow-sm` | `0 2px 4px rgba(0, 0, 0, 0.3)` | Small elevation |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.4)` | Cards, dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0, 0, 0, 0.5)` | Modals, popovers |
| `--shadow-xl` | `0 16px 48px rgba(0, 0, 0, 0.6)` | Overlays |
| `--shadow-glow` | `0 0 20px rgba(94, 106, 210, 0.3)` | Accent glow effect |
| `--shadow-glow-success` | `0 0 20px rgba(42, 245, 152, 0.3)` | Success glow |
| `--shadow-glow-error` | `0 0 20px rgba(210, 94, 101, 0.3)` | Error glow |

---

## Components

### Buttons

#### Sizes

| Size | Height | Padding | Font Size | Icon Size |
|------|--------|---------|-----------|-----------|
| `xs` | 24px | 6px 8px | 11px | 14px |
| `sm` | 28px | 6px 10px | 12px | 16px |
| `md` | 32px | 8px 12px | 13px | 18px |
| `lg` | 36px | 8px 16px | 14px | 20px |
| `xl` | 44px | 12px 20px | 15px | 22px |

#### Variants

**Primary:**
- Background: `--accent-primary` (#5E6AD2)
- Text: `#FFFFFF`
- Hover: `--accent-hover` (#4551B5)
- Active: `--accent-active` (#3D4799)

**Secondary:**
- Background: `transparent`
- Border: `--border-default` (#2E2E30)
- Text: `--text-primary` (#F7F8F8)
- Hover Background: `--bg-hover` (#1C1C1E)

**Ghost:**
- Background: `transparent`
- Text: `--text-tertiary` (#95A2B3)
- Hover Background: `--bg-hover` (#1C1C1E)
- Hover Text: `--text-primary` (#F7F8F8)

**Danger:**
- Background: `--error` (#D25E65)
- Text: `#FFFFFF`
- Hover: Darken 10%

### Inputs

| Property | Value |
|----------|-------|
| Height | 32px (md), 36px (lg) |
| Background | `--bg-tertiary` (#151516) |
| Border | 1px solid `--border-default` (#2E2E30) |
| Border Radius | `--radius-md` (6px) |
| Font Size | 13px |
| Padding | 8px 12px |
| Text Color | `--text-primary` (#F7F8F8) |
| Placeholder | `--text-quaternary` (#5C6370) |
| Focus Border | `--accent-primary` (#5E6AD2) |
| Focus Ring | `0 0 0 2px rgba(94, 106, 210, 0.2)` |

### Cards

| Property | Value |
|----------|-------|
| Background | `--bg-secondary` (#0F0F10) |
| Border | 1px solid `--border-subtle` (#1E1E20) |
| Border Radius | `--radius-lg` (8px) |
| Padding | 16px or 20px |
| Shadow | `--shadow-sm` (optional) |
| Hover Background | `--bg-tertiary` (#151516) - for clickable cards |

### Badges / Tags

| Property | Value |
|----------|-------|
| Height | 20px (sm), 24px (md) |
| Padding | 4px 8px |
| Font Size | 11px (sm), 12px (md) |
| Font Weight | 500 |
| Border Radius | `--radius-sm` (4px) |
| Background | Color with 15% opacity |
| Text | Full color |

### Avatar

| Size | Dimensions | Font Size |
|------|------------|-----------|
| `xs` | 20px | 10px |
| `sm` | 24px | 11px |
| `md` | 32px | 13px |
| `lg` | 40px | 16px |
| `xl` | 48px | 20px |
| `2xl` | 64px | 24px |

---

## Transitions

| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | `100ms ease` | Hover effects |
| `--transition-base` | `150ms ease` | Default transitions |
| `--transition-slow` | `250ms ease` | Expand/collapse |
| `--transition-slower` | `350ms ease` | Page transitions |

---

## Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--z-base` | 0 | Default |
| `--z-dropdown` | 100 | Dropdowns |
| `--z-sticky` | 200 | Sticky headers |
| `--z-overlay` | 300 | Overlays |
| `--z-modal` | 400 | Modals |
| `--z-popover` | 500 | Popovers |
| `--z-tooltip` | 600 | Tooltips |
| `--z-toast` | 700 | Toasts/notifications |

---

## Icon Sizes

| Size | Dimensions | Stroke |
|------|------------|--------|
| `xs` | 14px | 1.5px |
| `sm` | 16px | 1.5px |
| `md` | 18px | 2px |
| `lg` | 20px | 2px |
| `xl` | 24px | 2px |

---

## Breakpoints

| Name | Value | Usage |
|------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablets |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |
| `2xl` | 1536px | Extra large |

---

## Design Principles

1. **High Contrast** - Use light text (#F7F8F8) on very dark backgrounds (#08090A)
2. **Subtle Borders** - Use #2E2E30 instead of pure black for borders
3. **Minimal Chrome** - Limit accent color usage to important actions only
4. **Compact UI** - 13px base font, 32px button heights for density
5. **Consistent Spacing** - Use the 4px grid system
6. **Smooth Transitions** - 150ms ease for most interactions

---

## Sources

- [Linear Brand Guidelines](https://linear.app/brand)
- [How We Redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear Design System (Figma)](https://www.figma.com/community/file/1222872653732371433/linear-design-system)
- [Inter UI on Linear - Typ.io](https://typ.io/s/2jmp)
