# sense-sdk-kit

Everything an OEM partner needs to build on the Coiliiot Sense platform:
BLE gateway provisioning, gateway/sensor registration, and reading sensor
data, backed by Coiliiot's staging sandbox (`coiliiot-sense-staging`), not
production.

This repo ships the **compiled** SDK and full documentation, not the SDK's
TypeScript source.

- **`sdk/`** — the SDK as OEM developers consume it: compiled JS + type
  declarations (`lib/`), the packed installable tarball
  (`coiliiot-sense-sdk-0.1.0.tgz`), and the full [API README](sdk/README.md).
  No source files.
- **`example/`** — a complete, buildable reference app exercising every
  function in the SDK: sign in, scan, connect, send WiFi credentials,
  register/remove a gateway, claim/unclaim/read sensors. Full source
  included — copy from it freely.

## Setup

The example app depends on the SDK via a local folder reference, already
wired up in `example/package.json`:

```json
"@coiliiot/sense-sdk": "file:../sdk"
```

```sh
cd example
npm install
```

iOS also needs CocoaPods, from `example/`:

```sh
bundle install
bundle exec pod install
```

That `file:../sdk` reference is a local folder link (npm symlinks it),
used only so this repo's example always builds against whatever is
currently in `sdk/`, without needing a fresh tarball on every change. It's
not how OEM consumers should install the SDK in their own app — see
"Using the SDK in your own app" below for that. The folder link is also
why `example/metro.config.js` carries extra `watchFolders` /
`resolver.nodeModulesPaths` config: Metro doesn't resolve symlinks
outside its project root by default, and a tarball install (which copies
real files instead of symlinking) wouldn't need either.

Then run the example same as any React Native app (`npm start`, then
`npm run ios` or `npm run android` in a second terminal). See
[`example/README.md`](example/README.md) for the test account and other
specifics.

## Using the SDK in your own app

Install directly from the tarball:

```sh
npm install /path/to/sense-sdk-kit/sdk/coiliiot-sense-sdk-0.1.0.tgz
```

Then follow [`sdk/README.md`](sdk/README.md) for the full API reference and
usage walkthrough.
