// One rule, in one place: which urls the widget is willing to put in an href.
// Both hrefs it renders come from outside — the chip's from the phase server, the
// header's from the site the developer configured — and either could carry a
// scheme that runs code on the page under test, or no scheme at all, which makes
// the link relative to that page instead of absolute to the tracker.

const HREF_SCHEMES = new Set(['http:', 'https:']);

// The protocol is read off the parsed url rather than off the string: URL parsing
// drops tabs and newlines, so only the parse tells you what scheme the string
// actually spells.
export const safeHref = (url) => {
  if (typeof url !== 'string' || url === '') return '';

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }

  return HREF_SCHEMES.has(parsed.protocol) ? url : '';
};
