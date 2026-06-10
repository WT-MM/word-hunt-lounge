# Word Hunt Lounge — native iOS shell

A ~80-line WKWebView wrapper around the deployed web app whose only purpose is
**real haptics** (Safari on iOS 26.5+ has no web path to the Taptic Engine —
Apple patched the last workaround). The web app auto-detects the shell's
`haptic` message handler; in plain Safari it falls back to sound.

## Build & install on your own iPhone — free, no Apple Developer Program

1. Install **Xcode** from the Mac App Store (big download, one time).
2. `brew install xcodegen` (run `load-brew` first in your shell), then in this
   directory: `xcodegen` → produces `WordHuntLounge.xcodeproj`.
3. Open the project in Xcode. In *Signing & Capabilities*: check
   "Automatically manage signing" and pick your **Personal Team** (just your
   Apple ID — free).
4. Plug in your iPhone, select it as the run target, hit ▶.
5. First run only: on the phone, Settings → General → VPN & Device
   Management → trust your developer certificate.

## The catch with free signing

Apps signed with a free personal team **expire after 7 days** — relaunch the
install from Xcode (10 seconds) to refresh, or use
[SideStore](https://sidestore.io)/AltStore to auto-refresh in the background.
Each friend who wants haptics has to build/sideload it themselves with their
own Apple ID; everyone else just uses the web link with sounds.

Paying the $99/year Apple Developer Program later unlocks: TestFlight
distribution to the whole group chat (no expiry, no cables) and the option to
ship a real iMessage extension. The shell needs zero changes for new game
features — it loads the live site.
