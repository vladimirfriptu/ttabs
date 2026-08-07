// A declared content script is a classic script — MV3 has no "type": "module"
// for content_scripts — so the module graph is pulled in by hand from
// web_accessible_resources. Everything else in qa/ can then be a normal module.

// The one line printed unconditionally: with no session running the widget
// renders nothing at all, so without it an injected-but-idle content script and
// one that was never injected are indistinguishable from the page.
console.info('[task-tabs] watching for a QA session');

(async () => {
  const url = chrome.runtime.getURL('qa/main.js');
  const { start } = await import(url);
  start();
})().catch((e) => console.error('[task-tabs]', e));
