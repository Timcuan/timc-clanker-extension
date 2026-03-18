// src/popup/window-utils.ts
// Utilities for detaching the popup into a persistent Chrome window

/** Returns true if running inside a detached (pinned) window, vs the normal popup */
export function isDetached(): boolean {
  return new URLSearchParams(location.search).has('detached');
}

/**
 * Re-open the popup as a standalone Chrome window that stays open
 * when the user interacts with other tabs.
 */
export function detachToWindow(): void {
  const url = chrome.runtime.getURL('popup.html') + '?detached=1';
  chrome.windows.create({
    url,
    type: 'popup',
    width: 420,
    height: 640,
    focused: true,
  });
  // Close the embedded popup so we don't have two instances
  window.close();
}

/**
 * Open the options page in a new tab (bypasses openOptionsPage() routing issues)
 */
export function openOptions(): void {
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
}

/**
 * Returns true when running as a full browser tab (?tab=1).
 * Used to enable drag-and-drop — popup closes on outside click, but a tab does not.
 */
export function isTab(): boolean {
  return new URLSearchParams(location.search).has('tab');
}

/**
 * Open the popup as a full browser tab — drag & drop works without popup-close issues.
 * The tab URL includes ?tab=1 so isTab() returns true inside it.
 */
export function openAsTab(): void {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html') + '?tab=1',
  });
}
