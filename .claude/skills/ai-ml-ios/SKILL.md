---
name: ai-ml-ios
description: AI and machine learning on iOS — Core ML, Vision, NaturalLanguage, and cloud AI (OpenAI, Anthropic). Use when adding on-device ML or cloud AI features to an iOS app.
user-invocable: true
argument-hint: [AI feature description]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# AI & Machine Learning on iOS

Feature: $ARGUMENTS

## Framework Decision Guide

| Task | Framework | On-Device? |
|------|-----------|-----------|
| Image classification | Vision + Core ML | Yes |
| Object detection | Vision + Core ML | Yes |
| Text recognition (OCR) | Vision | Yes |
| Face detection | Vision | Yes |
| Natural language (sentiment, NER) | NaturalLanguage | Yes |
| Text generation (LLM) | Cloud API | No |
| Speech to text | Speech framework | Yes |
| Translation | Translation framework | Yes (iOS 17.4+) |
| Sound classification | SoundAnalysis | Yes |
| Custom model training | Create ML | Yes (Mac) |

## Core ML Integration

```swift
import CoreML
let config = MLModelConfiguration()
config.computeUnits = .all  // Neural Engine + GPU + CPU
let model = try MyCustomModel(configuration: config)
let prediction = try model.prediction(input: inputData)
```

## Vision — Image Classification

```swift
func classifyImage(_ image: CGImage) async throws -> [VNClassificationObservation] {
    let model = try VNCoreMLModel(for: MobileNetV2().model)
    return try await withCheckedThrowingContinuation { continuation in
        let request = VNCoreMLRequest(model: model) { request, error in
            if let error { continuation.resume(throwing: error); return }
            continuation.resume(returning: request.results as? [VNClassificationObservation] ?? [])
        }
        request.imageCropAndScaleOption = .centerCrop
        try? VNImageRequestHandler(cgImage: image).perform([request])
    }
}
```

## Vision — Text Recognition (OCR)

```swift
func recognizeText(in image: CGImage) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
        let request = VNRecognizeTextRequest { request, error in
            if let error { continuation.resume(throwing: error); return }
            let text = (request.results as? [VNRecognizedTextObservation])?
                .compactMap { $0.topCandidates(1).first?.string }
                .joined(separator: "\n") ?? ""
            continuation.resume(returning: text)
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        try? VNImageRequestHandler(cgImage: image).perform([request])
    }
}
```

## NaturalLanguage

```swift
import NaturalLanguage

// Sentiment: -1.0 (negative) to 1.0 (positive)
func analyzeSentiment(_ text: String) -> Double {
    let tagger = NLTagger(tagSchemes: [.sentimentScore])
    tagger.string = text
    let (tag, _) = tagger.tag(at: text.startIndex, unit: .paragraph, scheme: .sentimentScore)
    return Double(tag?.rawValue ?? "0") ?? 0
}

// Named entity recognition
func extractEntities(_ text: String) -> [(String, NLTag)] {
    let tagger = NLTagger(tagSchemes: [.nameType])
    tagger.string = text
    var entities: [(String, NLTag)] = []
    tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .nameType) { tag, range in
        if let tag, tag != .other { entities.append((String(text[range]), tag)) }
        return true
    }
    return entities
}
```

## Cloud AI — Anthropic Claude

```swift
struct ClaudeService {
    private let apiKey: String  // From Keychain, NEVER hardcode
    private let baseURL = "https://api.anthropic.com/v1/messages"

    func sendMessage(_ content: String, systemPrompt: String? = nil) async throws -> String {
        var request = URLRequest(url: URL(string: baseURL)!)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = [
            "model": "claude-sonnet-4-5-20250514", "max_tokens": 1024,
            "messages": [["role": "user", "content": content]]
        ]
        if let systemPrompt { body["system"] = systemPrompt }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(ClaudeResponse.self, from: data)
        return response.content.first?.text ?? ""
    }
}
```

## Second Mind AI Integration

For a native iOS Second Mind app, reuse the existing `ai-assistant` edge function rather than calling AI APIs directly:

```swift
// Call the existing Supabase edge function
let response: AIResponse = try await supabase.functions.invoke(
    "ai-assistant",
    options: .init(body: [
        "action": "organize",       // or "suggest", "rewrite", "journal-prompts", "semantic-search"
        "content": capturedText,
        "userId": currentUserId
    ])
)
```

This matches the web app's `useAI` hook pattern in `src/hooks/useAI.ts`.

## Best Practices

- Run ML inference off main thread (async/await)
- Use `.all` compute units for Neural Engine
- Cache model instances — don't reload per prediction
- Store API keys in Keychain, never in source code
- Provide offline fallback for cloud AI features
- Use on-device AI when possible for privacy and speed
