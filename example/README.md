# Coiliiot Sense SDK Demo

A minimal React Native app demonstrating `@coiliiot/sense-sdk` end to end:
sign in → provision a gateway over BLE → register it → claim a sensor →
read its latest data. This targets Coiliiot's **staging** sandbox
(`coiliiot-sense-staging`), not production — nothing here touches real
customer data.

All the actual logic lives in the SDK package
(`../sense-mobile/packages/coiliiot-sense-sdk`); this app is just a thin
UI wrapper around its five functions plus sign-in, in [App.tsx](App.tsx).

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
works. `android/settings.gradle` picks this up automatically; if the key
isn't set, it falls back to plain `node` on the default PATH.

## What hasn't been verified

This project was scaffolded and typechecked (`npx tsc --noEmit` passes
against the real installed SDK), and its dependencies install cleanly, but
it has not actually been built or run — the environment this was built in
has an unresolved Xcode/CocoaPods codegen issue unrelated to this project's
code. First real build is the first real test of the "no native Firebase
config needed" assumption above, and of BLE provisioning end to end.

Also worth noting: this project's `engines.node` requires Node ≥22, while
`sense-mobile` itself pins to whatever's currently installed (`node -v`
showed v20.19.4 when this was scaffolded) — check `node -v` before running
`npm start`, since a version mismatch here is a plausible first thing to
hit.
