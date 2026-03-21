---
name: add-page
description: Create a new page/route in Second Mind. Use when adding a new screen to the app.
user-invocable: true
argument-hint: [page name and purpose]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Add Page to Second Mind

Page: $ARGUMENTS

## Steps

1. **Create the page file** at `src/pages/PageName.tsx`:
```tsx
import React from 'react';
// Import components, hooks, contexts as needed

const PageName: React.FC = () => {
  return (
    <div className="min-h-screen bg-background p-4">
      {/* page content */}
    </div>
  );
};

export default PageName;
```

2. **Add the route** in `src/App.tsx`:
   - Import the page with lazy loading: `const PageName = lazy(() => import('./pages/PageName'))`
   - Add a `<Route path="/page-name" element={<PageName />} />` inside the router
   - Wrap with `<ProtectedRoute>` if auth is required

3. **Navigation access:**
   - Add to `src/components/BottomNavigation.tsx` if it's a main tab
   - Or link from existing pages with `<Link to="/page-name">`
   - If it's a LIFE sub-page, add to the swipeable layout in `src/layouts/MainLayout.tsx`

4. **Existing page patterns to follow:**
   - Dashboard style → see `src/pages/Home.tsx` (LifePage)
   - List/grid style → see `src/pages/CollectionsPage.tsx`
   - Detail view → see `src/pages/ItemDetail.tsx`
   - Form page → see `src/pages/SettingsPage.tsx`

5. **Mobile considerations:**
   - Safe area padding: `pt-[var(--app-safe-top)]`
   - Bottom nav clearance: `pb-20`
   - Touch targets: minimum 44px
