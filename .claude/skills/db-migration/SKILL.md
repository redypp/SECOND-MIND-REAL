---
name: db-migration
description: Create a Supabase database migration for Second Mind. Use when adding tables, columns, RLS policies, or edge functions.
user-invocable: true
argument-hint: [migration description]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Database Migration for Second Mind

Migration: $ARGUMENTS

## Steps

1. **Create migration file:**
   - Location: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
   - Use current timestamp format: `$(date +%Y%m%d%H%M%S)`

2. **Existing tables for reference:**
   - `profiles` — user profile (name, birthday)
   - `spaces` — collections (name, image, color, is_pinned, is_deleted, merged_from, version)
   - `items` — notes/todos/events (title, blocks JSONB, sub_category, space_ids, color, canvas positions, version)
   - `habits` / `habit_entries` — habit tracking
   - `user_preferences` — theme, AI settings
   - `notifications` — smart notifications
   - `scheduled_reminders` — timed reminders (title, body, remind_at, is_fired)
   - `archive_sources` — imported external content
   - `data_integrity_logs` — audit trail

3. **Conventions:**
   - Always add `user_id UUID REFERENCES auth.users(id)` for user-scoped tables
   - Always add RLS policies: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
   - Standard RLS pattern:
     ```sql
     CREATE POLICY "Users can manage own data" ON table_name
       FOR ALL USING (auth.uid() = user_id);
     ```
   - Include `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()`
   - Use `version INTEGER DEFAULT 1` for sync conflict resolution

4. **After migration:**
   - Update types: regenerate or manually update `src/integrations/supabase/types.ts`
   - Update relevant contexts/hooks to use new tables
   - Apply with: `supabase db push` or via Supabase dashboard

5. **Edge functions** go in `supabase/functions/function-name/index.ts` using Deno runtime.
