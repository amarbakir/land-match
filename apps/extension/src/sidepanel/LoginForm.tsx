import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { LoginResultMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';

interface LoginFormProps {
  onLogin: (email: string) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
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
    <div class="panel">
      <div class="logo">LandMatch</div>
      <p class="info">Sign in to enrich and save listings.</p>
      {error && <div class="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <input
          class="input"
          type="email"
          placeholder="Email"
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
        <button class="btn" type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
