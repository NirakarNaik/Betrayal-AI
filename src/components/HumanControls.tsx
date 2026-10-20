"use client";

import { useMemo, useState } from "react";
import type { RulesetConfig } from "@/game/config";
import type { ActionProposal, ActionType, LegalActionOption } from "@/game/types";
import type { MatchView } from "@/game/visibility";
import { ACTION_META, describeProposal, playerColor } from "@/lib/ui";

type Send = (body: unknown) => Promise<boolean>;

// ---------------------------------------------------------------------------
// ActionSelector + ActionCommitButton
// ---------------------------------------------------------------------------

export function ActionSelector({
  options,
  view,
  value,
  onChange,
}: {
  options: LegalActionOption[];
  view: MatchView;
  value: { action: ActionType | null; targetId: string | null; amount: number };
  onChange: (v: { action: ActionType | null; targetId: string | null; amount: number }) => void;
}) {
  const selected = options.find((o) => o.action === value.action) ?? null;
  const nameOf = (id: string) => view.players.find((p) => p.id === id);
  const costText = (o: LegalActionOption) =>
    [o.cost.credits ? `${o.cost.credits}cr` : null, o.cost.intel ? `${o.cost.intel} intel` : null, o.cost.influence ? `${o.cost.influence} inf` : null].filter(Boolean).join(" + ") ||
    (o.action === "trade" ? "amount" : "free");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Primary action">
        {options.map((o) => {
          const meta = ACTION_META[o.action];
          const active = value.action === o.action;
          return (
            <button
              key={o.action}
              role="radio"
              aria-checked={active}
              disabled={!o.affordable}
              title={o.reasonUnavailable ?? meta.blurb}
              onClick={() => onChange({ action: o.action, targetId: o.requiresTarget ? (o.validTargets.includes(value.targetId ?? "") ? value.targetId : null) : null, amount: Math.max(1, Math.min(value.amount, o.maxAmount || 1)) })}
              className={`rounded-[4px] border px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${active ? "bg-surface-3" : "bg-surface-2 hover:bg-surface-3"}`}
              style={{ borderColor: active ? meta.tone : "#2a2347" }}
            >
              <span className="block font-display text-[13px] font-bold" style={{ color: meta.tone }}>
                {meta.label}
              </span>
              <span className="block font-mono text-[10px] text-ink-faint">{o.affordable ? costText(o) : o.reasonUnavailable}</span>
            </button>
          );
        })}
      </div>
      {selected && <p className="text-xs text-ink-dim">{ACTION_META[selected.action].blurb}</p>}
      {selected?.requiresTarget && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">Target</p>
          <div className="flex flex-wrap gap-1.5">
            {selected.validTargets.map((id) => {
              const p = nameOf(id)!;
              return (
                <button
                  key={id}
                  onClick={() => onChange({ ...value, targetId: id })}
                  aria-pressed={value.targetId === id}
                  className={`rounded-[3px] border px-2.5 py-1 font-display text-sm ${value.targetId === id ? "bg-surface-3" : "bg-surface-2"}`}
                  style={{ borderColor: value.targetId === id ? playerColor(p) : "#2a2347", color: playerColor(p) }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {selected?.requiresAmount && (
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            Amount ({value.amount} of max {selected.maxAmount})
          </span>
          <input type="range" min={1} max={Math.max(1, selected.maxAmount)} value={value.amount} onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })} className="w-full accent-emerald-400" />
        </label>
      )}
    </div>
  );
}

export function ActionCommitButton({ proposal, busy, onCommit, label }: { proposal: ActionProposal | null; busy: boolean; onCommit: () => void; label: string }) {
  return (
    <button className="btn btn-primary w-full" disabled={!proposal || busy} onClick={onCommit}>
      {busy ? "Locking…" : proposal ? `Lock in: ${label}` : "Select an action"}
    </button>
  );
}

export function CommitDock({ view, send, busy }: { view: MatchView; send: Send; busy: boolean }) {
  const self = view.self!;
  const [sel, setSel] = useState<{ action: ActionType | null; targetId: string | null; amount: number }>({ action: null, targetId: null, amount: 1 });
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  const proposal = useMemo<ActionProposal | null>(() => {
    const o = self.legalActions.find((a) => a.action === sel.action);
    if (!o || !o.affordable) return null;
    if (o.requiresTarget && !sel.targetId) return null;
    switch (o.action) {
      case "trade":
        return { action: "trade", targetId: sel.targetId!, amount: sel.amount };
      case "strike":
      case "investigate":
      case "sabotage":
      case "mediate":
        return { action: o.action, targetId: sel.targetId! };
      default:
        return { action: o.action } as ActionProposal;
    }
  }, [sel, self.legalActions]);

  if (self.committed) {
    return (
      <div className="space-y-2">
        <p className="font-display text-sm text-emerald-300">Locked in: {describeProposal(self.committed.proposal, nameOf)}</p>
        <p className="text-xs text-ink-faint">Your action is sealed and cannot change. Waiting for the other players — results appear at the reveal.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <OfferInbox view={view} send={send} busy={busy} />
      <ActionSelector options={self.legalActions} view={view} value={sel} onChange={setSel} />
      <ActionCommitButton proposal={proposal} busy={busy} label={proposal ? describeProposal(proposal, nameOf) : ""} onCommit={() => proposal && void send({ type: "commit", proposal })} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offers + PrivateMessagePanel
// ---------------------------------------------------------------------------

export function OfferInbox({ view, send, busy }: { view: MatchView; send: Send; busy: boolean }) {
  const offers = view.self?.pendingOffers ?? [];
  if (offers.length === 0) return null;
  const nameOf = (id: string) => view.players.find((p) => p.id === id);
  return (
    <div className="space-y-1.5" aria-label="Pending offers">
      <p className="font-mono text-[10px] uppercase tracking-wider text-violet-300">Offers awaiting your answer</p>
      {offers.map((o) => {
        const from = nameOf(o.fromId);
        return (
          <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-[4px] border border-dashed border-violet-400/50 bg-violet-950/30 px-2.5 py-2 text-xs">
            <span className="font-display font-bold" style={{ color: from ? playerColor(from) : undefined }}>
              {from?.name}
            </span>
            <span className="text-ink-dim">
              {o.offerCredits > 0 ? `${o.offerCredits} credits` : ""}
              {o.offerCredits > 0 && o.proposePact ? " + " : ""}
              {o.proposePact ? "non-aggression pact" : ""}
            </span>
            <span className="w-full text-ink-faint">“{o.text}”</span>
            <button className="btn btn-cyan px-2 py-1 text-[11px]" disabled={busy} onClick={() => void send({ type: "respond_offer", messageId: o.id, accept: true })}>
              Accept
            </button>
            <button className="btn px-2 py-1 text-[11px]" disabled={busy} onClick={() => void send({ type: "respond_offer", messageId: o.id, accept: false })}>
              Decline
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function PrivateMessagePanel({ view, rules, send, busy }: { view: MatchView; rules: RulesetConfig; send: Send; busy: boolean }) {
  const self = view.self!;
  const me = view.players.find((p) => p.id === self.playerId)!;
  const others = view.players.filter((p) => p.alive && p.id !== me.id);
  const [toId, setToId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [credits, setCredits] = useState(0);
  const [pact, setPact] = useState(false);
  const done = view.players.find((p) => p.id === me.id)?.doneNegotiating ?? false;
  const maxOffer = Math.min(rules.negotiation.maxOfferCredits, me.credits);
  const isPrivate = toId !== null;
  const canSend = !busy && !done && self.messagesRemaining > 0 && text.trim().length > 0 && text.length <= rules.negotiation.maxMessageLength;

  async function submit() {
    const ok = await send({ type: "message", message: { toId, text: text.trim(), offerCredits: isPrivate ? credits : 0, proposePact: isPrivate && pact } });
    if (ok) {
      setText("");
      setCredits(0);
      setPact(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-2">
        <OfferInbox view={view} send={send} busy={busy} />
        <p className="text-xs text-ink-faint">You are done negotiating. Waiting for the agents to finish their messages…</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <OfferInbox view={view} send={send} busy={busy} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Recipient">
        <button role="radio" aria-checked={toId === null} onClick={() => setToId(null)} className={`chip ${toId === null ? "border-cyan-400 text-cyan-200" : "text-ink-dim"}`}>
          Public
        </button>
        {others.map((p) => (
          <button key={p.id} role="radio" aria-checked={toId === p.id} onClick={() => setToId(p.id)} className={`chip ${toId === p.id ? "border-violet-300 text-violet-100" : "text-ink-dim"}`} style={{ color: toId === p.id ? undefined : playerColor(p) }}>
            {p.name}
          </button>
        ))}
      </div>
      <textarea
        className="input min-h-16 resize-none"
        maxLength={rules.negotiation.maxMessageLength}
        placeholder={isPrivate ? "Private message (only you and the recipient will see it)" : "Public statement to the table"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Message text"
      />
      {isPrivate && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase text-ink-faint">Offer credits</span>
            <input type="number" min={0} max={maxOffer} value={credits} onChange={(e) => setCredits(Math.max(0, Math.min(maxOffer, Math.floor(Number(e.target.value) || 0))))} className="input w-16 py-1" />
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={pact} onChange={(e) => setPact(e.target.checked)} className="accent-emerald-400" />
            <span>Propose non-aggression pact</span>
          </label>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-ink-faint">
          {self.messagesRemaining} message(s) left · {text.length}/{rules.negotiation.maxMessageLength}
        </span>
        <div className="flex gap-2">
          <button className="btn" disabled={busy} onClick={() => void send({ type: "end_negotiation" })}>
            Done negotiating
          </button>
          <button className="btn btn-primary" disabled={!canSend} onClick={() => void submit()}>
            Send
          </button>
        </div>
      </div>
      {credits > 0 && <p className="text-[11px] text-amber-200/80">Offered credits are held in escrow and delivered only if the recipient accepts. Promises in text are not binding.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VotePanel
// ---------------------------------------------------------------------------

export function VotePanel({ view, send, busy }: { view: MatchView; send: Send; busy: boolean }) {
  const self = view.self!;
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const alive = view.players.filter((p) => p.alive);
  if (self.vote !== undefined) {
    const t = self.vote ? view.players.find((p) => p.id === self.vote)?.name : "abstain";
    return <p className="font-display text-sm text-emerald-300">Vote sealed: {t}. Waiting for the other players…</p>;
  }
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-ink-dim">Vote to eliminate a player. A strict majority of living players ({Math.floor(alive.length / 2) + 1}) is required; ties do nothing.</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Vote target">
        {alive.map((p) => (
          <button key={p.id} role="radio" aria-checked={choice === p.id} onClick={() => setChoice(p.id)} className={`rounded-[3px] border px-2.5 py-1 font-display text-sm ${choice === p.id ? "bg-rose-500/20" : "bg-surface-2"}`} style={{ borderColor: choice === p.id ? "#f43f5e" : "#2a2347", color: playerColor(p) }}>
            {p.name}
            {p.id === self.playerId ? " (you)" : ""}
          </button>
        ))}
        <button role="radio" aria-checked={choice === null} onClick={() => setChoice(null)} className={`rounded-[3px] border px-2.5 py-1 font-display text-sm ${choice === null ? "border-ink-dim bg-surface-3" : "border-line bg-surface-2"} text-ink-dim`}>
          Abstain
        </button>
      </div>
      <button className="btn btn-danger w-full" disabled={choice === undefined || busy} onClick={() => void send({ type: "vote", targetId: choice ?? null })}>
        {busy ? "Sealing…" : "Seal vote"}
      </button>
    </div>
  );
}
