# Coiliiot Sense SDK Demo

A minimal React Native app demonstrating `@coiliiot/sense-sdk` end to end:
sign in → provision a gateway over BLE → register it → claim a sensor →
read its latest data. This targets Coiliiot's **staging** sandbox
(`coiliiot-sense-staging`), not production — nothing here touches real
customer data.

All the actual logic lives in the SDK package (`../sdk`); this app is
just a thin UI wrapper around its functions plus sign-in, in
[App.tsx](App.tsx).

## Setup

```sh
npm install
```

iOS also needs CocoaPods:

```sh
bundle install    # first time only
bundle exec pod install
```

## Test account

There's no self-serve sign-up — sandbox accounts are provisioned
individually per OEM. Coiliiot will give you a test account's email and
password separately; enter them on the app's sign-in screen.

## Run

```sh
npm start          # Metro, in one terminal
npm run ios        # or: npm run android
```

## Before BLE provisioning will actually do anything

You need a physical Coiliiot RG-RW10 gateway already flashed with firmware
pointed at `coiliiot-sense-staging` (not the default production build) —
see `Sense-RG-RW10-firmware`. A gateway running production firmware will
never appear to have provisioned successfully against this app, since it's
talking to a different Firebase project entirely.

## A design choice worth knowing about

This app never registers a "default" Firebase app — no
`GoogleService-Info.plist`, no `google-services.json`, and the Android
build doesn't apply the Google Services Gradle plugin at all. The SDK's
`initSdk()` creates its own **named** Firebase app instance directly from
the config object in `App.tsx`, which is the whole point of that design —
it doesn't need a native app registration tied to this project's bundle
ID/package name. This should mean zero Firebase console setup is needed
for this demo specifically, but it hasn't been verified against a real
build in this environment (see below) — if you hit a native Firebase
initialization error at runtime, the fallback is to register this app's
bundle ID (`com.coiliiot.sensesdkdemo`) as a normal app under
`coiliiot-sense-staging` and add the resulting config files back in.

## Building from Android Studio

If you open `android/` directly in Android Studio (rather than running
`npm run android` from a terminal) and the build fails with something like:

```
Cause: error=2, No such file or directory
A problem occurred starting process 'command 'npx''
```

it's because Android Studio's embedded Gradle daemon inherits a minimal
PATH that doesn't include `npx` if it's managed by nvm (or installed via
Homebrew) — even though it works fine from your terminal. Fix it by adding
this line to `android/local.properties` (already gitignored, per-machine —
not something to commit):

```
node.executable=/absolute/path/to/your/node
```

Find your path with `which node` in the terminal where `npm run android`
works. Both `android/settings.gradle` (autolinking) and
`android/app/build.gradle` (codegen, JS bundling) pick this up
automatically from the same `node.executable` key; if it isn't set, they
fall back to plain `node` on the default PATH.

If instead Android Studio refuses to sync/build with an error like:

```
The project is using an incompatible version (AGP 9.2.1) of the Android
Gradle plugin. Latest supported version is AGP 8.13.1
```

your installed Android Studio is too old for the AGP version this project
uses (React Native 0.87 bundles AGP 9.2.1 by default). Update Android
Studio via **Android Studio → Check for Updates** — no project change
needed, since the project itself already builds fine at AGP 9.2.1 from
the command line.

This project requires Node ≥22 (see `engines` in `package.json`) — check
`node -v` before running `npm start` if you hit unexplained install or
Metro errors.
