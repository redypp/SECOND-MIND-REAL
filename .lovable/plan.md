

## Fix: Restore app to working state

### Issue 1: `.env` — duplicates and placeholder key
The `.env` has 6 lines with duplicates and a placeholder. Clean it to 3 lines using the **real** anon key from line 5:

```
VITE_SUPABASE_PROJECT_ID="cugpdwzlvagbcbrpigcs"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1Z3Bkd3psdmFnYmNicnBpZ2NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODgxMjQsImV4cCI6MjA4Njk2NDEyNH0.K2PQ_NaPw3inoyIQWAj9qc1wh5aQwHr5OzpikJzfvdg"
VITE_SUPABASE_URL="https://cugpdwzlvagbcbrpigcs.supabase.co"
```

### Issue 2: AuthContext.tsx — build error (TS2448)
`fetchProfileOnce` (line 138) references `fetchProfile` (line 150), but `fetchProfile` is declared *after* it. Block-scoped `const` cannot be used before declaration.

**Fix:** Move the `fetchProfile` useCallback (lines 150–176) to **before** `fetchProfileOnce` (line 138). No logic changes — just reorder the two declarations.

### Summary
- 2 files changed, no new dependencies
- `.env`: deduplicate, use correct anon key for project `cugpdwzlvagbcbrpigcs`
- `AuthContext.tsx`: swap order of two adjacent useCallback blocks

