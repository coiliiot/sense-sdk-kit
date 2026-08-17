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

<img src="docs/demo.gif" alt="Example app: sign in, scan, provision, register, claim sensors" width="320">

## Setup

The example app depends on the SDK the same way any consumer would —
installed from the tarball in `sdk/`, already wired up in
`example/package.json`:

```json
"@coiliiot/sense-sdk": "file:../sdk/coiliiot-sense-sdk-0.1.0.tgz"
```

This points at a `.tgz` file, not a folder, so npm extracts real files
into `node_modules` instead of symlinking — the same thing that happens
when installing from a registry or a release URL. (Earlier versions of
this repo pointed at the `sdk/` folder directly, which npm symlinks; that
tripped up Metro, which doesn't resolve symlinks outside its project root
by default. Since this repo is the thing OEM developers copy from to
start their own app, we'd rather the example not model a pattern that
breaks for anyone who reuses it as-is.)

```sh
cd example
npm install
```

iOS also needs CocoaPods, from `example/`:

```sh
bundle install
bundle exec pod install
```

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
