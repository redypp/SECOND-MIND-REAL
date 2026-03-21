---
name: codebase-ref
description: Quick reference for the Second Mind codebase — architecture, file locations, conventions, and patterns. Use when you need context about the project before making changes.
user-invocable: true
allowed-tools: Read, Grep, Glob
---

# Second Mind — Codebase Reference

## Tech Stack
- **Framework:** React 18 + TypeScript 5.8
- **Build:** Vite 5.4 with SWC
- **UI:** shadcn/ui (Radix) + Tailwind CSS 3.4
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions)
- **State:** React Context + TanStack React Query
- **Routing:** React Router DOM 7
- **Animations:** Framer Motion
- **Testing:** Playwright

## Directory Layout
```
src/
├── pages/          # Route components (Home, AuthPage, ClockPage, etc.)
├── components/     # 46 reusable components
│   └── ui/         # shadcn/ui primitives (button, dialog, card, etc.)
├── hooks/          # 14 custom hooks
├── contexts/       # 7 context providers
├── layouts/        # MainLayout with swipeable nav
├── lib/            # Utilities (sync, cache, organizer, auth lifecycle)
├── integrations/   # Supabase client config
├── types/          # TypeScript interfaces
├── data/           # Mock data
└── assets/         # Images and static assets
```

## Core Types (src/types/index.ts)
- `Item` — notes, todos, events with block-based content, canvas positioning
- `Space` — collections/categories with pinning, merging, soft delete
- `Person` — people references
- `ContentBlock` — union of TextBlock | ListBlock | ChecklistBlock | MediaBlock | TableBlock

## Key Contexts
| Context | File | Purpose |
|---------|------|---------|
| AuthContext | `src/contexts/AuthContext.tsx` | Session, profile, sign in/up/out |
| SpacesContext | `src/contexts/SpacesContext.tsx` | Spaces & items, local + cloud sync |
| ThemeContext | `src/contexts/ThemeContext.tsx` | Light/dark theme |
| AISettingsContext | `src/contexts/AISettingsContext.tsx` | AI feature toggles |
| TutorialContext | `src/contexts/TutorialContext.tsx` | Feature tour state |
| ScrapbookContext | `src/contexts/ScrapbookContext.tsx` | Media gallery |
| ErrorPopupContext | `src/contexts/ErrorPopupContext.tsx` | Global error notifications |

## Key Hooks
| Hook | File | Purpose |
|------|------|---------|
| useCloudData | `src/hooks/useCloudData.ts` | Fetch spaces/items from Supabase |
| useAI | `src/hooks/useAI.ts` | AI operations (organize, suggest, rewrite) |
| useSyncStatus | `src/hooks/useSyncStatus.ts` | Sync queue monitoring |
| useScheduledReminders | `src/hooks/useScheduledReminders.ts` | Polls for due reminders |
| useSemanticSearch | `src/hooks/useSemanticSearch.ts` | Full-text + semantic search |
| useSmartRewrite | `src/hooks/useSmartRewrite.ts` | AI text rewriting |
| useSourceImport | `src/hooks/useSourceImport.ts` | Import from external URLs |
| useAutoOrganize | `src/hooks/useAutoOrganize.ts` | Smart space suggestions |

## Routes (src/App.tsx)
| Path | Page | Description |
|------|------|-------------|
| `/` | Home (LifePage) | Dashboard with timeline, collections |
| `/daily-plan` | ClockPage | 24h/12h circular timeline |
| `/todos` | TodoPage | Task management |
| `/habits` | HabitsPage | Habit tracking |
| `/journal` | JournalPage | Journal with prompts |
| `/collections` | CollectionsPage | Space management |
| `/archive` | ArchivePage | Archived items |
| `/space/:id` | SpaceDetail | Items in a space |
| `/item/:id` | ItemDetail | Single item view |
| `/search` | Search | Semantic search |
| `/auth` | AuthPage | Login/signup |
| `/settings` | SettingsPage | Preferences |

## Supabase Tables
`profiles`, `spaces`, `items`, `habits`, `habit_entries`, `user_preferences`, `notifications`, `scheduled_reminders`, `archive_sources`, `data_integrity_logs`

## Edge Functions (supabase/functions/)
- `ai-assistant` — AI orchestrator (organize, suggest, rewrite, journal prompts, semantic search)
- `import-source` — Parse external URLs
- `smart-notifications` — Generate notification suggestions

## Styling Conventions
- Dark-first theme with light variant
- Colors: minimal grays + red accent (#EF4444) with variants (coral, crimson, maroon, rose, berry)
- Fonts: Inter (body), Lora (serif), Space Mono (mono)
- CSS variables for design tokens in `src/index.css`
- iOS safe area insets supported

## Architecture Patterns
1. **Offline-first sync:** Queue operations offline, retry on reconnect, version-based conflicts
2. **Cache-first loading:** Local cache loads immediately, cloud syncs in background
3. **Block-based content:** Items store content as arrays of typed blocks
4. **Optimistic updates:** UI updates immediately, queued for cloud sync
5. **Gesture navigation:** Horizontal swipeable layout in MainLayout
