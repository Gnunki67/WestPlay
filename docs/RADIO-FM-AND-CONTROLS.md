# Radio FM, language and playback controls

## Radio FM

Radio FM integrates ETS2/ATS Local Radio inside WestPlay. It uses the truck's game coordinates to find nearby transmitters and play local internet stations. The included European database contains 2,068 transmitters and 2,116 stations.

Open **Radio FM** from Home or the Now Playing widget. Choose a station, save a favourite for a region, or let automatic tuning follow the truck. Reception distance and optional static follow Local Radio's reception model. Radio keeps playing when another app is open and follows WestPlay's game pause, ignition and single-player rules.

The interface follows WestPlay's design. Station rows are larger, and station logos fit completely inside the dashboard widget.

The integrated server starts with WestPlay and listens only on `127.0.0.1:18331`. It serves the packaged interface and allows stations that still use HTTP. No separate Local Radio server or telemetry plugin is needed. Stations require internet access; individual streams may become unavailable.

Data, station images, static audio and adapted reception logic come from [ETS2/ATS Local Radio](https://github.com/Koenvh1/ets2-local-radio). Licenses and credits are included in `ui/public/local-radio`. To import another copy of its source data, run `node tools/import-local-radio.mjs path/to/ets2-local-radio-master` from the repository root.

## Language

Open the cabin's **Settings → Language** to choose **English** or **Polski**. The choice applies to the cabin interface, including navigation, weather, settings and Radio FM, and is remembered between sessions. Without an explicit choice, the interface follows the game's language. App and service names remain unchanged. Polish keyboard characters are also available.

The language selector belongs to WestPlay's Settings app, rather than Radio FM's own settings.

## Music controls

In the desktop companion, open **Controls → Keybinds**. Volume down, play/pause, volume up, previous track and next track accept keyboard keys, mouse buttons and controller buttons. The default shortcuts use the screen interaction key with 1, 2, 3, 4 and 5 respectively. Previous/next switch stations in Radio FM.

Click a binding, release any held buttons, then press the new button. Hold the interaction key too to require it as a modifier. Escape cancels recording. Windows WinMM supports up to 16 devices, with 32 buttons and four POV directions each. Axes and pedals are not bindings. Leave bound controller buttons unassigned in ETS2, since controller polling does not consume the game's input. Volume changes in 5% steps.

## Automatic playback

**Automatic playback** is enabled by default. Its shared setting is available in the cabin's **Settings** app and the desktop companion's **Controls** page.

WestPlay remembers the last music source and resumes it after the boot animation whenever the ignition turns on. This covers Spotify, Music, YouTube, YouTube Music and Radio FM. Source history survives application restarts. Radio FM remembers the station, and music services remember a playable track. Availability still depends on the service, account and connection.

Playback waits while the game is paused or unfocused. Switching the ignition off cancels a pending resume. Changing the option during a drive takes effect at the next ignition cycle.

## Maps and game connection

Map preparation now includes split model and asset packages, such as Poland Rebuilding's, and definitions stored under `base/` and owned DLC directories. The profile's mod order is preserved. Existing maps are rebuilt automatically because older builds could omit these packages without reporting an error. Start WestPlay with ETS2 closed and wait for map preparation before driving.

The installed `westplay.dll` is compared with the packaged DLL even when both builds have the same version number. A missing or different plugin is updated while ETS2 is closed. If the game is running, the companion explains that it needs to close first. Restart ETS2 after replacing a loaded plugin. The app and plugin must use the same game bridge version.

## Building a package

Use the normal Tauri release process, or run `powershell -File tools/build-local.ps1 -Name WestPlay-RadioFM` with Node/npm and the Windows Rust toolchain installed. Release builds require `westplay-app/custom-protocol` so the companion loads its packaged assets instead of a development server. The packaging helper checks that the truck brand logo pack, including Volvo, is present. Missing brand logos otherwise fall back to a wordmark.

Normal release builds retain WestPlay's existing online services and signed update checks. This integration does not change update endpoints or signature verification. Development builds keep their existing no-update behaviour.

## Validation

Automated tests cover reception, controller codes, music keybinds, repeated ignition cycles, language selection, split map packages and plugin replacement within the same release number. Native WebView2 checks cover the built interface and loopback server.

The installed Poland Rebuilding 3.0 and ProMods data resolved definitions for all 3,059 visible road segments in the eastern sectors checked. This is a data check, not an in-game drive. Physical controller compatibility and live service playback still need testing on the target setup.
