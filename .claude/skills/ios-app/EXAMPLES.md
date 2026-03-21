# iOS App Development — Example Prompt Sequences

## Example 1: Smart Home Controller

**Prompt 1 — Foundation:**
```
Build "HomeHub" — smart home controller for iPhone and iPad.
Platform: iOS 17+, SwiftUI + MVVM
Screens: Home (room cards), Room Detail, Scenes, Automations, Settings
Navigation: TabView
UI: Dark mode default, SF Symbols, card-based, haptic feedback
```

**Prompt 2 — HomeKit Integration:**
```
Wire up HomeKit: HMHomeManager, group by room, real-time state,
control lights/thermostat/locks/garage doors, handle errors
```

**Prompt 3 — Apple Watch:**
```
watchOS 10+ companion: Favorites grid, Digital Crown control,
scenes list, complications (circular + rectangular)
```

## Example 2: Second Mind Native iOS

**Prompt 1 — Foundation:**
```
Build native iOS version of Second Mind — a personal knowledge management app.
Platform: iOS 17+, SwiftUI + MVVM
Connect to existing Supabase backend (same tables as web app).
Screens: Home (circular timeline), Collections, Todos, Journal, Search, Settings
Navigation: TabView with 5 tabs
UI: Dark-first, red accent (#EF4444), Inter font
```

**Prompt 2 — Data Layer:**
```
Connect to Supabase. Mirror these tables: spaces, items (with blocks JSONB),
user_preferences. Use SwiftData for offline cache. Implement sync queue
matching the web app's offline-first pattern. Version-based conflict resolution.
```

**Prompt 3 — AI Features:**
```
Call the existing ai-assistant edge function for: organize, suggest spaces,
smart rewrite, journal prompts, semantic search. Show streaming responses.
Use the same Supabase function interface the web app uses.
```

## Quick Feature Prompts

**Sign in with Apple:**
```
Add Sign in with Apple + Supabase Auth (signInWithIdToken, provider: .apple).
Store name from Apple credential. Handle re-auth.
```

**Push Notifications:**
```
Request permission, register APNs token with Supabase, handle notification
types: reminder, smart-notification. Deep link to relevant screen.
```

**Offline Mode:**
```
SwiftData as local source of truth. Queue mutations when offline.
Show "Offline" banner. Replay on reconnect. Server wins for conflicts.
```
