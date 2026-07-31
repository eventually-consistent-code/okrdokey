/**
 * Purpose: The adapter registry — providers plug in here. Kept as its own
 *          tiny file so adding a connector is a two-line diff.
 * Author(s): John Reed
 */

import { githubAdapter } from './github.js';
import { jiraAdapter } from './jira.js';
import type { AdapterRegistry } from './types.js';

export const adapters: AdapterRegistry = {
  github: githubAdapter,
  jira: jiraAdapter,
};
