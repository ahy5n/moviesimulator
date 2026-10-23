'use client';
import { useGame } from '@/store/game';
import { yearOf } from '@/lib/calendar';
import { boardLoyaltyLabel, boardSoftening, evaluateTarget, REPRIEVE_AT, BOARD_LOYALTY } from '@/lib/engine/finance';
import { Bar, Empty, PageHeader, Panel } from '@/components/ui';

export default function Board() {
  const s = useGame((x) => x.state)!;
  if (!s.board) return <Empty>No board in Easy mode — you answer to nobody.</Empty>;
  const b = s.board;
  const c = b.confidence;
  const mood = c >= 75 ? 'Delighted' : c >= 55 ? 'Content' : c >= 35 ? 'Restless' : c >= 20 ? 'Furious' : 'Done with you';
  return (
    <div>
      <PageHeader title="Board Room" sub={`The board is ${mood.toLowerCase()}.`} />
      <Panel title="Confidence">
        <div className="mb-2 flex items-baseline gap-3"><span className={`font-marquee text-6xl ${c < 30 ? 'text-red-400' : c > 65 ? 'text-emerald-400' : 'text-gold'}`}>{Math.round(c)}</span><span className="text-muted">/ 100 · {mood}</span></div>
        <div className="relative"><Bar value={c} color={c < 30 ? '#F87171' : c > 65 ? '#34D399' : '#D4AF37'} /><div className="absolute top-0 h-2 w-0.5 bg-red-500" style={{ left: '20%' }} title="Sacking line" /></div>
        <div className="mt-1 text-xs text-muted">Below 20 you&apos;re fired. Met targets +9, missed −11 at year end. Big hits and flops move it in between.</div>
      </Panel>
      <Panel title="Loyalty" className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label">This board&apos;s loyalty to you</div>
            <div className="mt-1 text-2xl font-semibold text-gold">{(b.loyalty ?? 0).toFixed(1)} <span className="text-sm font-normal text-muted">· {boardLoyaltyLabel(b.loyalty ?? 0)}</span></div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              <li>Bad news hits {Math.round((1 - boardSoftening(s)) * 100)}% softer (up to 50%).</li>
              <li>{b.reprieveUsed ? 'Your one last chance has been used.' : (b.loyalty ?? 0) >= REPRIEVE_AT ? 'Loyal enough to give you one last chance instead of firing you.' : `At ${REPRIEVE_AT} they'll give you one last chance instead of firing you.`}</li>
            </ul>
          </div>
          <div>
            <div className="label">Your reputation as a producer</div>
            <div className="mt-1 text-2xl font-semibold">{(s.producer?.reputation ?? 0).toFixed(1)}</div>
            <p className="mt-2 text-xs text-muted">Follows you between studios. If you move, a strong reputation means a warmer new board and better-regarded job offers.</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">Earned by: hits +{BOARD_LOYALTY.hit}, each target met +{BOARD_LOYALTY.target}, each nomination +{BOARD_LOYALTY.nomination}, each win +{BOARD_LOYALTY.win} (full value at the Academy). Flops cost {BOARD_LOYALTY.flop}.</p>
      </Panel>
      <Panel title={`${b.year} targets`} className="mt-5">
        <ul className="space-y-2">
          {b.targets.map((t, i) => {
            const on = yearOf(s.t) === b.year ? evaluateTarget(s, t, b.year) : t.met;
            return <li key={i} className="flex items-center justify-between rounded-lg border border-line bg-panel2 px-3 py-2 text-sm"><span>{t.label}</span><span className={on ? 'text-emerald-400' : 'text-muted'}>{on ? 'On track ✓' : 'Not yet'}</span></li>;
          })}
        </ul>
      </Panel>
      {b.history.length > 0 && (
        <Panel title="History" className="mt-5">
          <table className="tbl"><thead><tr><th>Year</th><th>Targets met</th><th className="text-right">Confidence</th></tr></thead><tbody>
            {b.history.map((h) => <tr key={h.year}><td>{h.year}</td><td>{h.met}/{h.total}</td><td className="text-right">{Math.round(h.confidence)}</td></tr>)}
          </tbody></table>
        </Panel>
      )}
      {s.jobHistory.length > 1 && (
        <Panel title="Career" className="mt-5"><ul className="text-sm">{s.jobHistory.map((j, i) => <li key={i}>{j.studioName} — {yearOf(j.fromT)}{j.toT !== undefined ? `–${yearOf(j.toT)}` : '–present'}</li>)}</ul></Panel>
      )}
    </div>
  );
}
