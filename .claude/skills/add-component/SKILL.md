---
name: add-component
description: Create a new React component following Second Mind conventions. Use when building new UI elements.
user-invocable: true
argument-hint: [component name and description]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Add Component to Second Mind

Component: $ARGUMENTS

## Conventions

1. **File location:** `src/components/ComponentName.tsx`
   - UI primitives go in `src/components/ui/` (shadcn pattern)
   - Feature components go in `src/components/`

2. **Component pattern:**
```tsx
import React from 'react';
// Import shadcn/ui primitives from src/components/ui/
// Import contexts with useContext hooks
// Import types from src/types/

interface ComponentNameProps {
  // typed props
}

const ComponentName: React.FC<ComponentNameProps> = ({ ...props }) => {
  return (
    <div className="tailwind-classes-here">
      {/* content */}
    </div>
  );
};

export default ComponentName;
```

3. **Styling:**
   - Tailwind utility classes — no CSS modules or inline styles
   - Dark-first: colors should work in dark theme by default
   - Use `cn()` from `src/lib/utils.ts` for conditional classes
   - Animations: use Framer Motion's `motion.div` with `animate`, `exit`, `transition`
   - Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints

4. **State access:**
   - Items/Spaces → `useContext(SpacesContext)` from `src/contexts/SpacesContext.tsx`
   - Auth → `useAuth()` from `src/contexts/AuthContext.tsx`
   - Theme → `useTheme()` from `src/contexts/ThemeContext.tsx`
   - Errors → `useErrorPopup()` from `src/contexts/ErrorPopupContext.tsx`

5. **Common UI primitives available** (from `src/components/ui/`):
   Button, Card, Dialog, Sheet, Drawer, Input, Textarea, Select, Badge,
   Tabs, Accordion, Popover, Tooltip, ScrollArea, Separator, Switch, Checkbox
