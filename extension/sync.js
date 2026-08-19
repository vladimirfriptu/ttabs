// Keeps every task group's title in step with its tracker status.
//
// Runs on an alarm, on browser start, and on demand right after `task-tab add`.
// This file only orchestrates: where the statuses come from is `providers/`,
// what to write is `lib/plan.js`.

import { trackedGroups, keyForTab } from './chrome/groups.js';
import { rememberActiveTab, restoreFocus } from './chrome/focus.js';
import { QA_MESSAGE } from './qa/config.js';
import { TASK_KEY_MESSAGE } from './lib/task-key.js';
import { TASK_LINK_MESSAGE, taskUrl } from './lib/task-link.js';
import { call } from './qa/client.js';
import { PHASE_MESSAGE } from './phases/config.js';
import { call as callPhaseServer } from './phases/client.js';
import { readSite, readTitles, writeTitles } from './chrome/store.js';
import { planUpdates } from './lib/plan.js';
import { fetchStatuses } from './providers/jira.js';

const ALARM = 'jira-status-sync';
const PERIOD_MINUTES = 5;

const sync = async () => {
  const site = await readSite();
  if (!site) {
    console.warn('[task-tabs] no Jira site configured — run `task-tab site <url>`');
    return;
  }

  const tracked = await trackedGroups();
  if (tracked.length === 0) return;

  const keys = [...new Set(tracked.map((t) => t.key))];
  const statuses = await fetchStatuses(site, keys);
  const written = await readTitles();

  const { updates, titles } = planUpdates(tracked, statuses, written);
  for (const { groupId, title } of updates) {
    await chrome.tabGroups.update(groupId, { title });
  }

  await writeTitles(titles);
};

const runSync = () => sync().catch((e) => console.warn('[task-tabs] sync failed:', e));

const schedule = () => chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES });

chrome.runtime.onInstalled.addListener(() => {
  schedule();
  runSync();
});

chrome.runtime.onStartup.addListener(() => {
  schedule();
  runSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runSync();
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  rememberActiveTab(tabId, windowId).catch((e) => console.warn('[task-tabs]', e));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'sync') {
    runSync();
    return false;
  }

  if (message?.type === 'restoreFocus') {
    // The control page waits for this before closing itself, so the answer has
    // to be async — hence the `true`.
    restoreFocus(message.windowId)
      .catch((e) => console.warn('[task-tabs]', e))
      .finally(() => sendResponse(true));
    return true;
  }

  if (message?.type === TASK_KEY_MESSAGE) {
    // A message from anywhere other than a tab (the control page, say) has no
    // group to resolve.
    if (!sender.tab) {
      sendResponse(null);
      return false;
    }
    keyForTab(sender.tab.id).then(sendResponse);
    return true;
  }

  if (message?.type === QA_MESSAGE) {
    // No server running is the normal state, not an error worth logging — the
    // content script polls for one and tells a dead server (fetch itself
    // fails, landing here) apart from a real "no session" (a clean 404).
    call(message)
      .then(sendResponse)
      .catch((e) => sendResponse({ error: String(e?.message ?? e) }));
    return true;
  }

  if (message?.type === PHASE_MESSAGE) {
    // Same contract as the QA channel: no server running is the normal state,
    // not an error worth logging, so the failure is handed back for the content
    // script to absorb quietly.
    callPhaseServer(message)
      .then(sendResponse)
      .catch((e) => sendResponse({ error: String(e?.message ?? e) }));
    return true;
  }

  if (message?.type === TASK_LINK_MESSAGE) {
    readSite()
      .then((site) => sendResponse(taskUrl(site, message.key)))
      // A missing site is not an error worth logging, and neither is a storage
      // read failing while the worker is being torn down — the panel treats an
      // empty answer as "show the key as text".
      .catch(() => sendResponse(''));
    return true;
  }

  return false;
});
