import { useState } from "react";
import Icon from "./Icon";
import { Alert } from "./common";
import ThemeToggle from "./ThemeToggle";
import { listStage } from "../stages";

const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" });

function Section({ icon, title, description, children }) {
  return (
    <section className="card account-section">
      <header>
        <h2 className="sub-title">
          <Icon name={icon} size={16} /> {title}
        </h2>
        {description && <p className="small muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export default function AccountPage({ supabase, user, isDemo, projects, papers, trash, health, onLogout }) {
  const [name, setName] = useState(user?.user_metadata?.name || "");
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState({});
  const locked = isDemo || !supabase;
  const active = projects || [];
  const completed = active.filter((p) => listStage(p.stage) >= 10).length;

  const run = async (key, fn, success) => {
    setBusy(key);
    setMsg({});
    try {
      const { error } = await fn();
      if (error) throw error;
      setMsg({ [key]: { kind: "info", text: success } });
    } catch (e) {
      setMsg({ [key]: { kind: "error", text: e.message || "Something went wrong." } });
    } finally {
      setBusy(null);
    }
  };

  const saveName = (e) => {
    e.preventDefault();
    run("name", () => supabase.auth.updateUser({ data: { name: name.trim() } }), "Name updated.");
  };

  const savePassword = (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return setMsg({ password: { kind: "error", text: "The two passwords do not match." } });
    run("password", () => supabase.auth.updateUser({ password: pw.next }), "Password changed.");
    setPw({ next: "", confirm: "" });
  };

  return (
    <div className="account-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="#/">All projects</a>
        <Icon name="chevronRight" size={13} />
        <span aria-current="page">Account</span>
      </nav>
      <header className="projects-head">
        <h1>Account</h1>
      </header>

      {isDemo && (
        <Alert kind="warn">
          This is the shared demo account, so its name and password cannot be changed. Create your own account to keep private
          projects.
        </Alert>
      )}
      {!supabase && <Alert kind="info">Running in local mode without login, so there is no account to manage.</Alert>}

      <div className="account-grid">
        <Section icon="users" title="Profile">
          <form className="form" onSubmit={saveName}>
            <div className="field">
              <label htmlFor="acc-email">Email</label>
              <input id="acc-email" value={user?.email || "—"} readOnly disabled />
            </div>
            <div className="field">
              <label htmlFor="acc-name">Name</label>
              <input id="acc-name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} placeholder="Your name…" />
            </div>
            {user?.created_at && <p className="small muted">Member since {dateFmt.format(new Date(user.created_at))}.</p>}
            {msg.name && <Alert kind={msg.name.kind}>{msg.name.text}</Alert>}
            {!locked && (
              <div className="form-actions">
                <button className="btn btn-primary" disabled={busy === "name" || !name.trim()}>
                  {busy === "name" ? "Saving…" : "Save Name"}
                </button>
              </div>
            )}
          </form>
        </Section>

        <Section icon="lock" title="Password" description="At least 6 characters.">
          <form className="form" onSubmit={savePassword}>
            <div className="field">
              <label htmlFor="acc-pw">New password</label>
              <input id="acc-pw" type="password" autoComplete="new-password" minLength={6} required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} disabled={locked} />
            </div>
            <div className="field">
              <label htmlFor="acc-pw2">Confirm new password</label>
              <input id="acc-pw2" type="password" autoComplete="new-password" minLength={6} required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} disabled={locked} />
            </div>
            {msg.password && <Alert kind={msg.password.kind}>{msg.password.text}</Alert>}
            {!locked && (
              <div className="form-actions">
                <button className="btn btn-primary" disabled={busy === "password"}>
                  {busy === "password" ? "Changing…" : "Change Password"}
                </button>
              </div>
            )}
          </form>
        </Section>

        <Section icon="folder" title="Your projects">
          <dl className="kv">
            <dt>Projects</dt>
            <dd>{active.length}</dd>
            <dt>Completed</dt>
            <dd>{completed}</dd>
            <dt>Paper analyses</dt>
            <dd>{(papers || []).length}</dd>
            <dt>In the trash</dt>
            <dd>
              {(trash || []).length} (<a href="#/trash">open the trash</a>)
            </dd>
            <dt>Storage</dt>
            <dd>{health ? (health.storage === "supabase" ? "Supabase (cloud, private to you)" : "Local SQLite file") : "—"}</dd>
            <dt>AI model</dt>
            <dd>{health ? (health.llm.enabled ? health.llm.model : "None — rule-based fallbacks") : "—"}</dd>
          </dl>
        </Section>

        <Section icon="sun" title="Appearance" description="Light, dark, or follow your system setting.">
          <ThemeToggle />
        </Section>
      </div>

      {onLogout && (
        <div className="account-logout">
          <button className="btn btn-secondary" onClick={onLogout}>
            <Icon name="logout" size={15} /> Log Out
          </button>
        </div>
      )}
    </div>
  );
}
