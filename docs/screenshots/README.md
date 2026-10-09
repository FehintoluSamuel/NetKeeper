# Screenshots

Real captures of NetKeeper's five core screens, referenced from the root [`README.md`](../../README.md) **Screens** section.

## Files

| File | Screen | How to reach it |
| --- | --- | --- |
| `01-welcome.png` | Welcome / landing | Sidebar → **Welcome** (shown on first run) |
| `02-dashboard.png` | Dashboard | Sidebar → **Overview** |
| `03-networks.png` | Networks | Sidebar → **Networks**, then Scan |
| `04-diagnostics.png` | Diagnostics | Sidebar → **Diagnostics** |
| `05-settings.png` | Settings | Sidebar → **Settings** |

## Re-capturing

If the UI changes and a screenshot is out of date, re-shoot it and keep the same filename.

1. Run the app: `npm run tauri dev` (or install the `.dmg`).
2. Capture the window with `⇧⌘4` then `Space`, or a tool like [Shottr](https://shottr.cc/) / CleanShot.
3. Save as PNG with the matching filename above (`2880×1800 @2x` matches the current set).
4. Commit the replacement.

## Tips

- Let a scan and a few pings complete first so the charts have data.
- Keep a real SSID visible (or blur it) — avoid test SSIDs.
- Prefer the app's own window frame over a full-desktop capture.