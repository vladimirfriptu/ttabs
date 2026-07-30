// What the sync decides, with no browser API in sight.

import { isOurTitle, titleFor } from './titles.js';

// Returns the group updates to apply and the titles map to store in their
// place. The map is rebuilt from the groups that still exist, which is also
// what keeps it from growing forever as tasks come and go.
export const planUpdates = (tracked, statuses, written) => {
  const updates = [];
  const titles = {};

  for (const { group, key } of tracked) {
    const remembered = written[key];
    if (remembered) titles[key] = remembered;

    const status = statuses[key];
    if (!status) continue;

    const current = group.title ?? '';
    if (!isOurTitle(current, key, remembered)) continue;

    const title = titleFor(key, status);
    titles[key] = title;
    if (title !== current) updates.push({ groupId: group.id, title });
  }

  return { updates, titles };
};
