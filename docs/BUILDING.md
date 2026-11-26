# Build Caissa

## Android

Requirements: JDK 17 or 21, Python 3, Android SDK Platform 35 and Build Tools 35.0.0.
Set `ANDROID_HOME`, or put the SDK path in your local `local.properties`:

```properties
sdk.dir=/path/to/android-sdk
```

Download the two official Stockfish 19 Android engines, then build:

```sh
python tools/fetch-engines.py
./gradlew :app:assembleDebug
```

On Windows, use `gradlew.bat :app:assembleDebug` instead. The wrapper uses
Gradle 8.9 and verifies the distribution checksum. The engine script verifies
the official archive checksums and ELF architecture before writing files.

APKs appear in `app/build/outputs/apk/debug/`:

- `app-arm64-v8a-debug.apk`
- `app-armeabi-v7a-debug.apk`

Minimum Android version: 7.0 / API 24. The application ID remains
`com.fisher.chess`, so Caissa can update an earlier Fisher installation.
Release downloads currently use a debug certificate; a local build uses your
own debug keystore and may require uninstalling a differently signed APK.

Engine binaries are intentionally absent from Git. Their upstream release,
source and license are available here:

- [Stockfish 19 Android binaries](https://github.com/official-stockfish/Stockfish/releases/tag/sf_19)
- [Matching Stockfish source](https://github.com/official-stockfish/Stockfish/tree/sf_19)
- [Stockfish license](../assets/web/licenses/Copying.txt)

## Browser preview

Requires Node.js 22+ and a desktop Stockfish executable. Set `STOCKFISH` to its
path, then run:

```sh
node tools/dev-server.js
```

Open `http://127.0.0.1:8765`. The server binds only to the local machine.
If `STOCKFISH` is unset, it looks for `stockfish` on `PATH`.

PowerShell example:

```powershell
$env:STOCKFISH = 'C:/tools/stockfish/stockfish.exe'
node tools/dev-server.js
```

## Checks

```sh
node tests/run.js
node tests/game-session.js
node tests/sounds.js
node tests/i18n.js
node tests/opening-lessons.js
node tests/openings-english.js
node tests/opening-explorer.js
node tests/opening-explorer152.js
node tests/opening-review.js
node tests/review-regression.js
node tests/review-pipeline.js
node tests/engine-queue.js
node tests/engine-strength.js
node tests/game-session.js
node tests/appearance.js
node tests/trainer.js
node tests/puzzle-provider.js
node tests/bot-timing.js
node tests/updates.js
# Optional: REAL_STOCKFISH=1 STOCKFISH=/path/to/stockfish node tests/trainer-engine.js
python tests/fetch-engines.py
```

Browser tests require Edge or Chrome; override its path with `BROWSER`:

```sh
node tests/ui-smoke.js
node tests/board-caissa.js
node tests/ux150.js
node tests/ux151.js
node tests/appearance151-ui.js
node tests/ux152.js
node tests/i18n.js --browser
```

The UI suite uses a deterministic engine stub. `tests/engine-smoke.js`,
`tests/server-smoke.js` and `tests/native-smoke.ps1` use a real desktop engine.
The native smoke test needs compiled Android classes first.

## Structure

- `assets/web/`: chess rules, screens, board, analysis, sound and RU/EN data.
- `app/src/main/`: Kotlin WebView host, UCI process, file picker, insets and haptics.
- `tools/`: engine setup, local server and opening-data builders.
- `tests/`: rules, analysis, audio, translations, UCI and real touch regressions.

The Android host has no AndroidX dependencies. The web interface uses ES2015
without a bundler or npm packages. Stockfish searches share one native process.


Icon source: `docs/branding/caissa-01.svg`. The launcher PNGs are committed;
rebuilding them optionally requires Pillow and a Chromium browser:

```sh
python -m pip install Pillow
node tools/render-caissa-icon.js
python tests/icon-check.py
```
