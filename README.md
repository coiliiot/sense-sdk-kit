# sense-sdk-kit

Everything an OEM partner needs to build on the Coiliiot Sense platform:
BLE gateway provisioning, gateway/sensor registration, and reading sensor
data, backed by Coiliiot's staging sandbox (`coiliiot-sense-staging`), not
production.

This repo ships **compiled** SDKs and full documentation, not source —
see each platform's own README for install/usage details and its own
demo app to copy from freely.

## React Native

<img src="docs/demo.gif" alt="RN example app: sign in, scan, provision, register, claim sensors" width="320">

- **[`react-native/sdk/`](react-native/sdk)** — compiled JS + type
  declarations (`lib/`), the packed installable tarball, and the full
  [API README](react-native/sdk/README.md). No TypeScript source.
- **[`react-native/example/`](react-native/example)** — a complete,
  buildable reference app. See
  [`react-native/example/README.md`](react-native/example/README.md) for
  setup, the test account, and troubleshooting.

## Android

- **[`android/sdk/`](android/sdk)** — the compiled `.aar` and the full
  [API README](android/sdk/README.md). No Kotlin source.
- **[`android/demo/`](android/demo)** — a complete, buildable native
  Kotlin/Compose reference app exercising the same flow as the RN
  example. See [`android/demo/README.md`](android/demo/README.md) for
  setup, the test account, and what hasn't been verified yet (no
  Bluetooth hardware or emulator was available where this was built —
  see that README before relying on it).

This is for OEM partners building a native (or Kotlin Multiplatform)
Android app instead of React Native — a native Android library plugs
into a KMP app directly, with no bridge needed.

## iOS

Not yet available.

## Distribution

Each platform ships from a [GitHub Release](../../releases) with its
compiled artifact attached, so you don't need repo tree access to grab a
copy — see each platform's own README for the exact install command.
