// Jira status -> tab-group title, and the rule for when a title may be rewritten.
// Loaded as a classic script by both the control page and the service worker.
//
// Adapting this to another workflow means editing STATUS_ABBREVIATIONS and
// nothing else: a status missing from the map still gets a prefix, so an unknown
// status degrades instead of breaking the sync.

const STATUS_ABBREVIATIONS = {
  'backlog': 'BL',
  'requirements': 'REQ',
  'ready': 'RDY',
  'ready for dev': 'RDEV',
  'to do': 'TODO',
  'in dev': 'DEV',
  'in progress': 'DEV',
  'on review': 'REV',
  'in review': 'REV',
  'ready for test': 'RQA',
  'in test': 'QA',
  'ready for release': 'REL',
  'on hold': 'HOLD',
  'blocked': 'HOLD',
  'closed': 'DONE',
  'done': 'DONE',
};

const SEPARATOR = '|';
const KEY_PATTERN = /([A-Z][A-Z0-9]*-\d+)$/;

const KNOWN_PREFIXES = new Set(Object.values(STATUS_ABBREVIATIONS));

const abbreviate = (status) => {
  const normalised = status.trim();
  return STATUS_ABBREVIATIONS[normalised.toLowerCase()] ?? normalised.toUpperCase().slice(0, 4);
};

const keyFromTitle = (title) => title.match(KEY_PATTERN)?.[1] ?? null;

const titleFor = (key, status) => `${abbreviate(status)}${SEPARATOR}${key}`;

// A title the user typed themselves ("[1] HRS-2261") is theirs to keep — the
// sync only ever overwrites a bare key, one of its own prefixes, or the exact
// string it wrote last time. That last case is what keeps a fallback prefix for
// an unmapped status updating, since such a prefix is not in KNOWN_PREFIXES.
const isOurTitle = (title, key, lastWritten) => {
  if (title === key) return true;
  if (lastWritten && title === lastWritten) return true;

  const separatorAt = title.indexOf(SEPARATOR);
  if (separatorAt < 0) return false;

  const prefix = title.slice(0, separatorAt);
  const rest = title.slice(separatorAt + SEPARATOR.length);
  return rest === key && KNOWN_PREFIXES.has(prefix);
};

// The test suite runs these in a plain Node context, where `module` exists and
// `chrome` does not.
if (typeof module !== 'undefined') {
  module.exports = { abbreviate, keyFromTitle, titleFor, isOurTitle, SEPARATOR };
}
