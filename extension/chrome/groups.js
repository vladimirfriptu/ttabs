import { keyFromTitle } from '../lib/titles.js';

// A group is matched by the task key in its title rather than by the whole
// title, which carries a status prefix ("DEV|ACME-2261") once the sync has run.
export const trackedGroups = async () => {
  const groups = await chrome.tabGroups.query({});
  const tracked = [];
  for (const group of groups) {
    const key = keyFromTitle(group.title ?? '');
    if (key) tracked.push({ group, key });
  }
  return tracked;
};

export const findGroup = async (key) => {
  const tracked = await trackedGroups();
  return tracked.find((t) => t.key === key)?.group ?? null;
};

// A content script cannot see tabs or groups, so the service worker resolves
// a tab's task key on its behalf. `chrome.tabs.get`/`chrome.tabGroups.get`
// reject once the tab or group has gone away — a closed tab racing this
// lookup, say — so any failure here just means "no key", not an error to
// surface.
export const keyForTab = async (tabId) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return null;
    const group = await chrome.tabGroups.get(tab.groupId);
    return keyFromTitle(group.title ?? '');
  } catch {
    return null;
  }
};
