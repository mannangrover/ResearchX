// Hero visual: the student's idea plotted among related papers, with the open
// region marked in highlighter. Positions are fixed (seeded) so the picture is stable.

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const CLUSTERS = [
  { label: "Model quantization", x: 150, y: 120, n: 14, spread: 70 },
  { label: "Face recognition", x: 420, y: 112, n: 16, spread: 78 },
  { label: "Edge hardware", x: 170, y: 330, n: 12, spread: 66 },
  { label: "Attendance systems", x: 470, y: 352, n: 9, spread: 58 },
];

const IDEA = { x: 318, y: 238 };

function buildPapers() {
  const rand = seeded(7);
  const papers = [];
  CLUSTERS.forEach((c, ci) => {
    for (let i = 0; i < c.n; i++) {
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * c.spread;
      const x = c.x + Math.cos(angle) * r;
      const y = c.y + Math.sin(angle) * r * 0.8;
      // keep the gap around the idea empty
      if (Math.hypot(x - IDEA.x, y - IDEA.y) < 74) continue;
      papers.push({ x, y, size: 3 + rand() * 3.5, cluster: ci, year: 2016 + Math.floor(rand() * 10) });
    }
  });
  return papers;
}

const PAPERS = buildPapers();
const NEAREST = [...PAPERS]
  .map((p) => ({ ...p, d: Math.hypot(p.x - IDEA.x, p.y - IDEA.y) }))
  .sort((a, b) => a.d - b.d)
  .slice(0, 3);
const SIM = [0.71, 0.64, 0.58];

export default function LiteratureMap() {
  return (
    <figure className="litmap" aria-labelledby="litmap-caption">
      <svg viewBox="0 0 600 460" role="img" aria-label="Illustration: an idea placed among related papers in four research areas, with the open area around it highlighted as a research gap.">
        <defs>
          <pattern id="litmap-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" className="litmap-grid" />
          </pattern>
        </defs>
        <rect width="600" height="460" fill="url(#litmap-grid)" />

        {/* the gap, marked like a highlighter stroke */}
        <g className="litmap-gap">
          <path d="M248 205c22-14 98-22 138-8 22 8 28 34 14 52-26 32-112 40-146 16-22-16-28-46-6-60z" />
        </g>

        {CLUSTERS.map((c) => (
          <text key={c.label} x={c.x} y={c.y - c.spread * 0.8 - 12} className="litmap-label" textAnchor="middle">
            {c.label}
          </text>
        ))}

        {PAPERS.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.size}
            className={`litmap-paper c${p.cluster}`}
            style={{ "--d": `${(Math.hypot(p.x - IDEA.x, p.y - IDEA.y) / 300).toFixed(2)}s` }}
          >
            <title>{`Related paper, ${p.year}`}</title>
          </circle>
        ))}

        {NEAREST.map((p, i) => (
          <g key={i} className="litmap-link" style={{ "--i": i }}>
            <line x1={IDEA.x} y1={IDEA.y} x2={p.x} y2={p.y} />
            <text x={p.x + (p.x - IDEA.x) * 0.12} y={p.y + (p.y - IDEA.y) * 0.12 + 4} textAnchor="middle">
              {SIM[i].toFixed(2)}
            </text>
          </g>
        ))}

        <g className="litmap-idea">
          <circle cx={IDEA.x} cy={IDEA.y} r="17" className="litmap-idea-ring" />
          <circle cx={IDEA.x} cy={IDEA.y} r="8" className="litmap-idea-dot" />
          <text x={IDEA.x} y={IDEA.y + 42} textAnchor="middle" className="litmap-idea-label">
            Your idea
          </text>
        </g>
      </svg>
      <figcaption id="litmap-caption">
        Illustration of how ResearchX reads the literature. Each dot is a paper; the closer it is, the more similar to
        your idea. The highlighted area is the research gap: related enough to matter, open enough to contribute.
      </figcaption>
    </figure>
  );
}
