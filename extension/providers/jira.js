// The only file that knows Jira exists. Another tracker means a sibling of this
// file exporting the same `fetchStatuses`, one import line in sync.js, and its
// host added to `host_permissions` in the manifest.
//
// Authentication is the browser's own session — `credentials: 'include'`, no
// token stored anywhere — so the sync is a no-op while that session is expired.

const MAX_RESULTS = '100';

export const fetchStatuses = async (site, keys) => {
  const jql = `key in (${keys.join(',')})`;
  const query = new URLSearchParams({ jql, fields: 'status', maxResults: MAX_RESULTS });
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
