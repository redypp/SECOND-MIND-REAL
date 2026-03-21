---
name: homekit
description: HomeKit & Matter smart home integration for iOS apps. Use when building smart home controls, accessory discovery, scenes, automations, or Matter device support.
user-invocable: true
argument-hint: [smart home feature description]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# HomeKit & Matter Smart Home

Feature: $ARGUMENTS

## Setup

1. Enable HomeKit capability: Target > Signing & Capabilities > + HomeKit
2. Add `NSHomeKitUsageDescription` to Info.plist
3. For Matter: enable Matter Allow Setup Payload capability

## Architecture

```swift
import HomeKit

@Observable
class HomeManager: NSObject, HMHomeManagerDelegate {
    var homes: [HMHome] = []
    var primaryHome: HMHome?
    var accessories: [HMAccessory] = []
    private let manager = HMHomeManager()

    override init() {
        super.init()
        manager.delegate = self
    }

    func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        homes = manager.homes
        primaryHome = manager.primaryHome
        accessories = primaryHome?.accessories ?? []
    }
}
```

## Controlling Accessories

```swift
// Lights — toggle and brightness
func toggleLight(_ accessory: HMAccessory, on: Bool) async throws {
    guard let service = accessory.services.first(where: { $0.serviceType == HMServiceTypeLightbulb }),
          let powerChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypePowerState })
    else { return }
    try await powerChar.writeValue(on)
}

func setBrightness(_ accessory: HMAccessory, level: Int) async throws {
    guard let service = accessory.services.first(where: { $0.serviceType == HMServiceTypeLightbulb }),
          let char = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeBrightness })
    else { return }
    try await char.writeValue(level)
}

// Thermostat
func setTemperature(_ accessory: HMAccessory, temp: Double) async throws {
    guard let service = accessory.services.first(where: { $0.serviceType == HMServiceTypeThermostat }),
          let char = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetTemperature })
    else { return }
    try await char.writeValue(temp)
}

// Lock
func setLockState(_ accessory: HMAccessory, locked: Bool) async throws {
    guard let service = accessory.services.first(where: { $0.serviceType == HMServiceTypeLockMechanism }),
          let char = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetLockMechanismState })
    else { return }
    let state = locked ? HMCharacteristicValueLockMechanismState.secured.rawValue
                       : HMCharacteristicValueLockMechanismState.unsecured.rawValue
    try await char.writeValue(state)
}
```

## Scenes & Automations

```swift
func createScene(name: String, actions: [(HMCharacteristic, Any)], in home: HMHome) async throws {
    let actionSet = try await home.addActionSet(withName: name)
    for (characteristic, value) in actions {
        let action = HMCharacteristicWriteAction(characteristic: characteristic, targetValue: value as! NSCopying)
        try await actionSet.addAction(action)
    }
}

func executeScene(_ actionSet: HMActionSet, in home: HMHome) async throws {
    try await home.executeActionSet(actionSet)
}
```

## Real-Time Updates

```swift
extension HomeManager: HMAccessoryDelegate {
    func accessory(_ accessory: HMAccessory, service: HMService,
                   didUpdateValueFor characteristic: HMCharacteristic) {
        // React to state changes, update UI
    }
}

func enableNotifications(for characteristic: HMCharacteristic) async throws {
    try await characteristic.enableNotification(true)
}
```

## Matter Support

Matter accessories appear through HomeKit on iOS 16+. For direct commissioning:

```swift
import MatterSupport
let request = MatterAddDeviceRequest(topology: .init(ecosystemName: "MyApp", homes: []))
try await request.perform()
```

## Accessory Types

| Type | Service Constant | Key Characteristics |
|------|-----------------|-------------------|
| Light | `HMServiceTypeLightbulb` | Power, Brightness, Hue, Saturation |
| Thermostat | `HMServiceTypeThermostat` | CurrentTemp, TargetTemp, Mode |
| Lock | `HMServiceTypeLockMechanism` | CurrentState, TargetState |
| Garage | `HMServiceTypeGarageDoorOpener` | CurrentState, TargetState |
| Sensor | `HMServiceTypeTemperatureSensor` | CurrentTemp |
| Fan | `HMServiceTypeFan` | Power, Speed, Direction |
| Window | `HMServiceTypeWindowCovering` | CurrentPosition, TargetPosition |
