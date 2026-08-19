// Where a task key points in the tracker. The site is configured once
// (`task-tab site <url>`) and lives in extension storage, which only the service
// worker reads in this codebase — so a content script asks for the URL the same
// way it asks which task its tab belongs to.

export const TASK_LINK_MESSAGE = 'task-link';

// `writeSite` already strips trailing slashes, but a site stored by an older
// build may still carry one, and a doubled slash in a tracker URL is a 404.
export const taskUrl = (site, key) => {
  if (!site || !key) return '';
  const base = site.replace(/\/+$/, '');
  return `${base}/browse/${key}`;
};

// Resolves to '' when no site is configured — the panel then shows the key as
// plain text rather than a link that goes nowhere.
export const readTaskLink = async (key) => chrome.runtime.sendMessage({ type: TASK_LINK_MESSAGE, key });
