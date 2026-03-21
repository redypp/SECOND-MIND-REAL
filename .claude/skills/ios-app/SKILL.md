---
name: ios-app
description: Generate production-quality Swift code for Apple ecosystem apps (iOS, watchOS, widgets, HomeKit, App Intents). Use when building a native iOS version of Second Mind or any Swift/SwiftUI app. Also trigger for SwiftUI, UIKit, CoreData, SwiftData, CloudKit, HealthKit, WatchKit, ActivityKit, Core ML, or any Apple framework.
user-invocable: true
argument-hint: [app or feature description]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# iOS App Development

Building: $ARGUMENTS

## Core Principles

- **SwiftUI** for all new UI (UIKit only when SwiftUI lacks capability)
- **MVVM** as default architecture (ViewModel per screen/feature)
- **Swift Concurrency** (async/await, actors) over Combine or completion handlers
- **SwiftData** for new persistence (Core Data only for legacy/migration)
- **Observation framework** (`@Observable`) over `ObservableObject` for iOS 17+

## Project Structure

```
AppName/
├── App/                    # @main entry, ContentView, AppDelegate
├── Features/               # Feature modules (Auth/, Home/, Settings/)
│   └── FeatureName/
│       ├── Views/
│       ├── ViewModels/
│       └── Models/
├── Core/
│   ├── Network/            # APIClient, Endpoints
│   ├── Database/           # DatabaseManager, SwiftData @Models
│   ├── Services/           # AuthService, NotificationService, AIService
│   └── Utilities/          # Extensions, Constants, Logger
├── Shared/
│   ├── Components/         # Reusable SwiftUI views
│   ├── Modifiers/          # Custom ViewModifiers
│   └── Resources/          # Assets, Localizable.xcstrings
├── WatchApp/               # watchOS target (see /watchos)
├── Widgets/                # WidgetKit target (see /widgets)
└── AppClip/                # App Clip target
```

## Second Mind Integration

When building a native iOS version of Second Mind, use the existing Supabase backend:

- **Tables:** `profiles`, `spaces`, `items`, `habits`, `habit_entries`, `user_preferences`, `notifications`, `scheduled_reminders`, `archive_sources`
- **Edge Functions:** `ai-assistant`, `import-source`, `smart-notifications`
- **Storage:** `user-images` bucket
- **Auth:** Supabase Auth (add Sign in with Apple for native)
- **Types:** Mirror the TypeScript types from `src/types/index.ts` — `Item` (with blocks), `Space`, `Person`
- **Sync:** Match the offline-first sync pattern from `src/lib/syncQueue.ts` and `src/lib/localCache.ts`
- See `/supabase-ios` for Swift-specific Supabase patterns
- See `/codebase-ref` for full backend schema

## MVVM Pattern

```swift
// Model
@Model class Task {
    var title: String
    var isCompleted: Bool
    var createdAt: Date
    init(title: String) { self.title = title; self.isCompleted = false; self.createdAt = .now }
}

// ViewModel
@Observable class TaskListViewModel {
    var tasks: [Task] = []
    var isLoading = false
    var errorMessage: String?
    private let database: DatabaseManager
    init(database: DatabaseManager = .shared) { self.database = database }
    func loadTasks() async { /* fetch */ }
}

// View
struct TaskListView: View {
    @State private var viewModel = TaskListViewModel()
    var body: some View {
        NavigationStack {
            List(viewModel.tasks) { task in TaskRow(task: task) }
                .task { await viewModel.loadTasks() }
        }
    }
}
```

## Build Strategy

1. Project structure, navigation, placeholder screens
2. Data models and local persistence
3. Core UI for primary user flow
4. Authentication and cloud backend (Supabase)
5. Secondary features (search, filters, settings)
6. Platform extensions (Watch, Widgets, App Clips)
7. AI/ML features
8. Polish (animations, accessibility, error handling)
9. App Store preparation

## Related Skills

- `/homekit` — HomeKit & Matter smart home
- `/watchos` — Apple Watch companion
- `/widgets` — WidgetKit & Live Activities
- `/app-intents` — Siri & Shortcuts
- `/ai-ml-ios` — Core ML & cloud AI
- `/supabase-ios` — Supabase Swift SDK

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using UIKit when SwiftUI works | Default to SwiftUI |
| Hardcoding API keys | Use Keychain or .xcconfig with .gitignore |
| Ignoring async/await | Use Swift Concurrency throughout |
| Massive ViewModels | One ViewModel per screen, extract services |
| Skipping Sign in with Apple | Required if offering other social login |
| No offline support | SwiftData for local cache, sync when online |
| Force unwrapping | Use guard let, if let, nil coalescing |

## App Store Checklist

- [ ] App icons for all sizes
- [ ] Launch screen configured
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`)
- [ ] Usage descriptions in Info.plist
- [ ] Sign in with Apple (if social login offered)
- [ ] Accessibility audit (VoiceOver, Dynamic Type)
- [ ] Screenshots for required device sizes
- [ ] TestFlight beta tested on real devices
