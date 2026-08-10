// A declared content script is a classic script — MV3 has no "type": "module"
// for content_scripts — so the module graph is pulled in by hand from
// web_accessible_resources. Everything else in qa/ can then be a normal module.

// Everything this widget says about itself goes to console.debug, which Chrome
// hides unless the console's level filter is set to Verbose. A QA server is
// running for a minority of tasks, so anything louder would mean a line of
// someone else's console on nearly every page load — while still leaving the
// whole story available to whoever goes looking for it.
console.debug('[task-tabs] watching for a QA session');

(async () => {
  const url = chrome.runtime.getURL('qa/main.js');
  const { start } = await import(url);
  start();
})().catch((e) => console.error('[task-tabs]', e));
