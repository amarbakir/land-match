import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { LoginResultMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';

interface LoginFormProps {
  onLogin: (email: string) => void;
  onBack?: () => void;
}

export function LoginForm({ onLogin, onBack }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const result = await sendMessage<LoginResultMessage>({
        type: 'LOGIN',
        payload: { email, password },
      });

      if (result.error || !result.payload) {
        setError(result.error ?? 'Login failed');
      } else {
        onLogin(result.payload.email);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div class="drawer" style={{ background: 'var(--bg)' }}>
      <div style={{ padding: '22px 22px 16px', borderBottom: '1px solid var(--border-soft)' }}>
        <div class="brand" style={{ fontSize: 16 }}>
          <div class="brand-mark" style={{ width: 26, height: 26, fontSize: 16 }}>L</div>
          <span>Land<em>Match</em></span>
        </div>
      </div>
      <div style={{ padding: 22, flex: 1 }}>
        <div class="eyebrow" style={{ marginBottom: 10 }}>Sign in</div>
        <div style={{
          fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 600,
          lineHeight: 1.25, marginBottom: 6,
        }}>
          Welcome back to the field.
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 18 }}>
          Score listings against your profiles in one click.
        </div>
        {error && <div class="error-text" style={{ marginBottom: 8 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            class="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
          />
          <input
            class="input"
            type="password"
            placeholder="Password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            required
          />
          <button class="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ padding: 10, marginTop: 6 }}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 11.5 }}>
          <span class="link" style={{ color: 'var(--text-dim)' }}>Forgot password?</span>
          {onBack && <span class="link link-accent" onClick={onBack}>Back</span>}
        </div>
      </div>
      <div style={{
        padding: '10px 22px', borderTop: '1px solid var(--border-soft)',
        fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-faint)', letterSpacing: '0.1em',
      }}>
        v1.0.0 · landmatch.co
      </div>
    </div>
  );
}
