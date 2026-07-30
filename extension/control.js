const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];

const colorFor = (name) => {
  let sum = 0;
  for (const ch of name) sum += ch.codePointAt(0);
  return COLORS[sum % COLORS.length];
};

// The title carries a status prefix ("DEV|HRS-2261") once the sync has run, so
// the group is matched by its task key rather than by the whole title.
const findGroup = async (key) => {
  const groups = await chrome.tabGroups.query({});
  return groups.find((g) => keyFromTitle(g.title ?? '') === key) ?? null;
};

const add = async (key, url, color) => {
  const group = await findGroup(key);

  if (group) {
    const tabs = await chrome.tabs.query({ groupId: group.id });
    const existing = tabs.find((t) => t.url === url || t.pendingUrl === url);
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
      return;
    }
  }

  const tab = await chrome.tabs.create({ url, active: false });
  const groupId = await chrome.tabs.group(
    group ? { tabIds: tab.id, groupId: group.id } : { tabIds: tab.id },
  );
  if (!group) {
    // The caller owns the colour (task-color keeps it in step with the terminal
    // label); the local hash only covers a caller that sent none.
    const chosen = COLORS.includes(color) ? color : colorFor(key);
    await chrome.tabGroups.update(groupId, { title: key, color: chosen });
  }
};

const close = async (key) => {
  const group = await findGroup(key);
  if (!group) return;
  const tabs = await chrome.tabs.query({ groupId: group.id });
  await chrome.tabs.remove(tabs.map((t) => t.id));
};

const collapse = async (key) => {
  const group = await findGroup(key);
  if (group) await chrome.tabGroups.update(group.id, { collapsed: true });
};

const configure = async (site) => {
  await chrome.storage.local.set({ site: site.replace(/\/+$/, '') });
};

const run = async () => {
  const p = new URLSearchParams(location.search);
  const action = p.get('action');

  if (action === 'config') {
    const site = p.get('site');
    if (site) await configure(site);
    return;
  }

  const group = p.get('group');
  const url = p.get('url');
  if (!group) return;

  if (action === 'add' && url) {
    await add(group, url, p.get('color'));
    // Without this the freshly created group would sit prefix-less until the
    // next alarm, up to five minutes away.
    chrome.runtime.sendMessage({ type: 'sync' }).catch(() => {});
  } else if (action === 'close') await close(group);
  else if (action === 'collapse') await collapse(group);
};

// The control tab must disappear even when the action threw, or a junk tab is
// left behind on the user's screen.
run()
  .catch((e) => console.error('[task-tabs]', e))
  .finally(async () => {
    const self = await chrome.tabs.getCurrent();
    if (self) await chrome.tabs.remove(self.id);
  });
