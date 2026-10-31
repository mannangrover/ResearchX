import { useState } from "react";
import Icon, { Logo } from "./Icon";
import { Alert } from "./common";
import ThemeToggle from "./ThemeToggle";

const FEATURES = [
  ["book", "Literature from three sources", "OpenAlex, Semantic Scholar and arXiv, ranked by semantic similarity."],
  ["gauge", "Transparent opportunity score", "Six measurable dimensions, cross-checked by an independent LLM judge."],
  ["target", "Gaps, questions & refinement", "Concrete research gaps and an advisor chat that turns them into a proposal."],
];

const PIPELINE = ["Input", "Analysis", "Literature", "Score", "Gaps", "Refine", "Plan"];

export default function AuthPage({ supabase, demo }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setInfo("");
  };

  const run = async (kind, fn) => {
    setBusy(kind);
    setError("");
    setInfo("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (mode === "login") {
      run("form", async () => {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (error) throw error;
      });
    } else {
      run("form", async () => {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { name: form.name } },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Account created. Check your email for a confirmation link, then log in.");
          setMode("login");
        }
      });
    }
  };

  const demoLogin = () =>
    run("demo", async () => {
      const { error } = await supabase.auth.signInWithPassword(demo);
      if (error) throw new Error(`Demo login failed: ${error.message}`);
    });

  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="auth-brand">
          <Logo size={34} />
          <span translate="no">ResearchX</span>
        </div>

        <div className="auth-pitch">
          <span className="eyebrow on-dark">AI-powered research workflow</span>
          <h1>From a project idea to a research direction you can defend.</h1>
          <p>
            ResearchX analyses your idea or GitHub repository, finds the closest published work, and tells you — with
            evidence — where the research opportunity is.
          </p>
          <ul className="auth-features">
            {FEATURES.map(([icon, title, text]) => (
              <li key={title}>
                <span className="auth-feature-icon">
                  <Icon name={icon} size={16} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ol className="auth-pipeline" aria-label="Live workflow stages">
          {PIPELINE.map((s, i) => (
            <li key={s}>
              <span>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </aside>

      <main className="auth-main">
        <ThemeToggle className="auth-theme" />
        <div className="auth-panel">
          <div className="auth-brand auth-brand-mobile">
            <Logo size={30} />
            <span translate="no">ResearchX</span>
          </div>
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="muted">
            {mode === "login" ? "Log in to continue to your research projects." : "Projects are saved to your own private workspace."}
          </p>

          <div className="segmented" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => switchMode("login")}>
              Log in
            </button>
            <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => switchMode("signup")}>
              Sign up
            </button>
          </div>

          <form className="form" onSubmit={submit}>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="auth-name">Name</label>
                <input id="auth-name" name="name" value={form.name} onChange={set("name")} placeholder="Your name…" autoComplete="name" />
              </div>
            )}
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                required
                spellCheck={false}
                value={form.email}
                onChange={set("email")}
                placeholder="you@university.edu"
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                name="password"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={set("password")}
                placeholder={mode === "signup" ? "At least 6 characters…" : "Your password…"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>

            <div aria-live="polite">
              {error && <Alert kind="error">{error}</Alert>}
              {info && <Alert kind="info">{info}</Alert>}
            </div>

            <button className="btn btn-primary btn-block btn-lg" disabled={!!busy}>
              {busy === "form" && <span className="spinner sm" aria-hidden="true" />}
              {busy === "form" ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          {demo && (
            <>
              <div className="divider">
                <span>or</span>
              </div>
              <button className="btn btn-secondary btn-block btn-lg demo-btn" onClick={demoLogin} disabled={!!busy}>
                {busy === "demo" ? <span className="spinner sm" aria-hidden="true" /> : <Icon name="sparkle" size={16} />}
                {busy === "demo" ? "Signing in…" : "Try the Demo Account"}
              </button>
              <p className="small muted auth-note">
                Opens a shared workspace with pre-computed example projects. Don’t store anything private in it.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
