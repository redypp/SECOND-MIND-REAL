---
name: fix-bug
description: Diagnose and fix bugs in Second Mind. Use when troubleshooting issues with components, data sync, auth, or UI behavior.
user-invocable: true
argument-hint: [bug description]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Fix Bug in Second Mind

Bug report: $ARGUMENTS

## Diagnostic Steps

1. **Identify the area:**
   - **UI/Component issue** → Check `src/components/` and `src/pages/`
   - **Data not loading** → Check `src/hooks/useCloudData.ts`, `src/contexts/SpacesContext.tsx`
   - **Auth issue** → Check `src/contexts/AuthContext.tsx`, `src/integrations/supabase/`
   - **Sync/offline issue** → Check `src/lib/syncQueue.ts`, `src/lib/localCache.ts`
   - **AI feature issue** → Check `src/hooks/useAI.ts`, `supabase/functions/ai-assistant/`
   - **Styling issue** → Check `src/index.css` for CSS variables, component Tailwind classes
   - **Navigation issue** → Check `src/layouts/MainLayout.tsx`, `src/App.tsx`

2. **Common pitfalls in this codebase:**
   - SpacesContext uses version-based conflict resolution — stale versions cause silent failures
   - Local cache can serve stale data — check `src/lib/localCache.ts`
   - Sync queue may have stuck operations — check `src/lib/syncQueue.ts`
   - iOS safe area insets may cause layout issues — check `--app-safe-top`
   - Supabase RLS policies may block queries silently

3. **Fix approach:**
   - Read the relevant source files first
   - Check Supabase types in `src/integrations/supabase/types.ts` for schema mismatches
   - Verify with `npm run build` — catches type errors
   - Test the fix path end-to-end

4. **After fixing:** Run `npm run build` and `npm run lint` to verify.
