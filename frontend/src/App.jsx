import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { api, configureAuth } from "./api";
import Sidebar from "./components/Sidebar";
import NewProjectForm from "./components/NewProjectForm";
import ProjectView from "./components/ProjectView";
import AuthPage from "./components/AuthPage";
import Icon, { Logo } from "./components/Icon";
import { Alert } from "./components/common";
import ThemeToggle from "./components/ThemeToggle";

function Splash({ children }) {
  return (
    <div className="splash" role="status">
      <Logo size={40} />
      {children}
    </div>
  );
}

export default function App() {
  const [authConfig, setAuthConfig] = useState(null); // null = loading
  const [session, setSession] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [attempts, setAttempts] = useState(0);

  // The backend needs ~10-20 s to start (it loads the AI models), so keep retrying
  // instead of falling back to local mode while it is still booting.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const tryConnect = (n) =>
      api
        .authConfig()
        .then((cfg) => !cancelled && setAuthConfig(cfg))
        .catch(() => {
          if (cancelled) return;
          setAttempts(n + 1);
          timer = setTimeout(() => tryConnect(n + 1), 2000);
        });
    tryConnect(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const supabase = useMemo(
    () => (authConfig?.enabled ? createClient(authConfig.supabase_url, authConfig.anon_key) : null),
    [authConfig]
  );

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    configureAuth({
      tokenProvider: async () => (supabase ? (await supabase.auth.getSession()).data.session?.access_token : null),
      unauthorized: () => supabase?.auth.signOut(),
    });
  }, [supabase]);

  if (!authConfig) {
    return (
      <Splash>
        <p>
          <span className="spinner sm" aria-hidden="true" /> Connecting to the ResearchX backend…
        </p>
        {attempts >= 15 && (
          <p className="small muted">
            Still waiting after {attempts * 2}&nbsp;s. Make sure the backend window is open — double-click start.bat in
            D:\ResearchX.
          </p>
        )}
      </Splash>
    );
  }
  if (supabase && !sessionLoaded) {
    return (
      <Splash>
        <p className="muted">Loading…</p>
      </Splash>
    );
  }
  if (supabase && !session) return <AuthPage supabase={supabase} demo={authConfig.demo} />;

  const user = session?.user;
  return (
    <Workspace
      key={user?.id || "local"}
      user={user}
      isDemo={!!user && user.email === authConfig.demo?.email}
      onLogout={supabase ? () => supabase.auth.signOut() : null}
    />
  );
}

function initials(text) {
  const parts = (text || "?").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

function Workspace({ user, isDemo, onLogout }) {
  const [health, setHealth] = useState(null);
  const [projects, setProjects] = useState(null); // null = loading
  const [selectedId, setSelectedId] = useState(null);
  const [backendError, setBackendError] = useState("");

  const refreshList = () =>
    api
      .listProjects()
      .then((list) => {
        setProjects(list);
        setBackendError("");
      })
      .catch((e) => {
        setProjects((p) => p || []);
        setBackendError(e.message);
      });

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
    refreshList();
  }, []);

  const onCreated = (project) => {
    refreshList();
    setSelectedId(project.id);
  };

  const onDeleted = () => {
    setSelectedId(null);
    refreshList();
  };

  const name = isDemo ? "Demo account" : user?.user_metadata?.name || user?.email;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <button className="brand" onClick={() => setSelectedId(null)} aria-label="ResearchX home">
          <Logo size={30} />
          <span className="brand-name" translate="no">
            ResearchX
          </span>
        </button>
        <span className="topbar-sep" aria-hidden="true" />
        <span className="topbar-context">Research workflow assistant</span>

        <div className="topbar-right">
          <ThemeToggle />
          {health && (
            <span
              className={`status ${health.llm.enabled ? "status-ok" : ""}`}
              title={`Storage: ${health.storage === "supabase" ? "Supabase (cloud)" : "local SQLite"}`}
            >
              <span className="status-dot" aria-hidden="true" />
              {health.llm.enabled ? health.llm.model : "Heuristic mode"}
            </span>
          )}
          {user && (
            <div className="user">
              <span className="avatar" aria-hidden="true">
                {isDemo ? "D" : initials(name)}
              </span>
              <span className="user-text">
                <span className="user-name">{name}</span>
                <span className="user-email">{user.email}</span>
              </span>
              <button className="btn btn-icon" onClick={onLogout} aria-label="Log out" title="Log out">
                <Icon name="logout" size={16} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="layout">
        <Sidebar
          projects={projects}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => setSelectedId(null)}
        />
        <main className="main" id="main" tabIndex={-1}>
          <div className="main-inner">
            {backendError && <Alert kind="error">{backendError}</Alert>}
            {selectedId ? (
              <ProjectView
                key={selectedId}
                id={selectedId}
                onChanged={refreshList}
                onDeleted={onDeleted}
              />
            ) : (
              <NewProjectForm onCreated={onCreated} projectCount={projects?.length || 0} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
