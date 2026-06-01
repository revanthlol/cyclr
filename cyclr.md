# cyclr — Quick Browser Tab Switcher

## Overview

cyclr is a lightweight Chromium extension that provides a true keyboard-first tab switching experience inspired by Windows Alt+Tab.

The goal is to make switching between browser tabs fast, predictable, and muscle-memory friendly while keeping the extension extremely lightweight and free of unnecessary features.

---

# Design Principles

* Keyboard-first
* Extremely lightweight
* Fast startup and response time
* Minimal permissions
* No analytics
* No cloud sync
* No tab management features
* No search functionality
* No thumbnails
* No visual clutter

The extension should feel like a native browser feature rather than a productivity tool.

---

# Primary Workflow

## Forward Switching

1. Hold `Alt`
2. Press `Q`
3. A compact popup appears in the center of the screen
4. Continue pressing `Q` while holding `Alt`
5. Selection moves through the tab list
6. Releasing `Alt` activates the selected tab

Example:

Alt + Q → Tab 2

Alt + Q + Q → Tab 3

Alt + Q + Q + Q → Tab 4

Release Alt → Switch

---

# User Interface

## Popup Layout

```text
┌──────────────────────────────┐
│  Discord                     │
│  YouTube                     │
│▶ Reddit                      │
│  Instagram                   │
│  Telegram                    │
└──────────────────────────────┘
```

### Displayed Information

* Tab favicon
* Tab title
* Highlighted selection

### Excluded Information

* URL
* Search box
* Preview thumbnails
* Extra controls
* Buttons
* Mouse-focused UI

---

# Sorting Modes

## 1. Recent Used (MRU)

Default mode.

Tabs are ordered by most recently activated.

Example:

```text
YouTube
Discord
Reddit
Instagram
```

This mimics the behavior of Windows Alt+Tab.

---

## 2. Browser Tab Order

Tabs are displayed in their natural browser order.

Example:

```text
Tab 1
Tab 2
Tab 3
Tab 4
```

Users can choose their preferred mode.

---

# Core Features

## Infinite Cycling

When the last tab is reached:

```text
Last Tab
↓
First Tab
```

The list wraps around indefinitely.

---

## Current Selection Highlight

The active selection should always be clearly visible.

Options:

* Accent background
* Outline
* Indicator arrow

---

## Favicon Support

Each tab should display its favicon for quick visual recognition.

---

## Current Window Support

Switch only between tabs in the current browser window.

---

# Optional Features (v1.1)

## Reverse Cycling

Shortcut:

```text
Alt + Shift + Q
```

Cycles backward through the tab list.

---

## All Windows Mode

Include tabs from all browser windows.

Example:

```text
Discord      [Window 1]
YouTube      [Window 2]
Reddit       [Window 1]
```

User configurable.

---

## Pinned Tabs First

Optional sorting rule:

```text
📌 Gmail
📌 Calendar
Discord
YouTube
```

---

## Tab Count

Small footer:

```text
23 Tabs Open
```

Can be enabled or disabled.

---

# Settings

The settings page should remain intentionally small.

## General

* Use Recent Used Ordering
* Use Browser Tab Ordering
* Include All Browser Windows
* Enable Reverse Cycling
* Show Pinned Tabs First
* Show Tab Count

---

# Technical Notes

## Manifest

Manifest V3

---

## Permissions

Use the minimum permissions required.

Prefer:

```json
{
  "permissions": ["tabs"]
}
```

Avoid requesting unnecessary permissions.

---

## MRU Tracking

Maintain an internal Most Recently Used list using:

```javascript
chrome.tabs.onActivated
```

Update the MRU order whenever a tab becomes active.

---

## Performance Goals

### Popup Open Time

Target:

```text
< 50 ms
```

### Memory Usage

Keep memory footprint negligible.

Avoid:

* Thumbnail caching
* Background screenshots
* Large data storage
* Heavy UI frameworks

---

# Explicit Non-Goals

The following features will NOT be included:

* Search
* Fuzzy search
* Tab previews
* Thumbnail generation
* AI features
* Workspaces
* Session managers
* Cloud synchronization
* Analytics
* Productivity dashboards
* Mouse-centric workflows

These features add complexity without improving the primary Alt+Tab experience.

---

# Vision

A browser extension that does one thing exceptionally well:

"Alt+Tab for browser tabs."

Press Alt+Q.
Keep tapping Q.
Release Alt.

Done.

