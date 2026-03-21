---
name: watchos
description: Build Apple Watch companion apps with watchOS. Use when adding Watch targets, complications, Watch Connectivity sync, or Digital Crown interactions.
user-invocable: true
argument-hint: [watch feature description]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# watchOS Companion App

Feature: $ARGUMENTS

## Setup

Add watchOS target: File > New > Target > watchOS > App.
Share code via a shared Swift Package or framework target.

## Entry Point

```swift
@main
struct MyWatchApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}
```

## Watch Connectivity (Sync with iPhone)

```swift
import WatchConnectivity

class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchConnectivityManager()
    @Published var receivedData: [String: Any] = [:]

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(_ message: [String: Any]) {
        guard WCSession.default.isReachable else {
            WCSession.default.transferUserInfo(message)  // background delivery
            return
        }
        WCSession.default.sendMessage(message, replyHandler: nil)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { self.receivedData = message }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
    #endif
}
```

## Complications (WidgetKit)

```swift
import WidgetKit
import SwiftUI

struct WatchComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.app.complication", provider: ComplicationProvider()) { entry in
            ComplicationView(entry: entry)
        }
        .configurationDisplayName("My Complication")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}
```

## Second Mind Watch App Ideas

A watchOS companion for Second Mind could show:
- **Glanceable todos** — top 3-5 items from `items` where `sub_category = 'todo'`
- **Quick capture** — dictate a note, sent to Supabase as a new `item`
- **Today's schedule** — items with scheduled times from the circular timeline
- **Habit check-in** — tap to mark today's `habit_entries`
- **Complication** — show pending todo count or next scheduled item

Sync via Watch Connectivity or direct Supabase calls from the watch.

## Design Guidelines

- Keep interactions under 2 seconds
- Digital Crown for scrolling and value input
- Haptic feedback: `WKInterfaceDevice.current().play(.click)`
- Large tap targets (minimum 38pt)
- Limit text — show glanceable data
- Use `.navigationBarTitleDisplayMode(.inline)`
- Support Always-On Display with `TimelineView`
