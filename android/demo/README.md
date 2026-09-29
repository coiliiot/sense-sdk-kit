# Coiliiot Sense SDK Demo (Android)

A minimal native Android app demonstrating `@coiliiot/sense-sdk` end to
end: sign in → scan → provision a gateway over BLE → register it → claim
a sensor → read its latest data. This targets Coiliiot's **staging**
sandbox (`coiliiot-sense-staging`), not production — nothing here touches
real customer data. Same flow as the React Native demo in
[`sense-sdk-kit/example`](../../example), rebuilt natively.

All the actual logic lives in the SDK (`../sdk`); this app is a thin
Jetpack Compose UI wrapper around its functions, in
[`MainActivity.kt`](app/src/main/kotlin/com/coiliiot/sensesdkdemo/MainActivity.kt).

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
SDK's (see `sdk/README.md`'s "Why `scanForGateways()` doesn't request
permissions itself").

## A design choice worth knowing about

Like the RN SDK, this app never registers a "default" Firebase app — no
`google-services.json`, and the Google Services Gradle plugin isn't
applied at all. `SenseSdk.init()` creates its own **named** Firebase app
instance directly from the config object in `MainActivity.kt`, which is
the whole point of that design — it doesn't need a native app
registration tied to this project's package name.

## What hasn't been verified

This has been built and its manifest inspected (confirming the SDK's
Bluetooth permissions and Firebase's internal activities all merge in
correctly), but it has **not been run on a real device or emulator** —
no Android emulator or connected device was available in the environment
this was built in. First real run is the first real test of BLE
scanning/provisioning end to end, and of the "no native Firebase config
needed" assumption above holding up at runtime, not just at build time.
