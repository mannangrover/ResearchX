import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Alert, StageCard } from "./common";

const TEXT_FIELDS = [
  ["refined_title", "Refined title", 1],
  ["problem_statement", "Problem statement", 3],
  ["approach", "Approach", 3],
  ["differentiation", "How it differs from the closest papers", 2],
];
const LIST_FIELDS = [
  ["research_questions", "Research questions"],
  ["contributions", "Expected contributions"],
  ["assumptions", "Assumptions"],
  ["constraints", "Constraints"],
  ["out_of_scope", "Out of scope"],
  ["changes_from_original", "Changes from the original idea"],
];

const toDraft = (p) =>
  Object.fromEntries([
    ...TEXT_FIELDS.map(([k]) => [k, p?.[k] || ""]),
    ...LIST_FIELDS.map(([k]) => [k, (p?.[k] || []).join("\n")]),
  ]);

const fromDraft = (d) =>
  Object.fromEntries([
    ...TEXT_FIELDS.map(([k]) => [k, d[k].trim()]),
    ...LIST_FIELDS.map(([k]) => [k, d[k].split("\n").map((s) => s.trim()).filter(Boolean)]),
  ]);

function Chat({ messages, busy, onSend }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, busy]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <span className="msg-avatar" aria-hidden="true">
              {m.role === "user" ? "You" : <Icon name="sparkle" size={14} />}
            </span>
            <div className="msg-bubble">
              <span className="msg-who">{m.role === "user" ? "You" : "ResearchX advisor"}</span>
              <p>{m.content}</p>
            </div>
          </div>
        ))}
        {busy === "message" && (
          <div className="msg msg-assistant">
            <span className="msg-avatar" aria-hidden="true">
              <Icon name="sparkle" size={14} />
            </span>
            <div className="msg-bubble">
              <span className="msg-who">ResearchX advisor</span>
              <p className="typing">
                <span />
                <span />
                <span />
                <span className="sr-only">Thinking…</span>
              </p>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={send}>
        <textarea
          rows={2}
          name="message"
          aria-label="Message to the advisor"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) send(e);
          }}
          placeholder="Reply with your preferred direction, timeline, data, compute or skills… (Enter to send, Shift+Enter for a new line)"
          disabled={!!busy}
        />
        <button className="btn btn-primary btn-send" disabled={!!busy || !text.trim()} aria-label="Send message">
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
}

function ProposalEditor({ proposal, approved, busy, onSave, onSpinoff, derivedId, onOpenProject }) {
  const [draft, setDraft] = useState(() => toDraft(proposal));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(toDraft(proposal));
    setDirty(false);
  }, [proposal]);

  const set = (key) => (e) => {
    setDraft({ ...draft, [key]: e.target.value });
    setDirty(true);
  };

  return (
    <div className="proposal">
      <div className="proposal-head">
        <h3 className="sub-title">
          <Icon name="file" size={15} /> Refined proposal
        </h3>
        <span className={`chip ${approved && !dirty ? "chip-ok" : dirty ? "chip-warn" : ""}`}>
          {approved && !dirty && <Icon name="check" size={12} />}
          {approved && !dirty ? "Approved" : dirty ? "Unsaved edits" : "Draft — review and approve"}
        </span>
      </div>
      <p className="small muted">Edit anything you disagree with. List fields take one item per line.</p>

      <div className="proposal-grid">
        {TEXT_FIELDS.map(([k, label, rows]) => (
          <div key={k} className="field span-2">
            <label htmlFor={`p-${k}`}>{label}</label>
            {rows === 1 ? (
              <input id={`p-${k}`} name={k} autoComplete="off" value={draft[k]} onChange={set(k)} />
            ) : (
              <textarea id={`p-${k}`} name={k} rows={rows} value={draft[k]} onChange={set(k)} />
            )}
          </div>
        ))}
        {LIST_FIELDS.map(([k, label]) => (
          <div key={k} className="field">
            <label htmlFor={`p-${k}`}>{label}</label>
            <textarea id={`p-${k}`} name={k} rows={4} value={draft[k]} onChange={set(k)} />
          </div>
        ))}
      </div>

      <div className="form-actions">
        {dirty && (
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => onSave(fromDraft(draft), false)}>
            Save Edits
          </button>
        )}
        {(!approved || dirty) && (
          <button className="btn btn-primary" disabled={!!busy} onClick={() => onSave(fromDraft(draft), true)}>
            <Icon name="check" size={15} />
            {busy === "save" ? "Saving…" : "Approve Proposal"}
          </button>
        )}
        {approved && !dirty && !derivedId && (
          <button className="btn btn-primary" disabled={!!busy} onClick={onSpinoff}>
            {busy === "spinoff" ? "Creating…" : "Create Refined Project & Score It"}
            <Icon name="arrowRight" size={15} />
          </button>
        )}
        {approved && !dirty && derivedId && (
          <button className="btn btn-primary" onClick={() => onOpenProject(derivedId)}>
            Open Refined Project <Icon name="arrowRight" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function RefinementPanel({ project, api, onUpdated, onOpenProject, disabled }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const state = project.refinement;

  const run = async (kind, fn) => {
    setBusy(kind);
    setError("");
    try {
      const result = await fn();
      if (result) onUpdated(result);
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    if (confirm("Start the discussion over? The conversation and proposal will be cleared.")) {
      run("reset", () => api.refineReset(project.id));
    }
  };

  const spinoff = async () => {
    setBusy("spinoff");
    setError("");
    try {
      const created = await api.refineSpinoff(project.id);
      onUpdated(await api.getProject(project.id));
      onOpenProject(created.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!state) {
    return (
      <StageCard
        stage={6}
        title="Interactive refinement"
        description="Discuss the score, gaps and your constraints with the ResearchX advisor, then turn the conversation into a refined research proposal that you review and approve."
        action={
          <button className="btn btn-primary" disabled={disabled || !!busy} onClick={() => run("start", () => api.refineStart(project.id))}>
            {busy === "start" ? <span className="spinner sm" aria-hidden="true" /> : <Icon name="message" size={14} />}
            {busy === "start" ? "Starting…" : "Start Discussion"}
          </button>
        }
      >
        {error && <Alert kind="error">{error}</Alert>}
      </StageCard>
    );
  }

  return (
    <StageCard
      stage={6}
      title="Interactive refinement"
      done={state.approved}
      method={state.method}
      action={
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={reset}>
          <Icon name="refresh" size={13} /> Start Over
        </button>
      }
    >
      <Chat
        messages={state.messages}
        busy={busy}
        onSend={(text) => run("message", () => api.refineMessage(project.id, text))}
      />
      <div className="form-actions">
        <button className="btn btn-secondary" disabled={!!busy} onClick={() => run("propose", () => api.refinePropose(project.id))}>
          {busy === "propose" ? <span className="spinner sm" aria-hidden="true" /> : <Icon name="file" size={14} />}
          {busy === "propose" ? "Drafting…" : state.proposal ? "Re-draft Proposal From Discussion" : "Draft Refined Proposal"}
        </button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {state.proposal && (
        <ProposalEditor
          proposal={state.proposal}
          approved={state.approved}
          busy={busy}
          derivedId={state.derived_project_id}
          onSave={(proposal, approved) => run("save", () => api.refineSaveProposal(project.id, proposal, approved))}
          onSpinoff={spinoff}
          onOpenProject={onOpenProject}
        />
      )}
    </StageCard>
  );
}
