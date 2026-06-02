# Cyclr

A lightweight, keyboard-driven tab switcher for Chromium browsers, inspired by OS-level Alt-Tab menus.

## Features

- **Keyboard-First Navigation**: Cycle tabs using `Alt + Q` (or custom combinations) without touching the mouse.
- **Widescreen Previews**: Instantly view live visual previews of tabs as you cycle (can be turned off for an ultra-compact list).
- **Scale Stabilization**: Built-in counter-zoom scaling that keeps the UI perfect at all webpage zoom levels.
- **Fully Customizable**: Modify hotkeys, ordering modes (MRU or Tab Strip), themes, scaling, and developer settings on-the-fly.

## Controls

- **Open**: Hold <kbd>Alt</kbd> and tap <kbd>Q</kbd> (default).
- **Cycle Down**: Tap <kbd>Q</kbd>, <kbd>ArrowDown</kbd>, or <kbd>Tab</kbd>.
- **Cycle Up**: Tap <kbd>ArrowUp</kbd> or <kbd>Shift + Tab</kbd>.
- **Commit**: Release <kbd>Alt</kbd> (or the active modifier key), or press <kbd>Enter</kbd>.
- **Cancel**: Press <kbd>Escape</kbd>.

## Installation

As of now the extension isnt uploaded on the [Chrome Web Store](https://chrome.google.com/webstore/category/extensions). So here's how to install it manually:

1. Clone or download this [repository](https://github.com/revanthlol/cyclr) or just download the zip file from the [releases page](https://github.com/revanthlol/cyclr/releases) for the stable release (not dev).
2. Open Chrome/Chromium and navigate to [chrome://extensions](https://chrome://extensions).
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the repository folder.
5. Set up your preferences on [this page](https://chrome://extensions/?id=fmbcndbkjmccknhnbajddjkkamfchjnh)

## Known Limitations

- **Restricted Chrome pages**: Chrome blocks content scripts on internal and privileged pages, so the overlay will not appear on `chrome://` pages (Settings, Extensions, History, etc.), the default New Tab page, the Chrome Web Store, `chrome-extension://` pages, or local `file://` URLs. This is a hard browser-level restriction with no workaround for unpacked extensions.

- **Iframes**: The overlay is intentionally suppressed inside iframes to prevent duplicate instances. If a page is loaded entirely inside a frame (some embedded dashboards, web apps), the overlay may not trigger.

- **Custom shortcut recording is experimental**: The shortcut recorder works reliably for standard letter/number combos with `Alt` or `Ctrl` modifiers, but has known issues with symbol keys (`` ` ``, `-`, `=`, etc.) on Linux due to how Xorg/Wayland handles modifier+key combinations in browsers — `e.key` can return `"Dead"` or `"Unidentified"` instead of the actual character. **Stick with the default `Alt + Q`** unless you're comfortable debugging storage values manually. A proper fix is planned.

- **MRU ordering depends on focus events**: The Most Recently Used tab order is tracked via Chrome's `tabs.onActivated` API. Tabs that were active before the extension was installed won't have accurate MRU history until they're visited at least once after install.

## License

This project is open-source under the [MIT License](LICENSE).