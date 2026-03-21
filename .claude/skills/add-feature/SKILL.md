---
name: add-feature
description: Guide for adding a new feature to Second Mind. Use when implementing new functionality that spans pages, components, hooks, or contexts.
user-invocable: true
argument-hint: [feature description]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Add Feature to Second Mind

Adding: $ARGUMENTS

## Checklist

1. **Identify scope** — Does this feature need:
   - [ ] A new page? → Create in `src/pages/`, add route in `src/App.tsx`
   - [ ] New components? → Create in `src/components/`
   - [ ] A new hook? → Create in `src/hooks/`
   - [ ] New context/state? → Create in `src/contexts/`
   - [ ] Database changes? → Create migration in `supabase/migrations/`
   - [ ] Edge function? → Create in `supabase/functions/`
   - [ ] New types? → Add to `src/types/index.ts` or create new type file

2. **Follow existing patterns:**
   - Use `SpacesContext` for item/space CRUD — never call Supabase directly for these
   - Use `useCloudData` hook pattern for new data fetching
   - Use shadcn/ui components from `src/components/ui/` for UI primitives
   - Use Framer Motion for animations (already in deps)
   - Use `react-hook-form` + `zod` for forms
   - Use `toast()` from sonner for user feedback
   - Use `ErrorPopupContext` for error display

3. **Styling rules:**
   - Tailwind utility classes only — no inline styles
   - Follow dark-first theme: use CSS variables from `src/index.css`
   - Red accent color: `text-red-500`, `bg-red-500`, or CSS var `--capture-button`
   - Mobile-first responsive design
   - Support iOS safe areas with `--app-safe-top`

4. **Data flow:**
   - Local cache first → cloud sync in background
   - Optimistic UI updates via SpacesContext
   - Offline operations queue via `src/lib/syncQueue.ts`

5. **Testing:** Run `npm run build` to verify no type errors.

Read the `/codebase-ref` skill for full architecture details if needed.
