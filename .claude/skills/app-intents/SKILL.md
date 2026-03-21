---
name: app-intents
description: App Intents, Siri Shortcuts, and Spotlight integration for iOS apps. Use when exposing app actions to Siri, adding voice shortcuts, or integrating with Spotlight search.
user-invocable: true
argument-hint: [intent or shortcut description]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# App Intents & Siri Shortcuts

Feature: $ARGUMENTS

## Basic App Intent

```swift
import AppIntents

struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Task"
    static var description = IntentDescription("Adds a new task to your list.")
    static var openAppWhenRun = false

    @Parameter(title: "Task Name") var taskName: String
    @Parameter(title: "Priority", default: .medium) var priority: TaskPriority

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let task = Task(title: taskName, priority: priority)
        try await TaskStore.shared.save(task)
        return .result(dialog: "Added '\(taskName)' to your tasks.")
    }
}

enum TaskPriority: String, AppEnum {
    case low, medium, high
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Priority")
    static var caseDisplayRepresentations: [TaskPriority: DisplayRepresentation] = [
        .low: "Low", .medium: "Medium", .high: "High"
    ]
}
```

## App Shortcuts Provider

```swift
struct AppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: ["Add a task in \(.applicationName)", "Create a new task in \(.applicationName)"],
            shortTitle: "Add Task",
            systemImageName: "plus.circle"
        )
    }
}
```

## Entity Queries (Dynamic Parameters)

```swift
struct TaskEntity: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Task")
    static var defaultQuery = TaskEntityQuery()
    var id: UUID
    var title: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)") }
}

struct TaskEntityQuery: EntityQuery {
    func entities(for identifiers: [UUID]) async throws -> [TaskEntity] {
        try await TaskStore.shared.tasks(for: identifiers).map { TaskEntity(id: $0.id, title: $0.title) }
    }
    func suggestedEntities() async throws -> [TaskEntity] {
        try await TaskStore.shared.recentTasks().map { TaskEntity(id: $0.id, title: $0.title) }
    }
}
```

## Spotlight Integration

```swift
import CoreSpotlight

func indexTask(_ task: Task) {
    let attributes = CSSearchableItemAttributeSet(contentType: .text)
    attributes.title = task.title
    attributes.contentDescription = "Task: \(task.title)"
    let item = CSSearchableItem(uniqueIdentifier: task.id.uuidString,
                                 domainIdentifier: "com.app.tasks", attributeSet: attributes)
    CSSearchableIndex.default().indexSearchableItems([item])
}
```

## Second Mind Intents

For a native Second Mind iOS app, expose these to Siri:

| Intent | Phrase | Action |
|--------|--------|--------|
| QuickCapture | "Capture a thought in Second Mind" | Create new `item` with dictated text |
| AddTodo | "Add a todo in Second Mind" | Create item with `sub_category: 'todo'` |
| ShowTodos | "Show my todos in Second Mind" | Open TodoPage |
| SearchNotes | "Search Second Mind for [query]" | Trigger semantic search via `ai-assistant` edge function |
| CheckHabits | "Check my habits in Second Mind" | Open HabitsPage, mark today's entries |

These map to the web app's routes: `/todos`, `/habits`, `/search` (see `/codebase-ref`).

## Best Practices

- Keep intent names short and action-oriented
- Provide multiple natural-language phrases
- Use `@Parameter` with sensible defaults
- Test with Siri on a real device
- Use `openAppWhenRun = false` when possible for faster execution
