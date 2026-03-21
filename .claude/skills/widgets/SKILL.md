---
name: widgets
description: iOS widgets (WidgetKit) and Live Activities (ActivityKit). Use when building home screen widgets, lock screen widgets, interactive widgets, or Dynamic Island Live Activities.
user-invocable: true
argument-hint: [widget or live activity description]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Widgets & Live Activities

Feature: $ARGUMENTS

## WidgetKit Setup

Add Widget Extension target: File > New > Target > Widget Extension.

## Basic Widget

```swift
import WidgetKit
import SwiftUI

struct TaskEntry: TimelineEntry {
    let date: Date
    let incompleteTasks: Int
    let nextTask: String?
}

struct TaskWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> TaskEntry {
        TaskEntry(date: .now, incompleteTasks: 3, nextTask: "Buy groceries")
    }
    func getSnapshot(in context: Context, completion: @escaping (TaskEntry) -> Void) {
        completion(placeholder(in: context))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TaskEntry>) -> Void) {
        let entry = TaskEntry(date: .now, incompleteTasks: 5, nextTask: "Review PR")
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: .now)!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct TaskWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TaskWidget", provider: TaskWidgetProvider()) { entry in
            TaskWidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Tasks")
        .description("See your upcoming tasks.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}
```

## Interactive Widgets (iOS 17+)

```swift
import AppIntents

struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Task"
    @Parameter(title: "Task ID") var taskId: String

    func perform() async throws -> some IntentResult {
        SharedDataStore.toggleTask(id: taskId)
        return .result()
    }
}

// In widget view:
Button(intent: ToggleTaskIntent(taskId: task.id)) {
    Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
}
```

## Data Sharing (App Groups)

```swift
let sharedDefaults = UserDefaults(suiteName: "group.com.yourapp")
sharedDefaults?.set(taskCount, forKey: "incompleteTasks")
WidgetCenter.shared.reloadTimelines(ofKind: "TaskWidget")  // Trigger refresh
```

## Deep Linking

```swift
// Widget view
.widgetURL(URL(string: "myapp://tasks"))
// Or per-item
Link(destination: URL(string: "myapp://task/\(entry.taskId)")!) { TaskRow(task: entry) }
// Handle in main app
.onOpenURL { url in /* parse and navigate */ }
```

## Second Mind Widget Ideas

| Widget | Family | Content |
|--------|--------|---------|
| Next Todo | Small | Top priority todo from `items` (sub_category='todo') |
| Today's Schedule | Medium | Upcoming scheduled items from circular timeline |
| Todo Count | accessoryCircular | Number of incomplete todos |
| Next Event | accessoryRectangular | Next scheduled item title + time |
| Quick Capture | Medium (interactive) | Text field to create new item directly |

Data source: Supabase via App Groups shared container or direct API call in timeline provider.

---

## Live Activities (ActivityKit)

### Define Attributes

```swift
import ActivityKit

struct DeliveryAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var status: String
        var estimatedArrival: Date
    }
    var orderNumber: String
}
```

### Start / Update / End

```swift
// Start
let activity = try Activity.request(
    attributes: attributes,
    content: ActivityContent(state: initialState, staleDate: nil),
    pushType: .token
)

// Update
await activity.update(ActivityContent(state: newState, staleDate: nil))

// End (keep visible 1 hour)
await activity.end(ActivityContent(state: finalState, staleDate: nil),
                   dismissalPolicy: .after(.now + 3600))
```

### UI (Lock Screen + Dynamic Island)

```swift
struct DeliveryLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DeliveryAttributes.self) { context in
            // Lock Screen banner
            HStack {
                Text(context.state.status).font(.headline)
                Spacer()
                Text(context.state.estimatedArrival, style: .timer)
            }.padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) { Text(context.state.status) }
            } compactLeading: {
                Image(systemName: "bag.fill")
            } compactTrailing: {
                Text(context.state.estimatedArrival, style: .timer)
            } minimal: {
                Image(systemName: "bag.fill")
            }
        }
    }
}
```
