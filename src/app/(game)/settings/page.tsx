'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGame } from '@/store/game';
import { formatDate } from '@/lib/calendar';
import { money } from '@/lib/format';
import { deleteSave, listSaves, saveGame, SLOTS, type SlotMeta } from '@/store/saves';
import { Button, PageHeader, Panel } from '@/components/ui';

export default function Settings() {
  const { state: s, load, quit, act, dbSource } = useGame();
  const router = useRouter();
  const [saves, setSaves] = useState<SlotMeta[]>([]);
  const [note, setNote] = useState('');
  useEffect(() => { listSaves().then(setSaves); }, [s?.savedAt]);
  if (!s) return null;
  const copyTo = async (slot: string) => {
    await saveGame({ ...s, slot });
    setSaves(await listSaves());
    setNote(`Copied to ${slot}.`);
  };
  const exportSave = () => {
    const blob = new Blob([JSON.stringify(s)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `studio-head-sim-${s.studio.name.replace(/\W+/g, '-')}-${s.t}.json`;
    a.click();
  };
  return (
    <div>
      <PageHeader title="Saves & Settings" sub={`Autosaves every turn to ${s.slot}. Seed: ${s.seed}`} />
      <Panel title="Save slots">
        <div className="space-y-2">
          {SLOTS.map((slot) => {
            const m = saves.find((x) => x.slot === slot);
            const cur = slot === s.slot;
            return (
              <div key={slot} className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${cur ? 'border-gold bg-gold/5' : 'border-line bg-panel2'}`}>
                <span className="w-12 text-xs text-muted">{slot}</span>
                <span className="min-w-0 flex-1 text-sm">{m ? <>{m.studioName} <span className="text-muted">· {formatDate(m.t)} · {money(m.cash)}</span></> : <span className="text-muted">Empty</span>}{cur && <span className="ml-2 text-gold">(playing)</span>}</span>
                {!cur && m && <Button size="sm" onClick={async () => { await load(slot); router.push('/hq'); }}>Load</Button>}
                {!cur && <Button size="sm" variant="ghost" onClick={() => { if (!m || confirm(`Overwrite ${slot}?`)) copyTo(slot); }}>Save copy here</Button>}
                {!cur && m && <Button size="sm" variant="danger" onClick={async () => { if (confirm('Delete this save?')) { await deleteSave(slot); setSaves(await listSaves()); } }}>Delete</Button>}
              </div>
            );
          })}
        </div>
        {note && <div className="mt-2 text-sm text-emerald-300">{note}</div>}
      </Panel>
      <Panel title="Game" className="mt-5">
        <div className="space-y-2 text-sm">
          <div>Difficulty: <span className="capitalize text-gold">{s.settings.difficulty}</span> · Crew: <span className="text-gold">{s.settings.crewMode === 'full' ? 'Full Crew' : 'Standard'}</span> · Start: <span className="text-gold">{s.settings.startBudget}</span></div>
          <div>Talent database: <span className="text-gold">{dbSource === 'tmdb' ? 'Real actors (TMDB)' : 'Fictional demo roster'}</span></div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="ghost" onClick={() => act((d) => { d.inbox.forEach((m) => (m.read = true)); })}>Mark inbox read</Button>
            <Button variant="ghost" onClick={exportSave}>Export save (.json)</Button>
            <Button variant="danger" onClick={() => { quit(); router.push('/'); }}>Quit to title</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
