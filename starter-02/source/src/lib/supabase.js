// ============================================================
// PILOT STARTER — this file replaces the application's Supabase client.
//
// In the real application this module builds the shared Supabase client from
// src/lib/config.js. In this starter it exports a strict, synthetic,
// in-memory client instead (src/pilot/adapters/strictSupabase.js): the real
// SDK is never imported, no request ever leaves the page, and any operation
// not listed in src/pilot/adapters/policy.js is rejected and logged.
//
// The exports keep their original names and meaning for the application:
//   supabase              — the client every API module uses
//   isSupabaseConfigured  — true, so the real data paths of each screen run
//                            (against synthetic fixtures)
//   missingConfig         — always empty here
//
// Pilot starter file (packaging/test-adapter wiring). Not to be edited for the
// pilot assignment.
// ============================================================
import { pilot } from '../pilot/runtime.js';

export const isSupabaseConfigured = true;
export const missingConfig = Object.freeze([]);
export const supabase = pilot.client;
