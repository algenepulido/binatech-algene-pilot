// ============================================================
// ErrorBoundary — catches any unexpected render error anywhere below it and
// shows a friendly, branded fallback instead of a blank white screen. Logs the
// error to the console (and could be wired to a reporter later). A "Try again"
// resets the boundary; "Reload" does a hard reload. Used at two levels: the
// whole app, and (with a `compact` fallback) around individual routed views so
// one broken page doesn't take down the shell.
// ============================================================
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, stack: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface it for debugging / future error reporting — never silent. Keep the
    // component stack so the fallback can show EXACTLY which component threw,
    // making intermittent crashes self-reporting (copyable from the UI).
    const stack = info?.componentStack || '';
    // eslint-disable-next-line no-console
    console.error(`UI error caught by ErrorBoundary${this.props.label ? ` [${this.props.label}]` : ''}:`, error, stack);
    this.setState({ stack });
  }

  reset = () => this.setState({ error: null, stack: null });

  render() {
    if (!this.state.error) return this.props.children;

    const compact = this.props.compact;
    const err = this.state.error;
    const msg = String(err?.message || err || 'Something went wrong');
    // First few frames of the component stack name the failing component(s).
    const where = (this.state.stack || '').trim().split('\n').slice(0, 6).join('\n');
    const label = this.props.label;
    const details = `${label ? `zone: ${label}\n` : ''}${where ? `${msg}\n\n${where}` : msg}`;
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: compact ? 240 : '60vh', background: '#faf8f0' }}>
        <div style={{ maxWidth: 460, textAlign: 'center', fontFamily: '"Inter", system-ui, sans-serif' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#b91c1c', fontSize: 24 }}>!</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2430', marginBottom: 6 }}>
            {compact ? 'This page hit a problem' : 'Something went wrong'}
          </div>
          {label && <div style={{ fontSize: 11, color: '#b91c1c', marginBottom: 6, fontWeight: 600 }}>{label}</div>}
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 16 }}>
            {compact
              ? 'The rest of the app is fine — try again, or move to another page.'
              : 'An unexpected error occurred. Your data is safe; nothing was lost. Try again or reload.'}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={this.reset} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', background: '#1d4ed8', border: 'none', cursor: 'pointer' }}>Try again</button>
            {!compact && <button onClick={() => window.location.reload()} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1f2430', background: '#fff', border: '1px solid #d6d3c4', cursor: 'pointer' }}>Reload</button>}
          </div>
          <details style={{ marginTop: 14, textAlign: 'start' }} open={!compact}>
            <summary style={{ fontSize: 11, color: '#9ca3af', cursor: 'pointer' }}>Technical details (copy this for support)</summary>
            <pre style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6, maxHeight: 180, overflow: 'auto' }}>{details}</pre>
          </details>
        </div>
      </div>
    );
  }
}
