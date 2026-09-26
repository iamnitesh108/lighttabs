# LightTabs

A browser extension for people who keep too many tabs open. It frees memory in two ways:

- **Suspend** tabs you haven't looked at for a while. They stay in the tab strip with a faded icon, and the page is unloaded until you click it.
- **Save** a window's tabs into a list and close them. Open them again later, one at a time or all at once.

Works in Brave, Chrome, Edge and other Chromium browsers (version 121 or newer).

## Features

**Suspending**

- Suspends tabs automatically after they've been in the background for a set time (30 minutes by default, or never).
- Suspend the current tab, or every other tab in the window, with one click or a keyboard shortcut.
- Leaves alone pinned tabs, tabs playing audio, and sites you choose. Doesn't suspend anything while you're offline, since the page couldn't load again.
- Keep one tab loaded for now, without adding its site to a list.
- A suspended tab loads only when you click its page, and comes back where you left it (scroll position included).
- Unsuspend all tabs of a window at once: the ones next to your current tab load first, a few at a time, so the browser stays responsive.
- Point at the toolbar icon to see how many tabs are suspended (or show the number on the icon).

**Saving**

- Save the current tab, the window, or all windows into a list. Pinned tabs stay open.
- Restore a list without loading it: the tabs appear right away and each page loads when you open it. Restoring 50 tabs doesn't freeze the browser.
- Open a single saved tab, rename lists, lock the ones you want to keep, search everything you've saved.
- Import from a OneTab export (paste it into a text file), and export as a backup file or as plain text.
- Optionally, once a day, save and close suspended tabs you haven't opened for a few days, so they use no memory at all.

**Tab groups**

- Saved lists remember tab groups (name, colour, collapsed) and restore them as groups.
- From the popup: suspend the other tabs of a group, or save a whole group into a list named after it.

**Right-click menu**

- On any page: suspend this tab or the others, save this tab or window, never suspend this site.
- On the toolbar icon: suspend other tabs, unsuspend all, save this window, open saved tabs.

## How it works

A suspended tab shows a small page with the site's title and a faded icon. That page is then unloaded as well, so the tab uses no memory at all, and opening the tab only shows the page again: the site loads when you click it.

- Nothing is stored anywhere else: the tab's address holds the site's address and title, so the browser's own session restore keeps suspended tabs across restarts.
- The extension doesn't need access to the pages you visit, and it runs no code inside them.
- Updates wait for a browser restart while a suspended tab is on screen, so an update never closes one.

If you prefer, turn off **Load a suspended tab only when I click the page** in the settings. LightTabs then uses the browser's own tab discarding: a suspended tab reloads as soon as you open it, and suspended tabs keep working even if the extension is removed. With the default, click **Unsuspend all tabs** in each window before removing LightTabs.

### About Brave's Memory Saver

Brave can also unload tabs by itself (search for "Memory Saver" in its settings), and can mark them with a dotted circle around the icon ("Inactive tabs appearance"). Those tabs reload as soon as you open them. When such a tab is due to be suspended, LightTabs gives it the click-to-load page too. You can keep both, or turn Memory Saver off and let LightTabs decide.

## Install

From source:

```sh
npm install
npm run build
```

Then open `brave://extensions` (or `chrome://extensions`), turn on **Developer mode**, click **Load unpacked**, and pick the `dist` folder.

## Keyboard shortcuts

| Shortcut    | Action                                 |
| ----------- | -------------------------------------- |
| Alt+Shift+L | Open LightTabs                         |
| Alt+Shift+S | Suspend the current tab                |
| Alt+Shift+O | Suspend other tabs in this window      |
| Alt+Shift+K | Save this window's tabs and close them |

Change them at `brave://extensions/shortcuts` (or the settings page's **Change shortcuts** button). A shortcut can show as unassigned if another extension already uses it.

## Permissions

| Permission                    | Why                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `tabs`                        | To see each tab's address and title, and to suspend, open and close tabs.                      |
| `storage`, `unlimitedStorage` | To keep your settings and saved lists. Large lists shouldn't hit a size limit.                 |
| `alarms`                      | To check once a minute which tabs have been idle long enough (and once a day for unused ones). |
| `favicon`                     | To show site icons in the saved lists without loading the sites.                               |
| `contextMenus`                | For the right-click menu.                                                                      |
| `tabGroups`                   | To save tab groups with their name and colour, and restore them.                               |

It asks for no access to websites and has no content scripts.

## Privacy

Nothing leaves your browser. There are no analytics and no network requests. Settings sync through your browser account if you have sync turned on; saved lists stay on this device. See [PRIVACY.md](PRIVACY.md).

## Development

Needs Node 24 (see `.nvmrc`).

| Command           | What it does                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| `npm run dev`     | Rebuilds `dist` on every change. Reload the extension to see it.        |
| `npm test`        | Runs the unit tests.                                                    |
| `npm run check`   | Formatting, lint, types, tests and a build: run this before committing. |
| `npm run package` | Runs the checks, then zips `dist` into `release/` for a web store.      |

The code is split into three layers:

- `src/core`: plain logic with no browser APIs (when a tab may be suspended, settings, saved lists, import and export). Easy to test.
- `src/platform`: thin wrappers around `chrome.*` (tabs, storage).
- `src/background`, `src/ui`: the service worker and the three pages (popup, saved tabs, settings). The pages talk to the service worker through typed messages; it's the only part that changes tabs or saved lists.

## License

[MIT](LICENSE)
