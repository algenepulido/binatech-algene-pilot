import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// PILOT STARTER: self-only Content-Security-Policy (see vite.pilot-security.js).
import { pilotStarterSecurity } from './vite.pilot-security.js';

// Variables the app cannot run without. Absence is a BUILD failure, not a
// fallback — before 2026-08-19 a build with no environment silently connected
// to the production Supabase project, which made staging untrustworthy.
const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

// Deliberately fake values for the test runner. They must never be real
// credentials: CI proves the code works, it does not need production access.
const TEST_ENV = {
  VITE_SUPABASE_URL: 'https://test-local.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-credential',
  VITE_R2_SIGN_FUNCTION: 'secure-r2-signer',
};

// https://vitejs.dev/config/
// Vitest reads this same config (see the `test` block). Keeping one config file
// means the test runner stays a thin, swappable layer over the existing build —
// if the stack changes, only this block moves.
export default defineConfig(({ mode }) => {
  // Vitest supplies its own env via `test.env` below, so the build-time gate
  // must not fire under the test runner.
  if (!process.env.VITEST) {
    const env = loadEnv(mode, process.cwd(), '');
    const missing = REQUIRED.filter((name) => !String(env[name] ?? '').trim());
    if (missing.length) {
      throw new Error(
        `\n\n  BinaTech is not configured.\n\n` +
          `  Missing: ${missing.join(', ')}\n\n` +
          `  Copy .env.example to .env (or .env.staging.example for staging) and\n` +
          `  set the values for the environment you intend to build for.\n\n` +
          `  There is deliberately no fallback: a missing variable must never\n` +
          `  resolve to the production project.\n`,
      );
    }
  }

  return {
    plugins: [react(), pilotStarterSecurity()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './vitest.setup.js',
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      env: TEST_ENV,
    },
  };
});
