# CoiliiotSenseSDK (iOS)

A minimal SDK for integrating with the Coiliiot Sense platform: BLE
gateway provisioning, gateway/sensor registration, and reading sensor
data. This is a sandbox SDK backed by Coiliiot's staging environment —
not production, and not the full Coiliiot Sense app or cloud.

A working reference app using every function below lives in the sibling
[`demo/`](../demo) directory of this repo.

## Install

Download and unzip `CoiliiotSenseSDK-0.2.0.xcframework.zip` from the
[latest release](https://github.com/coiliiot/sense-sdk-kit/releases/latest),
then drag `CoiliiotSenseSDK.xcframework` into your Xcode project (or add
it under your target's **Frameworks, Libraries, and Embedded Content**,
set to **Embed & Sign**). That's it — **no peer dependencies to add**.
Unlike the Android/React Native SDKs, this framework has Firebase
compiled in already, so there's nothing else to declare.

Minimum iOS 15.0.

### If your app also uses Firebase for something else

This framework statically embeds its own private copy of Firebase's
Objective-C classes (`FIRApp`, `FIRAuth`, `FIRFirestore`, ...). If your
own app separately links Firebase too — for your own login, analytics,
push notifications, anything — you'll get duplicate-class errors at
launch ("Class FIRApp is implemented in both X and Y"). Talk to
Coiliiot before integrating this SDK if that's your situation; there are
ways to handle it, but they need to be set up specifically for your app.

## Usage

```swift
import CoiliiotSenseSDK

// 1. Initialize once, with the config Coiliiot gives you for the sandbox
//    project. A good place is your App's init() or AppDelegate.
SenseSdk.initSdk(config: SenseSdkConfig(
    apiKey: "...",
    appId: "...",
    projectId: "coiliiot-sense-staging",
    databaseURL: "https://coiliiot-sense-staging-default-rtdb.firebaseio.com",
    messagingSenderId: "..." // required, despite the name — Firebase rejects init without it
))

// 2. Sign in with the test account Coiliiot created for you.
//    There is no sign-up — accounts are provisioned per OEM, not self-serve.
let user = try await signIn(email: "your-test-account@example.com", password: "password")

// 2a. Restore whatever this user already registered — nothing else in the
//     SDK remembers this locally, so call this on every sign-in (not just
//     the first) and use it to skip straight past steps 4-7 for gateways
//     that already exist.
let stopListeningForGateways = try listenForGateways { gateways in
    print("already registered: \(gateways)")
}

// 3. Add NSBluetoothAlwaysUsageDescription to your own Info.plist before
//    scanning — see "Why scanForGateways() doesn't need a permission
//    request call" below.

// 4. Scan for gateways in BLE range. Every RG-RW10 unit advertises the same
//    name, so if more than one is nearby, this list — updated live as each
//    is found — is the only way to tell them apart (e.g. by signal
//    strength). Stops automatically after 3s; call again to restart.
let stopScan = scanForGateways(
    onUpdate: { devices in print("found so far: \(devices)") }, // [DiscoveredGateway]
    onError: { error in print("scan error: \(error)") },
    onEnd: { print("scan finished") }
)

// 5. Connect to the one the user picked. No WiFi credentials are sent yet.
try await connectToGateway("AABBCCDDEEFF")

// 6. Send WiFi credentials to the connected gateway and wait for it to
//    reach the cloud.
try await sendWifiCredentials("AABBCCDDEEFF", ssid: "my-wifi-ssid", password: "my-wifi-password") { stage in
    print("provisioning: \(stage)") // .wifiOk, .ok, .wifiFail, or .serverFail
}
// A .wifiFail rejection means the connection is still open — call
// sendWifiCredentials() again with corrected credentials. A .serverFail
// rejection means the gateway is rebooting and the connection is gone —
// scan and connect again once it's back.

// 7. Claim the gateway for your account.
let gateway = try await registerGateway("AABBCCDDEEFF")

// 8. Watch for sensors under the gateway — every sensor shows up here,
//    tagged is_registered, not just unclaimed ones:
let stopListening = try listenForSensors("AABBCCDDEEFF") { sensors in
    let unclaimed = sensors.filter { !$0.is_registered }
    print("sensors not yet claimed: \(unclaimed)")
}

// 9. Claim one.
try await registerSensor(gatewayId: "AABBCCDDEEFF", sensorId: "1122334455")

// 10. Read its latest value (works the same whether claimed or not).
let reading = try await getLatestSensorData(gatewayId: "AABBCCDDEEFF", sensorId: "1122334455")
print(reading) // LatestSensorData(last_seen:, current_data: [temperature:, humidity:, ...], rssi:, battery:)
```

### Undoing things

- `disconnectFromGateway(gatewayId)` — disconnect before sending credentials, if you change your mind.
- `removeGateway(gatewayId)` — releases the gateway and every sensor currently registered under it.
- `unregisterSensor(gatewayId:sensorId:)` — releases a single sensor; its history is kept, not deleted.

## What this SDK does not do

No historical/aggregated data beyond the latest reading, no alerts or
notifications, no firmware OTA control, no fleet management, no access to
the hardware catalog beyond what's needed to label a sensor's own
readings. If you need any of that, talk to Coiliiot about your own
backend integration.

## Why `scanForGateways()` doesn't need a permission request call

Unlike Android, iOS has no separate runtime-permission API to call before
using Bluetooth — CoreBluetooth triggers the system permission prompt
itself, the first time you actually try to scan, as long as your app's
own Info.plist declares `NSBluetoothAlwaysUsageDescription` (a plain
string describing why). Add that key to your own app's Info.plist; there
is nothing to call beforehand the way Android's demo requests
`BLUETOOTH_SCAN`/`ACCESS_FINE_LOCATION` from its own Activity.

## Why there's no `pairSensor()`

Sensors and gateways don't know anything about ownership — a sensor just
transmits (on its own schedule, or immediately if you hold its button),
and any gateway in range relays whatever it hears. Ownership is decided
entirely by which account calls `registerSensor()`. `listenForSensors`
just reflects what's already arrived, tagged with whether anyone's
claimed it yet.

## Why gateway ids come from `scanForGateways`, not the BLE connection itself

CoreBluetooth's own device identifier (`CBPeripheral.identifier`) is a
platform/session-scoped UUID — it's not the gateway's real hardware id,
and nothing else in the system ever sees it. `scanForGateways` decodes
the actual gateway id from the advertisement's manufacturer data, the
same way the main Coiliiot Sense app and the other two SDKs do, so the id
you get here is the same one you'd see anywhere else — and the one
`registerGateway()` expects.
