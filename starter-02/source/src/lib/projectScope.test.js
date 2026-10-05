import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Regression guard for the CFO-loop blocker where ApprovalsView hardcoded
// the sample project id ('SYN-SAMPLE') and silently showed an empty queue on
// every real project while the sidebar badge counted real pending work.
// Views must resolve the project through getCurrentProjectId(); only
// currentProject.js (the definition) and data/project.js (the sample
// fixture) may carry the literal.

function jsxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return jsxFiles(full);
    return /\.(jsx|js)$/.test(e.name) ? [full] : [];
  });
}

describe('project scoping', () => {
  it('no view or component hardcodes the sample project id', () => {
    const offenders = [];
    for (const dir of ['src/views', 'src/components']) {
      for (const f of jsxFiles(dir)) {
        if (fs.readFileSync(f, 'utf8').includes("'SYN-SAMPLE'")) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('source files contain no control bytes (greppable, diffable text only)', () => {
    const offenders = [];
    for (const dir of ['src/views', 'src/components', 'src/lib']) {
      for (const f of jsxFiles(dir)) {
        // eslint-disable-next-line no-control-regex
        if (/[\x00\x01-\x08\x0b\x0c\x0e-\x1f]/.test(fs.readFileSync(f, 'utf8'))) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});
