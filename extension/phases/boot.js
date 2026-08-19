// A declared content script is a classic script — MV3 has no "type": "module"
// for content_scripts — so the module graph is pulled in by hand from
// web_accessible_resources. Everything else in phases/ can then be a normal
// module.

// Everything this widget says about itself goes to console.debug, which Chrome
// hides unless the console's level filter is set to Verbose. Most tabs have no
// phase server behind them, so anything louder would mean a line of someone
// else's console on nearly every page load — while this one still answers
// "did the content script even load" for whoever goes looking.
console.debug('[task-tabs] watching for a task\'s phases');

(async () => {
  const url = chrome.runtime.getURL('phases/session.js');
  const { startPhaseWatch } = await import(url);
  startPhaseWatch();
})().catch((e) => console.error('[task-tabs]', e));
