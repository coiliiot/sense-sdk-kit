# Coiliiot Sense SDK Demo (iOS)

A minimal native iOS app demonstrating `CoiliiotSenseSDK` end to end: sign
in → scan → provision a gateway over BLE → register it → claim a sensor →
read its latest data. This targets Coiliiot's **staging** sandbox
(`coiliiot-sense-staging`), not production — nothing here touches real
customer data. Same flow as the React Native and Android demos in
[`sense-sdk-kit/react-native/demo`](../../react-native/demo) and
[`sense-sdk-kit/android/demo`](../../android/demo), rebuilt natively in
SwiftUI.

All the actual logic lives in the SDK (`../sdk`); this app is a thin
SwiftUI wrapper around its functions —
[`DemoViewModel.swift`](SenseSDKDemo/DemoViewModel.swift) holds the state
and calls the SDK, and
[`ContentView.swift`](SenseSDKDemo/ContentView.swift) just renders it,
mirroring the other two demos' structure/interaction model (per-action
busy state, per-row status, a separate "claimed sensors" section with a
cached last-read display) fairly closely, not just their feature list.

## Setup

Open `SenseSDKDemo.xcodeproj` in Xcode. The SDK is referenced directly
from `../sdk/CoiliiotSenseSDK.xcframework` — already wired up as a
framework dependency, nothing to install separately, and no other
package (Firebase included) needs to be added: it's compiled into the
`.xcframework` already.

If you ever need to regenerate the Xcode project — e.g. after changing
`project.yml` — this repo doesn't require it for a normal build, but the
project was generated with [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```sh
xcodegen generate
```

## Test account

There's no self-serve sign-up — sandbox accounts are provisioned
individually per OEM. Coiliiot will give you a test account's email and
password separately; enter them on the app's sign-in screen.

## Run

From Xcode: pick a Simulator or your own device as the run destination
and hit **Run**. A physical device needs your own Apple Developer Team
selected in **Signing & Capabilities** first — `CODE_SIGN_STYLE:
Automatic` handles provisioning profile selection from there.

## Before BLE provisioning will actually do anything

You need a physical Coiliiot RG-RW10 gateway already flashed with
firmware pointed at `coiliiot-sense-staging` (not the default production
build). A gateway running production firmware will never appear to have
provisioned successfully against this app, since it's talking to a
different Firebase project entirely.

Tapping "Scan for Gateways" triggers iOS's Bluetooth permission prompt —
this happens automatically the first time the app touches CoreBluetooth,
as long as `Info.plist` declares `NSBluetoothAlwaysUsageDescription`
(already set here). See [`../sdk/README.md`](../sdk/README.md)'s "Why
`scanForGateways()` doesn't need a permission request call" for how this
differs from Android.

## A design choice worth knowing about

Like the other two SDKs, this app never registers a "default" Firebase
app — no `GoogleService-Info.plist`. `SenseSdk.initSdk()` creates its own
**named** Firebase app instance directly from the config object in
`DemoViewModel.swift`, which is the whole point of that design — it
doesn't need a native app registration tied to this project's bundle ID.
This is also why the SDK can safely embed its own private copy of
Firebase inside the `.xcframework` without colliding with anything this
demo app does — see the SDK README's note on that if your own app
integrates Firebase for something else.

## What's been verified on real hardware

The full flow — sign in, scan, connect, send WiFi credentials, register
gateway, claim a sensor, read a live reading, remove and re-register a
gateway — has been run end to end on a real device against a real RG-RW10
gateway and completed successfully, including against the compiled
`.xcframework` this app actually ships against (not just the SDK's source
during development).

That real-device pass surfaced two real SDK bugs, both fixed at the
source (in `sense-sdk`, before this artifact was built) rather than
worked around here:

- **Sensor readings always came back empty**: Firebase's
  `DatabaseReference.getData() async throws` API returned the wrong
  node's data — specifically the value from an ancestor path that already
  had an active `.observe(.value)` listener attached, while still
  reporting the correct key/URL for the path actually requested. Fixed by
  routing every one-shot RTDB read through a manual
  `observeSingleEvent(of: .value)` bridge instead of trusting the async
  wrapper.
- **Removing and re-registering a gateway got stuck in a loop**: the
  physical gateway writes its own status directly to the same RTDB path
  the app manages, independent of app-level registration state. Right
  after removing a gateway, the hardware's next reconnect recreated a
  bare node there with no `gateway_id` field — which `listenForGateways`
  was treating as a real (if empty) gateway, so the app's
  restore-on-sign-in logic could never tell "restored, but empty" apart
  from "haven't restored yet," and re-triggered forever. Fixed by
  filtering out any entry with no `gateway_id`.

## Known limitation: state and process death

State lives in `DemoViewModel` (an `ObservableObject`), which survives
ordinary SwiftUI view recreation — but not the OS killing the app's
process outright while backgrounded, which iOS does fairly aggressively.
A live BLE/GATT connection can't survive that regardless of where UI
state lives — it's gone the moment the process is, and the only real fix
is reconnecting, same as the Android/RN apps would need after their own
process restarted. If you hit this, that's expected; a fresh scan/connect
picks back up from where you left off.
