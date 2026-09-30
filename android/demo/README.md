# Coiliiot Sense SDK Demo (Android)

A minimal native Android app demonstrating `@coiliiot/sense-sdk` end to
end: sign in → scan → provision a gateway over BLE → register it → claim
a sensor → read its latest data. This targets Coiliiot's **staging**
sandbox (`coiliiot-sense-staging`), not production — nothing here touches
real customer data. Same flow as the React Native demo in
[`sense-sdk-kit/react-native/demo`](../../react-native/demo),
rebuilt natively.

All the actual logic lives in the SDK (`../sdk`); this app is a thin
Jetpack Compose UI wrapper around its functions —
[`DemoViewModel.kt`](app/src/main/kotlin/com/coiliiot/sensesdkdemo/DemoViewModel.kt)
holds the state and calls the SDK, and
[`MainActivity.kt`](app/src/main/kotlin/com/coiliiot/sensesdkdemo/MainActivity.kt)
just renders it, mirroring the RN demo's structure/interaction model
(per-action busy state, per-row status, a separate "claimed sensors"
section with a cached last-read display) fairly closely, not just its
feature list.

## Setup

Open this folder in Android Studio, or from the command line:

```sh
./gradlew :app:assembleDebug
```

The SDK is referenced directly from `../sdk/coiliiot-sense-sdk-0.1.0.aar`
— already wired up in `app/build.gradle.kts`, nothing to install
separately.

## Test account

There's no self-serve sign-up — sandbox accounts are provisioned
individually per OEM. Coiliiot will give you a test account's email and
password separately; enter them on the app's sign-in screen.

## Run

From Android Studio: **Run ▸ Run 'app'**. From the command line:

```sh
./gradlew :app:installDebug
adb shell am start -n com.coiliiot.sensesdkdemo/.MainActivity
```

## Before BLE provisioning will actually do anything

You need a physical Coiliiot RG-RW10 gateway already flashed with
firmware pointed at `coiliiot-sense-staging` (not the default production
build) — see `Sense-RG-RW10-firmware`. A gateway running production
firmware will never appear to have provisioned successfully against this
app, since it's talking to a different Firebase project entirely.

Tapping "Scan for Gateways" triggers Android's runtime permission dialog
for Bluetooth/location — this is the app's own responsibility, not the
SDK's (see [`../sdk/README.md`](../sdk/README.md)'s "Why
`scanForGateways()` doesn't request permissions itself").

The manifest also declares `BLUETOOTH_SCAN` with
`android:usesPermissionFlags="neverForLocation"`: this app identifies
gateways by the id encoded in their advertisement and uses RSSI only to
let a user pick between multiple gateways in range — it never derives
physical location from scan results. Without that flag, Android
additionally requires the device's system-wide Location Services toggle
to be on before `BLUETOOTH_SCAN` returns any results at all (API 31+),
even with the permission itself granted — a real, easy-to-hit cause of
"scan runs but finds nothing" if you're adapting this into your own
manifest.

## A design choice worth knowing about

Like the RN SDK, this app never registers a "default" Firebase app — no
`google-services.json`, and the Google Services Gradle plugin isn't
applied at all. `SenseSdk.init()` creates its own **named** Firebase app
instance directly from the config object in `MainActivity.kt`, which is
the whole point of that design — it doesn't need a native app
registration tied to this project's package name.

## What's been verified on real hardware

The full flow — sign in, scan, connect, send WiFi credentials, register
gateway, claim a sensor — has been run end to end on a real device against
a real RG-RW10 gateway and completed successfully. That's the SDK itself
validated for real, including its BLE manufacturer-data byte layout: the
gateway id `scanForGateways()` decodes from the advertisement has to come
out identical to what the id was minted from at manufacturing time, or
`registerGateway()` would reference a different gateway than the one you
scanned — something only an actual scan against real hardware can confirm,
not source review.

That same real-device pass also surfaced UI bugs no amount of build-time
verification would have caught — a couple worth calling out since they
were real, not cosmetic:

- **A layout bug that made most buttons unreadable**: a long sensor-id
  label sharing a `Row` with its "Claim"/"Unclaim" button had no
  `Modifier.weight()`, so the label greedily claimed the row's width and
  squeezed the button into a sliver narrower than a single character,
  wrapping its own label one letter per line. Fixed by weighting the
  label instead of the button in every row that pairs one with the
  other.
- **BLE scanning found nothing at all** — separately fixed, see
  `../../sense-sdk/android/README.md`'s `neverForLocation` note.

## Known limitation: state and process death

State now lives in a `ViewModel` (`DemoViewModel`), which survives
ordinary recreation — rotation, dark/light mode changes, multi-window
resize — none of which used to be survivable when state lived directly in
`MainActivity`'s Composable via plain `remember {}`. What it can't do:
survive the OS killing the app's process outright while backgrounded,
which some Android OEM skins do fairly aggressively even after a short
screen lock. A live BLE/GATT connection can't survive that regardless of
where UI state lives — it's gone the moment the process is, and the only
real fix is reconnecting, same as the RN app would need after its own JS
process restarted. If you hit this, that's expected; a fresh scan/connect
picks back up from where you left off.
