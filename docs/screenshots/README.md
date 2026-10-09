# Screenshots

These images are referenced from the root [`README.md`](../../README.md) **Screens** section. The five `.svg` files currently in this folder are **placeholders** — replace them with real captures (the README will keep working as long as the filenames stay the same).

## Files

| File | Screen | How to reach it |
| --- | --- | --- |
| `01-welcome.svg` | Welcome / landing | Sidebar → **Welcome** (shown on first run) |
| `02-dashboard.svg` | Dashboard | Sidebar → **Overview** |
| `03-networks.svg` | Networks | Sidebar → **Networks**, then Scan |
| `04-diagnostics.svg` | Diagnostics | Sidebar → **Diagnostics** |
| `05-settings.svg` | Settings | Sidebar → **Settings** |

## How to capture

1. Run the app: `npm run tauri dev` (or install the `.dmg`).
2. Resize the window to **1280×820** for consistent framing.
3. Click the tab for the screen you want.
4. Capture the window with `⇧⌘4` then `Space`, or a tool like [Shottr](https://shottr.cc/) / CleanShot.
5. Save as PNG.

## Recommended specs

- **Size:** 1280×820 (or 2560×1640 @2x for Retina crispness).
- **Format:** PNG (screenshots) — keep the `.svg` only for placeholders.
- **Naming:** `01-welcome.png`, `02-dashboard.png`, … matching the table above.
- **After replacing:** update the image links in the root `README.md` from `.svg` to `.png`.

## Tips for good screenshots

- Let a scan and a few pings complete first so the charts have data.
- Keep a real SSID visible (or blur it) — avoid test SSIDs.
- Prefer the app's own window frame over a full-desktop capture.
