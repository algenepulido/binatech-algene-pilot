// ============================================================
// PILOT STARTER ONLY — entry point (index.html loads this, not src/main.jsx).
//
// Order matters:
//   1. the synthetic runtime exists (no application module imported yet);
//   2. the network guard is installed;
//   3. browser state the app reads at import time is seeded;
//   4. the evaluator controls are mounted outside the React root;
//   5. only then are the real providers and shell imported and rendered.
// ============================================================
import { pilot } from './runtime.js';
import { installNetworkGuard } from './networkGuard.js';
import { prepareBrowserState } from './browserState.js';
import { mountControls } from './controls.js';

installNetworkGuard(window, pilot.log);
prepareBrowserState(window);
mountControls(pilot, document);

import('./mountApp.jsx').catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Pilot starter failed to load the application:', error);
});
