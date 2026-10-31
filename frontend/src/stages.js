// The 10 workflow stages from SRS section 1.4. `built` marks what this prototype implements.
export const STAGES = [
  { n: 1, name: "Idea / Project Input", short: "Input", icon: "lightbulb", output: "Structured project representation", built: true },
  { n: 2, name: "Project Analysis", short: "Analysis", icon: "cpu", output: "Technical project profile", built: true },
  { n: 3, name: "Literature Analysis", short: "Literature", icon: "book", output: "Related-work set and comparison", built: true },
  { n: 4, name: "Research Opportunity Score", short: "Score", icon: "gauge", output: "ROS with explanation", built: true },
  { n: 5, name: "Research Gap Discovery", short: "Gaps", icon: "target", output: "Potential research directions", built: true },
  { n: 6, name: "Interactive Refinement", short: "Refine", icon: "message", output: "Refined problem and contribution", built: true },
  { n: 7, name: "Experiment Planning", short: "Plan", icon: "flask", output: "Experiment and methodology plan", built: true },
  { n: 8, name: "Paper Development", short: "Paper", icon: "file", output: "Structured research manuscript", built: false },
  { n: 9, name: "Reviewer Simulation", short: "Review", icon: "users", output: "Reviewer feedback and checklist", built: false },
  { n: 10, name: "Publication Guidance", short: "Publish", icon: "rocket", output: "Venue shortlist and readiness", built: false },
];

export const BUILT_STAGES = STAGES.filter((s) => s.built).length;

// Which stage a project has completed, based on stored results
export function completedStage(project) {
  if (project.plan) return 7;
  if (project.refinement?.approved) return 6;
  if (project.score) return 5;
  if (project.literature) return 3;
  if (project.profile) return 2;
  return 1;
}

// The list endpoint stores stage 4 for a scored project; scoring also produces stage 5 (gaps)
export const listStage = (stage) => (stage === 4 ? 5 : stage);

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(iso) {
  if (!iso) return "";
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
