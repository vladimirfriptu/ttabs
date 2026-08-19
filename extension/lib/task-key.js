// Which task does this tab belong to — asked by every widget, answerable only
// by the service worker (a content script cannot see tabs or groups).
//
// The message string is historical: the QA widget shipped first and named it.
// Renaming it would mean a reload of the extension and every open tab agreeing
// on the new name at the same instant, which buys nothing.

export const TASK_KEY_MESSAGE = 'qa-task-key';

// The task key of this tab's own group, or null when it has none — a definitive
// answer either way. Resolved fresh on every call: a tab can be dragged into
// another group, or its group renamed, after the page loaded. The service worker
// always answers (never an { error } payload; see sync.js), so the only way this
// rejects is the sendMessage round-trip itself failing — the service worker
// restarting or the extension reloading — which a caller needs to tell apart
// from "no key".
export const readTaskKey = async () => chrome.runtime.sendMessage({ type: TASK_KEY_MESSAGE });
