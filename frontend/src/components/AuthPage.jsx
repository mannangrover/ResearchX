import { useState } from "react";
import Icon, { Logo } from "./Icon";
import { Alert } from "./common";
import ThemeToggle from "./ThemeToggle";
import PasswordRules from "./PasswordRules";
import { emailError, nameError, passwordError } from "../validation";

// Real result of the "Thermal-Aware" project in the demo workspace
const EXAMPLE = {
  title: "Thermal-aware quantization for classroom face recognition",
  score: 45.0,
  band: "Limited",
  dimensions: [
    ["Literature overlap", 4.7],
    ["Technical depth", 6.3],
    ["Feasibility", 3.5],
    ["Potential impact", 5.4],
    ["Reproducibility", 0.0],
    ["Contribution", 5.2],
  ],
};

const JOURNEY = [
  ["cpu", "Understand"],
  ["gauge", "Assess"],
  ["flask", "Design"],
  ["rocket", "Publish"],
];

function ResultPreview() {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  return (
    <figure
      className="auth-preview"
      role="img"
      aria-label={`Example result: research opportunity score ${EXAMPLE.score} out of 100, ${EXAMPLE.band}, with a breakdown across six dimensions.`}
    >
      <figcaption>
        <span>Example result</span>
        <strong>{EXAMPLE.title}</strong>
      </figcaption>
      <div className="auth-preview-body">
        <div className="auth-ring">
          <svg viewBox="0 0 100 100" width="104" height="104" aria-hidden="true">
            <circle cx="50" cy="50" r={radius} className="auth-ring-track" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="auth-ring-value"
              strokeDasharray={`${(EXAMPLE.score / 100) * circumference} ${circumference}`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <span className="auth-ring-label">
            <b>{EXAMPLE.score}</b>
            {EXAMPLE.band}
          </span>
        </div>
        <ul className="auth-bars">
          {EXAMPLE.dimensions.map(([name, value]) => (
            <li key={name}>
              <span>{name}</span>
              <i>
                <i style={{ width: `${value * 10}%` }} />
              </i>
              <b>{value.toFixed(1)}</b>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

export default function AuthPage({ supabase, demo, initialMode = "login", initialInfo = "" }) {
  const [mode, setMode] = useState(initialMode); // login | signup
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(initialInfo);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const switchMode = (m) => {
    setMode(m);
    window.history.replaceState(null, "", `#/${m}`);
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
    const email = form.email.trim();
    const invalid =
      mode === "login"
        ? emailError(email) || (form.password ? "" : "Enter your password.")
        : nameError(form.name) || emailError(email) || passwordError(form.password);
    if (invalid) {
      setInfo("");
      setError(invalid);
      return;
    }
    if (mode === "login") {
      run("form", async () => {
        const { error } = await supabase.auth.signInWithPassword({ email, password: form.password });
        if (error) throw error;
      });
    } else {
      run("form", async () => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: form.password,
          options: { data: { name: form.name.trim() } },
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
        </div>

        <ResultPreview />

        <ol className="auth-journey" aria-label="The four steps of the workflow">
          {JOURNEY.map(([icon, label]) => (
            <li key={label}>
              <span>
                <Icon name={icon} size={16} />
              </span>
              {label}
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

          <form className="form" onSubmit={submit} noValidate>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="auth-name">Name</label>
                <input id="auth-name" name="name" required value={form.name} onChange={set("name")} placeholder="Your name…" autoComplete="name" />
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
                value={form.password}
                onChange={set("password")}
                placeholder={mode === "signup" ? "Create a strong password…" : "Your password…"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              {mode === "signup" && <PasswordRules password={form.password} />}
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
