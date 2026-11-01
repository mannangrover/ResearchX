import { useEffect, useRef, useState } from "react";
import Icon, { Logo } from "../Icon";
import ThemeToggle from "../ThemeToggle";
import LiteratureMap from "./LiteratureMap";
import "./landing.css";

const REPO = "https://github.com/mannangrover/ResearchX";

const MODULES = [
  { n: 1, name: "Understand the project", stages: ["Idea or repository input", "Technical profile"], output: "A structured profile of what you are building" },
  { n: 2, name: "Assess the opportunity", stages: ["Related literature", "Opportunity score", "Research gaps"], output: "Where your idea stands, with the evidence" },
  { n: 3, name: "Design the research", stages: ["Refinement with an advisor", "Experiment plan"], output: "A sharper proposal and a plan to test it" },
  { n: 4, name: "Prepare to publish", stages: ["Paper evaluation", "Readiness and target tier"], output: "A checked paper and where to aim it" },
];

const DIMENSIONS = [
  ["Literature overlap", 4.7],
  ["Technical depth", 7.3],
  ["Feasibility", 5.5],
  ["Potential impact", 5.4],
  ["Reproducibility", 3.0],
  ["Contribution potential", 5.4],
];

function ScoreFragment() {
  return (
    <div className="frag" aria-hidden="true">
      <div className="frag-head">
        <span>Research opportunity score</span>
        <span className="frag-chip">Moderate</span>
      </div>
      <div className="frag-score">
        <strong>52.9</strong>
        <span>/ 100</span>
        <span className="frag-judge">AI judge: 53.5, strong agreement</span>
      </div>
      <ul className="frag-bars">
        {DIMENSIONS.map(([name, v]) => (
          <li key={name}>
            <span>{name}</span>
            <span className="frag-bar">
              <span style={{ width: `${v * 10}%` }} />
            </span>
            <b>{v.toFixed(1)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VersionFragment() {
  const rows = [
    ["Literature overlap", 2.3, 4.0],
    ["Technical depth", 6.0, 7.0],
    ["Feasibility", 4.5, 4.5],
    ["Potential impact", 3.8, 4.6],
  ];
  return (
    <div className="frag" aria-hidden="true">
      <div className="frag-head">
        <span>Refinement impact</span>
        <span className="frag-versions">
          <span className="frag-v">v1</span>
          <Icon name="arrowRight" size={13} />
          <span className="frag-v is-current">v2</span>
        </span>
      </div>
      <div className="frag-score">
        <strong className="muted-num">37.2</strong>
        <Icon name="arrowRight" size={16} />
        <strong>46.8</strong>
        <span className="frag-delta">+9.6</span>
      </div>
      <table className="frag-table">
        <tbody>
          {rows.map(([n, a, b]) => (
            <tr key={n}>
              <th>{n}</th>
              <td>{a.toFixed(1)}</td>
              <td>{b.toFixed(1)}</td>
              <td className={b > a ? "up" : ""}>{b > a ? `+${(b - a).toFixed(1)}` : "±0.0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanFragment() {
  const phases = [
    ["Setup and data", 1, 2],
    ["Reproduce baselines", 3, 4],
    ["Implement method", 5, 7],
    ["Experiments and ablations", 8, 10],
    ["Analysis and writing", 11, 12],
  ];
  return (
    <div className="frag" aria-hidden="true">
      <div className="frag-head">
        <span>Experiment plan</span>
        <span className="frag-muted">12 weeks, team of 2</span>
      </div>
      <ul className="frag-hyp">
        <li>
          <b>H1</b> Quantization-aware training keeps accuracy within 1.5% of full precision <span className="frag-chip">RQ1</span>
        </li>
        <li>
          <b>H2</b> Sustained load causes thermal throttling within an hour <span className="frag-chip">RQ2</span>
        </li>
      </ul>
      <ul className="frag-gantt">
        {phases.map(([n, a, b]) => (
          <li key={n}>
            <span>{n}</span>
            <span className="frag-track">
              <span style={{ left: `${((a - 1) / 12) * 100}%`, width: `${((b - a + 1) / 12) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaperFragment() {
  const items = [
    ["Research question", "Does QAT preserve verification accuracy under INT8?", "Answered", "ok"],
    ["Research question", "How does thermal throttling affect frame rate?", "Not answered", "no"],
    ["Contribution", "A one-hour thermal benchmark", "Not answered", "no"],
    ["Claim", "QAT keeps accuracy within 1.2% of FP32", "Supported", "ok"],
  ];
  return (
    <div className="frag" aria-hidden="true">
      <div className="frag-head">
        <span>Paper analysis</span>
        <span className="frag-muted">Paper score 58.8</span>
      </div>
      <ul className="frag-rows">
        {items.map(([type, text, status, cls]) => (
          <li key={text}>
            <span className="frag-type">{type}</span>
            <span className="frag-text">{text}</span>
            <span className={`frag-status ${cls}`}>{status}</span>
          </li>
        ))}
      </ul>
      <div className="frag-tier">
        <span>Questions and aims answered</span>
        <b>2.5 of 5</b>
        <span>Claims supported</span>
        <b>2 of 3</b>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    title: "A score you can check, not just trust",
    text: "The Research Opportunity Score is built from six measurable dimensions, each with the papers and signals behind it. An independent AI judge scores the same evidence, so you can see where the two agree.",
    points: ["Six weighted dimensions with reasons", "Rule-based score, AI cross-check", "Evidence links to every paper"],
    visual: <ScoreFragment />,
  },
  {
    title: "Refine in versions, not copies",
    text: "Talk the score and the gaps through with an advisor, approve a sharper proposal, and ResearchX keeps it as a new version of the same project. Only the score is recomputed, so the difference comes from your refinement.",
    points: ["Every version stays in the project", "Open any version and keep working", "Before-and-after comparison per dimension"],
    visual: <VersionFragment />,
  },
  {
    title: "A plan that tests what you asked",
    text: "Each research question becomes a testable hypothesis. Datasets, baselines from the related work, metrics, ablations and a week-by-week timeline are fitted to the time and compute you actually have.",
    points: ["Hypotheses traced to research questions", "Timeline fitted to your weeks", "Export as Markdown"],
    visual: <PlanFragment />,
  },
  {
    title: "Your paper, checked against what it promises",
    text: "Upload the paper you wrote. ResearchX finds every question, aim and contribution it states and checks whether the results deliver them, then tells you how ready it is and which tier of venue to aim for.",
    points: ["Questions and claims checked against results", "Six consistency checks", "Readiness and target tier with the reasons"],
    visual: <PaperFragment />,
  },
];

const PRINCIPLES = [
  ["Evidence first", "Every score shows the papers and signals behind it, and every rule and threshold is visible."],
  ["You stay the author", "ResearchX analyses, plans and checks. It never writes your paper or invents results."],
  ["Works without AI", "Each AI step has a transparent rule-based fallback, so the workflow keeps running."],
  ["Private by default", "Projects belong to your account and are protected by row-level security in the database."],
];

// The one scroll-linked moment: the "how it works" line fills as the section passes
function useScrollProgress(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight * 0.75 - r.top) / (r.height * 0.8)));
      el.style.setProperty("--progress", p.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}

// In-page links scroll without changing the URL hash, which the app uses for routing
function scrollToSection(e) {
  const link = e.target.closest('a[href^="#"]');
  const href = link?.getAttribute("href");
  if (!href || href.startsWith("#/")) return;
  const target = href === "#top" ? document.body : document.getElementById(href.slice(1));
  if (!target) return;
  e.preventDefault();
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  if (target !== document.body) {
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
}

export default function LandingPage({ onLogin, onSignup, onDemo, demoBusy, demoError, signedIn = false }) {
  const stepsRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useScrollProgress(stepsRef);

  return (
    <div className="landing" onClick={scrollToSection}>
      <a className="skip-link" href="#lp-main">
        Skip to content
      </a>
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <a className="lp-brand" href="#top" aria-label="ResearchX home">
            <Logo size={28} />
            <span translate="no">ResearchX</span>
          </a>
          <nav className={`lp-links ${menuOpen ? "open" : ""}`} id="lp-menu" aria-label="Sections">
            {[
              ["#how", "How it works"],
              ["#features", "Features"],
              ["#pricing", "Pricing"],
              ["#about", "About"],
              ["#contact", "Contact"],
            ].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
            <div className="lp-menu-theme">
              <span>Theme</span>
              <ThemeToggle />
            </div>
          </nav>
          <div className="lp-actions">
            <ThemeToggle className="lp-theme-desktop" />
            {signedIn ? (
              <button className="btn btn-primary" onClick={onLogin}>
                Open your projects
              </button>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={onLogin}>
                  Log in
                </button>
                <button className="btn btn-primary" onClick={onSignup}>
                  Start a project
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-icon lp-menu-btn"
              aria-expanded={menuOpen}
              aria-controls="lp-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? "x" : "layers"} size={18} />
            </button>
          </div>
        </div>
      </header>

      <main id="lp-main">
        <section className="lp-hero" id="top">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <h1>
                Know where your research idea stands before you build it.
                <sup>
                  <a href="#fn-1" id="fnref-1" aria-describedby="fn-label">
                    1
                  </a>
                </sup>
              </h1>
              <p className="lp-lede">
                ResearchX reads your idea or GitHub repository, finds the closest published work, scores the opportunity
                on six measurable dimensions, and takes you from a refined proposal to a paper that delivers on it.
              </p>
              <div className="lp-cta">
                <button className="btn btn-primary btn-lg" onClick={onSignup}>
                  Start a project
                </button>
                {onDemo && (
                  <button className="btn btn-secondary btn-lg" onClick={onDemo} disabled={demoBusy}>
                    {demoBusy ? <span className="spinner sm" aria-hidden="true" /> : <Icon name="sparkle" size={16} />}
                    {demoBusy ? "Opening the demo…" : "Try the demo"}
                  </button>
                )}
              </div>
              {demoError && (
                <p className="lp-error" role="alert">
                  {demoError}
                </p>
              )}
              <p className="lp-footnote" id="fn-1">
                <span id="fn-label" className="sr-only">
                  Footnote
                </span>
                <a href="#fnref-1" aria-label="Back to the headline">
                  1
                </a>{" "}
                Measured against papers from OpenAlex, Semantic Scholar and arXiv, ranked by semantic similarity to your
                project.
              </p>
            </div>
            <LiteratureMap />
          </div>
        </section>

        <section className="lp-section" id="how" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 id="how-title">From an idea to a paper, in four steps</h2>
              <p>Each step uses what the previous one produced, and you can stop or go back at any point.</p>
            </div>
            <ol className="lp-steps" ref={stepsRef}>
              {MODULES.map((m) => (
                <li key={m.n} className="lp-step">
                  <span className="lp-step-num" aria-hidden="true">
                    {m.n}
                  </span>
                  <h3>{m.name}</h3>
                  <ul>
                    {m.stages.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <p>{m.output}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-features" id="features" aria-labelledby="features-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 id="features-title">Built around the evidence</h2>
              <p>Every example below is real output from the ResearchX demo workspace.</p>
            </div>
            {FEATURES.map((f) => (
              <article key={f.title} className="lp-feature">
                <div className="lp-feature-copy">
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <ul className="lp-points">
                    {f.points.map((p) => (
                      <li key={p}>
                        <Icon name="check" size={15} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lp-feature-visual">{f.visual}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-about" id="about" aria-labelledby="about-title">
          <div className="lp-wrap lp-about-grid">
            <div>
              <h2 id="about-title">Why ResearchX exists</h2>
              <p className="lp-lede">
                Students often spend months on a project before learning that it was already done, or that it never
                asked a research question at all. ResearchX was built as a software engineering project to make that
                check early, honest and repeatable.
              </p>
              <p>
                It is decision support. It does not guarantee novelty or publication, and every judgement it makes comes
                with the evidence so you and your supervisor can disagree with it.
              </p>
            </div>
            <dl className="lp-principles">
              {PRINCIPLES.map(([t, d]) => (
                <div key={t}>
                  <dt>{t}</dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="lp-section" id="pricing" aria-labelledby="pricing-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 id="pricing-title">Pricing</h2>
              <p>ResearchX is free for students. You can also run it yourself.</p>
            </div>
            <div className="lp-plans">
              <div className="lp-plan is-main">
                <h3>Student</h3>
                <p className="lp-price">
                  <strong>Free</strong>
                </p>
                <ul className="lp-points">
                  {["All live stages, from idea to publication guidance", "Unlimited projects and versions", "Private workspace with trash and restore"].map((p) => (
                    <li key={p}>
                      <Icon name="check" size={15} />
                      {p}
                    </li>
                  ))}
                </ul>
                <button className="btn btn-primary btn-block" onClick={onSignup}>
                  {signedIn ? "Start a project" : "Create a free account"}
                </button>
              </div>
              <div className="lp-plan">
                <h3>Self-hosted</h3>
                <p className="lp-price">
                  <strong>Open source</strong>
                </p>
                <ul className="lp-points">
                  {["Run it on your own machine or server", "Use your own AI and literature API keys", "Runs without an AI key, using rule-based scoring"].map((p) => (
                    <li key={p}>
                      <Icon name="check" size={15} />
                      {p}
                    </li>
                  ))}
                </ul>
                <a className="btn btn-secondary btn-block" href={REPO} target="_blank" rel="noreferrer">
                  <Icon name="github" size={16} /> View the source
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-contact" id="contact" aria-labelledby="contact-title">
          <div className="lp-wrap lp-contact-inner">
            <div>
              <h2 id="contact-title">Questions, bugs or ideas?</h2>
              <p>Open an issue on GitHub. It is the fastest way to reach the team, and others can follow the answer.</p>
            </div>
            <div className="lp-cta">
              <a className="btn btn-secondary btn-lg" href={`${REPO}/issues`} target="_blank" rel="noreferrer">
                <Icon name="message" size={16} /> Open an issue
              </a>
              <button className="btn btn-primary btn-lg" onClick={onSignup}>
                Start a project
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div className="lp-footer-brand">
            <a className="lp-brand" href="#top">
              <Logo size={24} />
              <span translate="no">ResearchX</span>
            </a>
            <p>Decision support for student research. It does not guarantee novelty or publication.</p>
          </div>
          <nav aria-label="Product">
            <h3>Product</h3>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <nav aria-label="Project">
            <h3>Project</h3>
            <a href="#about">About</a>
            <a href={REPO} target="_blank" rel="noreferrer">
              Source code
            </a>
            <a href="#contact">Contact</a>
          </nav>
          <nav aria-label="Account">
            <h3>Account</h3>
            <button type="button" className="lp-footer-link" onClick={onLogin}>
              {signedIn ? "Your projects" : "Log in"}
            </button>
            <button type="button" className="lp-footer-link" onClick={onSignup}>
              {signedIn ? "New project" : "Create an account"}
            </button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
