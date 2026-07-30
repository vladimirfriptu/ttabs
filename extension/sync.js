// Keeps every task group's title in step with its Jira status.
//
// Runs on an alarm, on browser start, and on demand right after `task-tab add`.
// Authentication is the browser's own Jira session — no token is stored here, so
// the sync is a no-op while that session is expired.

importScripts('statuses.js');

const ALARM = 'jira-status-sync';
const PERIOD_MINUTES = 5;

const readSite = async () => {
  const stored = await chrome.storage.local.get('site');
  return stored.site ?? '';
};

const trackedGroups = async () => {
  const groups = await chrome.tabGroups.query({});
  const tracked = [];
  for (const group of groups) {
    const key = keyFromTitle(group.title ?? '');
    if (key) tracked.push({ group, key });
  }
  return tracked;
};

const fetchStatuses = async (site, keys) => {
  const jql = `key in (${keys.join(',')})`;
  const query = new URLSearchParams({ jql, fields: 'status', maxResults: '100' });
  const response = await fetch(`${site}/rest/api/3/search/jql?${query}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Jira answered ${response.status}`);

  const payload = await response.json();
  const statuses = {};
  for (const issue of payload.issues ?? []) {
    const name = issue.fields?.status?.name;
    if (name) statuses[issue.key] = name;
  }
  return statuses;
};

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

  const stored = await chrome.storage.local.get('titles');
  const written = stored.titles ?? {};

  for (const { group, key } of tracked) {
    const status = statuses[key];
    if (!status) continue;

    const current = group.title ?? '';
    if (!isOurTitle(current, key, written[key])) continue;

    const title = titleFor(key, status);
    if (title === current) continue;

    await chrome.tabGroups.update(group.id, { title });
    written[key] = title;
  }

  await chrome.storage.local.set({ titles: written });
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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'sync') runSync();
});
