// Opening the control page makes it the active tab of whatever window the user
// was looking at. To hand the selection back afterwards, someone has to have
// remembered where it was — that is this file.

import { readActiveTabs, writeActiveTabs } from './store.js';

// Control pages are skipped: they are the thing being undone.
export const rememberActiveTab = async (tabId, windowId) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  if (tab.url?.startsWith(chrome.runtime.getURL(''))) return;

  const byWindow = await readActiveTabs();
  byWindow[windowId] = tabId;
  await writeActiveTabs(byWindow);
};

export const restoreFocus = async (windowId) => {
  const byWindow = await readActiveTabs();
  const tabId = byWindow[windowId];
  if (!tabId) return;

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) await chrome.tabs.update(tabId, { active: true });
};
