---
name: style-guide
description: Second Mind styling conventions and design tokens. Use when styling components or debugging visual issues.
user-invocable: true
allowed-tools: Read, Grep, Glob
---

# Second Mind Style Guide

## Theme
- **Mode:** Dark-first with light theme support
- **Toggle:** `useTheme()` from `src/contexts/ThemeContext.tsx`
- **CSS vars:** Defined in `src/index.css` under `:root` and `.light`

## Colors
| Token | Usage |
|-------|-------|
| `bg-background` | Page backgrounds |
| `bg-card` | Card surfaces |
| `text-foreground` | Primary text |
| `text-muted-foreground` | Secondary text |
| `bg-red-500` / `text-red-500` | Primary accent (hot red #EF4444) |
| `--capture-button` | Action button color |
| `--space-card` | Space card backgrounds |
| `--search-bg` | Search bar background |

## Accent Variants
coral, crimson, maroon, rose, berry — used for item/space color customization

## Typography
| Font | Class | Usage |
|------|-------|-------|
| Inter | `font-sans` (default) | Body text, UI |
| Lora | `font-serif` | Headings, decorative |
| Space Mono | `font-mono` | Code, timestamps |

## Spacing & Layout
- Mobile-first: design for small screens, enhance with `sm:`, `md:`, `lg:`
- Safe area: `pt-[var(--app-safe-top)]` for iOS notch
- Bottom nav clearance: `pb-20`
- Touch targets: min 44px (`min-h-11 min-w-11`)
- Card padding: `p-3` or `p-4`
- Section gaps: `gap-3` or `gap-4`

## Shadows
CSS variables: `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-2xl`

## Animations
- Use Framer Motion for enter/exit/layout animations
- Common pattern:
```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
  transition={{ duration: 0.2 }}
/>
```
- Tailwind keyframes available: `animate-fade-in`, `animate-fade-out`, `animate-scale-in`, `animate-slide-up`

## Utilities
- `cn()` from `src/lib/utils.ts` for conditional class merging
- shadcn/ui components are pre-styled — extend via `className` prop
