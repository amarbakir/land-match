import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { EnrichListingResponse } from '@landmatch/api';
import type { AuthStatusMessage, CurrentStateMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';
import { LoginForm } from './LoginForm';
import { IdleState } from './IdleState';
import { ScoreCard } from './ScoreCard';

type PanelState =
  | { view: 'loading_auth' }
  | { view: 'logged_out' }
  | { view: 'idle'; email: string }
  | { view: 'loading'; email: string }
  | { view: 'loaded'; email: string; data: EnrichListingResponse }
  | { view: 'error'; email: string; error: string };

export function SidePanel() {
  const [state, setState] = useState<PanelState>({ view: 'loading_auth' });

  useEffect(() => {
    // Check auth status on mount
    sendMessage<AuthStatusMessage>({ type: 'GET_AUTH_STATUS' }).then((res) => {
      if (!res.payload.authenticated) {
        setState({ view: 'logged_out' });
        return;
      }
      const email = res.payload.email ?? '';
      // Get current enrichment state
      sendMessage<CurrentStateMessage>({ type: 'GET_CURRENT_STATE' }).then((stateMsg) => {
        const s = stateMsg.payload;
        if (s.state === 'loaded') {
          setState({ view: 'loaded', email, data: s.data });
        } else if (s.state === 'loading') {
          setState({ view: 'loading', email });
        } else if (s.state === 'error') {
          setState({ view: 'error', email, error: s.error });
        } else {
          setState({ view: 'idle', email });
        }
      });
    });

    // Listen for state broadcasts from background
    function onMessage(message: any) {
      if (message.type === 'CURRENT_STATE') {
        const s = message.payload as CurrentStateMessage['payload'];
        setState((prev) => {
          const email = 'email' in prev ? prev.email : '';
          if (s.state === 'loaded') return { view: 'loaded', email, data: s.data };
          if (s.state === 'loading') return { view: 'loading', email };
          if (s.state === 'error') return { view: 'error', email, error: s.error };
          return { view: 'idle', email };
        });
      }
    }

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  function handleLogin(email: string) {
    setState({ view: 'idle', email });
    // Request current state in case we landed on a listing
    sendMessage<CurrentStateMessage>({ type: 'GET_CURRENT_STATE' }).then((stateMsg) => {
      const s = stateMsg.payload;
      if (s.state === 'loaded') setState({ view: 'loaded', email, data: s.data });
      else if (s.state === 'loading') setState({ view: 'loading', email });
      else if (s.state === 'error') setState({ view: 'error', email, error: s.error });
    });
  }

  function handleLogout() {
    sendMessage({ type: 'LOGOUT' });
    setState({ view: 'logged_out' });
  }

  function handleRetry() {
    sendMessage({ type: 'RETRY_ENRICH' });
  }

  if (state.view === 'loading_auth') {
    return (
      <div class="loading-container">
        <div class="spinner" />
      </div>
    );
  }

  if (state.view === 'logged_out') {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <div>
      {/* User header */}
      <div class="panel" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
        <div class="user-row">
          <span style="font-weight: 500;">{state.email}</span>
          <button
            onClick={handleLogout}
            style="background:none;border:none;color:#6b7280;cursor:pointer;text-decoration:underline;font-size:13px;"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Content area */}
      {state.view === 'idle' && <IdleState />}
      {state.view === 'loading' && (
        <div class="loading-container">
          <div class="spinner" />
          <span>Enriching listing...</span>
        </div>
      )}
      {state.view === 'loaded' && <ScoreCard data={state.data} />}
      {state.view === 'error' && (
        <div class="panel">
          <div class="logo">LandMatch</div>
          <p class="error">{state.error}</p>
          <button class="btn btn-outline" onClick={handleRetry}>Retry</button>
        </div>
      )}
    </div>
  );
}
