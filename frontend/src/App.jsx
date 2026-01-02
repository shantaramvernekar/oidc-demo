import { useEffect, useMemo, useState } from "react";

const config = {
  domain: import.meta.env.VITE_COGNITO_DOMAIN,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirectUri: import.meta.env.VITE_REDIRECT_URI,
  logoutUri: import.meta.env.VITE_LOGOUT_URI,
  scopes: import.meta.env.VITE_SCOPES || "openid email profile",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL
};

const TOKEN_STORAGE_KEY = "oidc_demo_tokens";
const VERIFIER_STORAGE_KEY = "oidc_demo_pkce_verifier";

function base64UrlEncode(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64UrlEncode(digest);
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function getTokens() {
  const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveTokens(tokens) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

function clearTokens() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export default function App() {
  const [tokens, setTokens] = useState(() => getTokens());
  const [profile, setProfile] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [adminReport, setAdminReport] = useState(null);
  const [error, setError] = useState("");

  const isConfigured = useMemo(() => {
    return (
      config.domain &&
      config.clientId &&
      config.redirectUri &&
      config.logoutUri &&
      config.apiBaseUrl
    );
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) {
      return;
    }

    const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
    if (!verifier) {
      setError("Missing PKCE verifier; start login again.");
      return;
    }

    const exchange = async () => {
      try {
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.clientId,
          code,
          redirect_uri: config.redirectUri,
          code_verifier: verifier
        });

        const response = await fetch(`https://${config.domain}/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString()
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Token exchange failed: ${text}`);
        }

        const data = await response.json();
        saveTokens(data);
        setTokens(data);
        sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        setError(err.message);
      }
    };

    exchange();
  }, []);

  const login = async () => {
    const verifier = randomString(96);
    const challenge = await sha256(verifier);
    sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes,
      code_challenge_method: "S256",
      code_challenge: challenge
    });

    window.location.assign(`https://${config.domain}/oauth2/authorize?${params}`);
  };

  const logout = () => {
    clearTokens();
    setTokens(null);
    const params = new URLSearchParams({
      client_id: config.clientId,
      logout_uri: config.logoutUri
    });
    window.location.assign(`https://${config.domain}/logout?${params}`);
  };

  const callApi = async (path, setter) => {
    setError("");
    try {
      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${tokens?.access_token}`
        }
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Request failed");
      }

      const data = await response.json();
      setter(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>OIDC Demo: Personal Finance Dashboard</h1>
        <p>React + FastAPI + AWS Cognito</p>
      </header>

      {!isConfigured && (
        <div className="card warning">
          <h2>Missing configuration</h2>
          <p>
            Update the frontend <code>.env</code> file with your Cognito domain,
            client ID, redirect URL, logout URL, and API base URL.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Session</h2>
        {tokens ? (
          <div className="row">
            <button onClick={logout}>Logout</button>
            <div>
              <p>
                <strong>Access Token:</strong> {tokens.access_token?.slice(0, 16)}...
              </p>
              <p>
                <strong>ID Token:</strong> {tokens.id_token?.slice(0, 16)}...
              </p>
            </div>
          </div>
        ) : (
          <button onClick={login} disabled={!isConfigured}>
            Login with Cognito
          </button>
        )}
      </div>

      <div className="grid">
        <div className="card">
          <h2>Profile</h2>
          <button onClick={() => callApi("/api/profile", setProfile)} disabled={!tokens}>
            Load Profile
          </button>
          <pre>{profile ? JSON.stringify(profile, null, 2) : "No data yet."}</pre>
        </div>

        <div className="card">
          <h2>Transactions</h2>
          <button
            onClick={() => callApi("/api/transactions", setTransactions)}
            disabled={!tokens}
          >
            Load Transactions
          </button>
          <pre>{transactions ? JSON.stringify(transactions, null, 2) : "No data yet."}</pre>
        </div>

        <div className="card">
          <h2>Admin Report</h2>
          <button
            onClick={() => callApi("/api/admin/reports", setAdminReport)}
            disabled={!tokens}
          >
            Load Admin Report
          </button>
          <pre>{adminReport ? JSON.stringify(adminReport, null, 2) : "No data yet."}</pre>
        </div>
      </div>

      {error && (
        <div className="card error">
          <h2>Error</h2>
          <pre>{error}</pre>
        </div>
      )}
    </div>
  );
}
