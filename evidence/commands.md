# Commands and results

Review commit `e1f29c7` (`e1f29c73de5000a409f8587131cec3d54cb8223f`) on `pilot/w1-commercial-control`.
Run from `starter-02/source` with Node v22.22.2, npm 10.9.7.

## Install, exactly as shipped
```
$ npm ci

added 369 packages in 3s
```

## The focused tests, against the source exactly as supplied

Reverts the two repaired view files to `origin/main`, runs the invoice tests,
restores the repair and runs them again. git only, so nothing is left behind.
```
$ work/demo/red-green.sh
 BEFORE — the two files exactly as the starter shipped them
 2 files changed, 19 insertions(+), 123 deletions(-)
⎯⎯⎯⎯⎯⎯ Failed Tests 23 ⎯⎯⎯⎯⎯⎯⎯
      Tests  23 failed | 5 passed (28)
 AFTER — the repair restored, nothing else changed
      Tests  28 passed (28)
Tree clean. Nothing left behind.
```

## The composer tests, against the composer as the client reviewed it

Takes `ProgressComposer.jsx` back to its state before the fix and runs the same tests.
```
$ git checkout e03fc73^ -- starter-02/source/src/components/capture/ProgressComposer.jsx
$ npx vitest run src/components/capture/progressComposer.test.jsx
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
      Tests  4 failed | 9 passed (13)

$ git checkout HEAD -- starter-02/source/src/components/capture/ProgressComposer.jsx
$ npx vitest run src/components/capture/progressComposer.test.jsx
      Tests  13 passed (13)
```

## Full suite
```
$ npx vitest run
 Test Files  46 passed (46)
      Tests  807 passed (807)
```

## Build
```
$ npm run build
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 13.39s
```

## Working tree after all of it
```
$ git status --porcelain
(empty)
```
