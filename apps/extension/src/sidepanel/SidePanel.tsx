import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { EnrichListingResponse } from '@landmatch/api';
import type { AuthStatusMessage, CurrentStateMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';
import { DrawerHeader } from './components/DrawerHeader';
import { LoginForm } from './LoginForm';
import { SignedOutView } from './views/SignedOutView';
import { IdleView } from './views/IdleView';
import { LoadingView } from './views/LoadingView';
import { LoadedView } from './views/LoadedView';
import { ErrorView } from './views/ErrorView';
import { PartialDataView } from './views/PartialDataView';

type PanelState =
  | { view: 'loading_auth' }
  | { view: 'logged_out' }
  | { view: 'idle'; email: string }
  | { view: 'loading'; email: string; title?: string; price?: number; acreage?: number; address?: string }
  | { view: 'loaded'; email: string; data: EnrichListingResponse }
  | { view: 'error'; email: string; error: string };

function toPanelState(s: CurrentStateMessage['payload'], email: string): PanelState {
  if (s.state === 'loaded') return { view: 'loaded', email, data: s.data };
  if (s.state === 'loading') return { view: 'loading', email, title: s.title, price: s.price, acreage: s.acreage, address: s.address };
  if (s.state === 'error') return { view: 'error', email, error: s.error };
  return { view: 'idle', email };
}

function isPartialData(data: EnrichListingResponse): boolean {
  if (!data.homesteadComponents) return false;
  const errors = data.enrichment.errors ?? [];
  return errors.length > 0;
}

export function SidePanel() {
  const [state, setState] = useState<PanelState>({ view: 'loading_auth' });
  const [showLoginForm, setShowLoginForm] = useState(false);

  useEffect(() => {
    sendMessage<AuthStatusMessage>({ type: 'GET_AUTH_STATUS' }).then((res) => {
      if (!res.payload.authenticated) {
        setState({ view: 'logged_out' });
        return;
      }
      const email = res.payload.email ?? '';
      sendMessage<CurrentStateMessage>({ type: 'GET_CURRENT_STATE' }).then((stateMsg) => {
        setState(toPanelState(stateMsg.payload, email));
      });
    });

    function onMessage(message: any) {
      if (message.type === 'CURRENT_STATE') {
        const s = message.payload as CurrentStateMessage['payload'];
        setState((prev) => {
          const email = 'email' in prev ? prev.email : '';
          return toPanelState(s, email);
        });
      }
    }

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  function handleLogin(email: string) {
    setShowLoginForm(false);
    setState({ view: 'idle', email });
    sendMessage<CurrentStateMessage>({ type: 'GET_CURRENT_STATE' }).then((stateMsg) => {
      setState(toPanelState(stateMsg.payload, email));
    });
  }

  function handleLogout() {
    sendMessage({ type: 'LOGOUT' });
    setState({ view: 'logged_out' });
    setShowLoginForm(false);
  }

  function handleRetry() {
    sendMessage({ type: 'RETRY_ENRICH' });
  }

  // Auth loading
  if (state.view === 'loading_auth') {
    return (
      <div class="drawer">
        <div class="center-container">
          <div class="spinner" />
        </div>
      </div>
    );
  }

  // Signed out
  if (state.view === 'logged_out') {
    if (showLoginForm) {
      return <LoginForm onLogin={handleLogin} onBack={() => setShowLoginForm(false)} />;
    }
    return <SignedOutView onSignIn={() => setShowLoginForm(true)} />;
  }

  // Logged-in states — all share the drawer header
  return (
    <div class="drawer">
      <DrawerHeader email={state.email} onLogout={handleLogout} />

      {state.view === 'idle' && <IdleView />}

      {state.view === 'loading' && (
        <LoadingView
          title={state.title}
          price={state.price}
          acreage={state.acreage}
          address={state.address}
        />
      )}

      {state.view === 'loaded' && (
        isPartialData(state.data)
          ? <PartialDataView data={state.data} />
          : <LoadedView data={state.data} />
      )}

      {state.view === 'error' && (
        <ErrorView error={state.error} onRetry={handleRetry} />
      )}
    </div>
  );
}
