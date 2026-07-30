// Jira status -> tab-group title prefix.
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

export const KNOWN_PREFIXES = new Set(Object.values(STATUS_ABBREVIATIONS));

export const abbreviate = (status) => {
  const normalised = status.trim();
  return STATUS_ABBREVIATIONS[normalised.toLowerCase()] ?? normalised.toUpperCase().slice(0, 4);
};
