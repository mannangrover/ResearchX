import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { api, configureAuth } from "./api";
import Sidebar from "./components/Sidebar";
import ProjectsPage from "./components/ProjectsPage";

// Heavier pages load only when they are opened, so the first page stays light
const TrashPage = lazy(() => import("./components/TrashPage"));
const AccountPage = lazy(() => import("./components/AccountPage"));
const NewProjectForm = lazy(() => import("./components/NewProjectForm"));
const ProjectView = lazy(() => import("./components/ProjectView"));
const PapersPage = lazy(() => import("./components/PapersPage"));
const PaperDetail = lazy(() => import("./components/PaperDetail"));
import AuthPage from "./components/AuthPage";
import Icon, { Logo } from "./components/Icon";
import ThemeToggle from "./components/ThemeToggle";

// Pages that need a login; a signed-out visitor is asked to log in and then returns to them
const isPrivateRoute = () => /^#\/(project\/|papers|new$|trash$|account$)/.test(window.location.hash);

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
  const [sessionEnded, setSessionEnded] = useState(false);
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
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) setSessionEnded(false);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    // scope "local": ending this browser's session must not end the account's other sessions
    const endSession = () => {
      setSessionEnded(true);
      supabase?.auth.signOut({ scope: "local" });
    };
    configureAuth({
      tokenProvider: async () => {
        if (!supabase) return null;
        const { data, error } = await supabase.auth.getSession();
        if (data.session) return data.session.access_token;
        if (isAuthRetryableFetchError(error)) {
          throw new Error("Could not reach the login service. Check your connection and try again.");
        }
        endSession();
        throw new Error("Your session has ended. Log in again to continue.");
      },
      unauthorized: endSession,
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
  if (supabase && !session) return <SignedOut supabase={supabase} demo={authConfig.demo} sessionEnded={sessionEnded} />;

  const user = session?.user;
  return (
    <Workspace
      key={user?.id || "local"}
      supabase={supabase}
      user={user}
      isDemo={!!user && user.email === authConfig.demo?.email}
      onLogout={
        supabase
          ? () => {
              window.location.hash = "#/";
              supabase.auth.signOut({ scope: "local" });
            }
          : null
      }
    />
  );
}

// Signed-out visitors log in; #/signup opens the sign-up form
function SignedOut({ supabase, demo, sessionEnded }) {
  const read = () => window.location.hash.replace(/^#\/?/, "");
  const [page, setPage] = useState(read);

  useEffect(() => {
    const onHash = () => setPage(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const mode = page === "signup" ? "signup" : "login";
  const notice = sessionEnded ? "Your session has ended. Log in again to continue." : isPrivateRoute() ? "Log in to open this page." : "";
  return <AuthPage key={`${mode}-${notice}`} supabase={supabase} demo={demo} initialMode={mode} initialInfo={notice} />;
}

function initials(text) {
  const parts = (text || "?").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

// Pages live in the URL hash so the browser's Back button works: #/  #/new  #/papers  #/papers/<id>  #/trash  #/account  #/project/<id>
function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("project/")) return { view: "project", id: h.slice("project/".length) };
  if (h.startsWith("papers/")) return { view: "paper", id: h.slice("papers/".length) };
  if (["new", "papers", "trash", "account"].includes(h)) return { view: h };
  return { view: "list" };
}

const go = (hash) => {
  if (window.location.hash !== hash) window.location.hash = hash;
};

function Workspace({ supabase, user, isDemo, onLogout }) {
  const [health, setHealth] = useState(null);
  const [allProjects, setProjects] = useState(null); // null = loading; includes projects in the trash
  const [route, setRoute] = useState(parseHash);
  const [filter, setFilter] = useState({ status: "all", domain: null });
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
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const onCreated = (project) => {
    refreshList();
    go(`#/project/${project.id}`);
  };

  const onDeleted = () => {
    refreshList();
    go("#/");
  };

  const projects = allProjects && allProjects.filter((p) => !p.deleted_at && !p.standalone);
  const papers = allProjects && allProjects.filter((p) => !p.deleted_at && p.standalone);
  const trash = allProjects && allProjects.filter((p) => p.deleted_at);
  const name = isDemo ? "Demo account" : user?.user_metadata?.name || user?.email;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <button className="brand" onClick={() => go("#/")} aria-label="ResearchX — all projects">
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
              <a className="user-link" href="#/account" title="Account settings">
                <span className="avatar" aria-hidden="true">
                  {isDemo ? "D" : initials(name)}
                </span>
                <span className="user-text">
                  <span className="user-name">{name}</span>
                  <span className="user-email">{user.email}</span>
                </span>
              </a>
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
          trashCount={trash?.length || 0}
          filter={filter}
          view={route.view}
          onNew={() => go("#/new")}
          onPapers={() => go("#/papers")}
          onFilter={(f) => {
            setFilter(f);
            go("#/");
          }}
        />
        <main className="main" id="main" tabIndex={-1}>
          <div className="main-inner">
            <Suspense fallback={<div className="skeleton-page" aria-busy="true" aria-label="Loading"><span className="skeleton h-title" /><span className="skeleton h-card" /></div>}>
            {route.view === "project" ? (
              <ProjectView key={route.id} id={route.id} onChanged={refreshList} onDeleted={onDeleted} />
            ) : route.view === "new" ? (
              <NewProjectForm onCreated={onCreated} projectCount={projects?.length || 0} />
            ) : route.view === "papers" ? (
              <PapersPage papers={papers} onChanged={refreshList} onOpen={(pid) => go(`#/papers/${pid}`)} />
            ) : route.view === "paper" ? (
              <PaperDetail key={route.id} id={route.id} onChanged={refreshList} onDeleted={() => { refreshList(); go("#/papers"); }} />
            ) : route.view === "trash" ? (
              <TrashPage trash={trash} onChanged={refreshList} />
            ) : route.view === "account" ? (
              <AccountPage supabase={supabase} user={user} isDemo={isDemo} projects={projects} papers={papers} trash={trash} health={health} onLogout={onLogout} />
            ) : (
              <ProjectsPage
                projects={projects}
                filter={filter}
                error={backendError}
                onOpen={(pid) => go(`#/project/${pid}`)}
                onNew={() => go("#/new")}
                onDeleted={refreshList}
              />
            )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
