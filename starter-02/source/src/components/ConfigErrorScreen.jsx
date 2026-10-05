// ============================================================
// Shown instead of the app when required runtime configuration is absent.
//
// This screen exists so that a misconfigured deploy FAILS VISIBLY. The old
// behaviour was the opposite: missing variables fell back to the production
// project, so a broken staging deploy looked perfectly healthy while reading
// and writing live contractor data.
//
// Deliberately dependency-free (no design tokens, no i18n, no Supabase): it
// has to render when nothing else is guaranteed to work.
// ============================================================
import React from 'react';

export function ConfigErrorScreen({ missing = [] }) {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#0f1115',
        color: '#e6e8ec',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: '560px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
          BinaTech is not configured
        </h1>
        <p style={{ margin: '0 0 16px', lineHeight: 1.6, color: '#aab0ba' }}>
          This build does not know which Supabase project it belongs to, so it
          will not start. There is no fallback on purpose — a missing variable
          must never resolve to the production project.
        </p>
        <p style={{ margin: '0 0 8px', color: '#aab0ba' }}>Missing:</p>
        <ul style={{ margin: '0 0 20px', paddingLeft: '20px' }}>
          {missing.map((name) => (
            <li key={name} style={{ fontFamily: 'ui-monospace, monospace', margin: '4px 0' }}>
              {name}
            </li>
          ))}
        </ul>
        <p style={{ margin: 0, lineHeight: 1.6, color: '#aab0ba' }}>
          Copy <code style={{ fontFamily: 'ui-monospace, monospace' }}>.env.example</code>{' '}
          to <code style={{ fontFamily: 'ui-monospace, monospace' }}>.env</code> and set the
          values for the environment you intend to run.
        </p>
      </div>
    </div>
  );
}
