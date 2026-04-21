import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import type { AuthStatusMessage, LoginResultMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';

const styles = {
  container: `
    padding: 16px;
    min-height: 200px;
  `,
  logo: `
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 16px;
    color: #1a1a1a;
  `,
  input: `
    display: block;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    margin-bottom: 8px;
    box-sizing: border-box;
  `,
  button: `
    display: block;
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    border: none;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  `,
  outlineButton: `
    display: block;
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #1a1a1a;
    cursor: pointer;
    font-size: 14px;
  `,
  error: `
    color: #ef4444;
    font-size: 13px;
    margin-bottom: 8px;
  `,
  info: `
    color: #6b7280;
    font-size: 13px;
    margin-bottom: 12px;
  `,
  userRow: `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  `,
  email: `
    font-weight: 500;
    font-size: 14px;
  `,
  logoutLink: `
    color: #6b7280;
    font-size: 13px;
    cursor: pointer;
    background: none;
    border: none;
    text-decoration: underline;
  `,
};

export function Popup() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sendMessage<AuthStatusMessage>({ type: 'GET_AUTH_STATUS' }).then((res) => {
      setAuthenticated(res.payload.authenticated);
      if (res.payload.email) setEmail(res.payload.email);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={styles.container}>Loading...</div>;
  }

  if (!authenticated) {
    return <LoginForm onLogin={(e) => { setAuthenticated(true); setEmail(e); }} />;
  }

  return <LoggedInView email={email} onLogout={() => { setAuthenticated(false); setEmail(''); }} />;
}

function LoginForm({ onLogin }: { onLogin: (email: string) => void }) {
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
    <div style={styles.container}>
      <div style={styles.logo}>LandMatch</div>
      <p style={styles.info}>Sign in to enrich and save listings.</p>
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          required
        />
        <button style={styles.button} type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

function LoggedInView({ email, onLogout }: { email: string; onLogout: () => void }) {
  async function handleLogout() {
    await sendMessage({ type: 'LOGOUT' });
    onLogout();
  }

  return (
    <div style={styles.container}>
      <div style={styles.logo}>LandMatch</div>
      <div style={styles.userRow}>
        <span style={styles.email}>{email}</span>
        <button style={styles.logoutLink} onClick={handleLogout}>
          Sign out
        </button>
      </div>
      <p style={styles.info}>
        Browse a LandWatch listing to see soil and flood data automatically.
      </p>
      <button
        style={styles.outlineButton}
        onClick={() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'FORCE_ENRICH' });
            }
          });
        }}
      >
        Enrich This Page
      </button>
    </div>
  );
}
