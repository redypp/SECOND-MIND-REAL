---
name: supabase-ios
description: Supabase Swift SDK integration for iOS apps. Use when connecting a native iOS app to Supabase for auth, database, realtime, storage, or edge functions. Especially relevant for building a native Second Mind iOS app.
user-invocable: true
argument-hint: [Supabase feature description]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Supabase iOS Integration

Feature: $ARGUMENTS

## Setup

Add via SPM: `https://github.com/supabase/supabase-swift`

```swift
import Supabase

// Store in .xcconfig (not source code)
let supabase = SupabaseClient(
    supabaseURL: URL(string: Secrets.supabaseURL)!,
    supabaseKey: Secrets.supabaseAnonKey
)
```

## Authentication

```swift
@Observable
class AuthManager {
    var session: Session?
    var isAuthenticated: Bool { session != nil }

    func signUp(email: String, password: String) async throws {
        try await supabase.auth.signUp(email: email, password: password)
    }
    func signIn(email: String, password: String) async throws {
        session = try await supabase.auth.signIn(email: email, password: password)
    }
    func signInWithApple(idToken: String, nonce: String) async throws {
        session = try await supabase.auth.signInWithIdToken(
            credentials: .init(provider: .apple, idToken: idToken, nonce: nonce)
        )
    }
    func signOut() async throws {
        try await supabase.auth.signOut()
        session = nil
    }
    func observeAuthChanges() async {
        for await (_, session) in supabase.auth.authStateChanges {
            self.session = session
        }
    }
}
```

## Second Mind Database Models

Mirror the web app's types from `src/types/index.ts`:

```swift
struct SMSpace: Codable, Identifiable {
    let id: UUID
    let userId: UUID
    var name: String
    var image: String?
    var color: String?
    var isPinned: Bool
    var isDeleted: Bool
    var version: Int
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, image, color, version
        case userId = "user_id"
        case isPinned = "is_pinned"
        case isDeleted = "is_deleted"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct SMItem: Codable, Identifiable {
    let id: UUID
    let userId: UUID
    var title: String?
    var blocks: [ContentBlock]  // JSONB — matches web app's ContentBlock union
    var subCategory: String     // "scheduling", "notes", "todo", "misc"
    var spaceIds: [UUID]
    var color: String?
    var canvasX: Double?
    var canvasY: Double?
    var version: Int
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, blocks, color, version
        case userId = "user_id"
        case subCategory = "sub_category"
        case spaceIds = "space_ids"
        case canvasX = "canvas_x"
        case canvasY = "canvas_y"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
```

## CRUD Operations

```swift
// Fetch spaces
let spaces: [SMSpace] = try await supabase
    .from("spaces").select()
    .eq("user_id", value: userId)
    .eq("is_deleted", value: false)
    .order("updated_at", ascending: false)
    .execute().value

// Fetch items
let items: [SMItem] = try await supabase
    .from("items").select()
    .eq("user_id", value: userId)
    .order("created_at", ascending: false)
    .execute().value

// Insert
try await supabase.from("items").insert(newItem).execute()

// Update (with version bump for conflict resolution)
try await supabase.from("items")
    .update(["title": newTitle, "version": currentVersion + 1])
    .eq("id", value: itemId).execute()

// Soft delete
try await supabase.from("spaces")
    .update(["is_deleted": true])
    .eq("id", value: spaceId).execute()
```

## Realtime Subscriptions

```swift
func subscribeToItems() async {
    let channel = supabase.realtime.channel("public:items")
    let changes = channel.postgresChange(InsertAction.self, schema: "public", table: "items",
                                          filter: "user_id=eq.\(userId)")
    await channel.subscribe()
    Task {
        for await insertion in changes {
            let newItem = try? insertion.decodeRecord(as: SMItem.self)
            // Add to local array
        }
    }
}
```

## Storage (Image Uploads)

Second Mind uses the `user-images` bucket:

```swift
func uploadImage(_ data: Data, path: String) async throws -> String {
    try await supabase.storage.from("user-images")
        .upload(path: "\(userId)/\(path)", file: data, options: .init(contentType: "image/jpeg"))
    return try supabase.storage.from("user-images")
        .getPublicURL(path: "\(userId)/\(path)").absoluteString
}
```

## Edge Functions

Call the existing Second Mind edge functions:

```swift
// AI assistant
let response: AIResponse = try await supabase.functions.invoke(
    "ai-assistant", options: .init(body: ["action": "organize", "content": text])
)

// Import source
let imported: ImportResponse = try await supabase.functions.invoke(
    "import-source", options: .init(body: ["url": sourceUrl])
)
```

## Offline Sync Pattern

Match the web app's sync approach (`src/lib/syncQueue.ts`):

1. Use SwiftData as local cache (mirrors `src/lib/localCache.ts`)
2. Queue mutations when offline
3. Replay on reconnect with version-based conflict resolution
4. Monitor network with `NWPathMonitor`

## RLS Policies

All tables use `auth.uid() = user_id` — the Supabase client handles this automatically when the user is authenticated.
