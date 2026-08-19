// A declared content script is a classic script — MV3 has no "type": "module"
// for content_scripts — so the module graph is pulled in by hand from
// web_accessible_resources. Everything else in phases/ can then be a normal
// module.

(async () => {
  const url = chrome.runtime.getURL('phases/session.js');
  const { startPhaseWatch } = await import(url);
  startPhaseWatch();
})().catch((e) => console.error('[task-tabs]', e));
