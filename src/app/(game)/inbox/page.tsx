'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useGame } from '@/store/game';
import { formatShort } from '@/lib/calendar';
import { money } from '@/lib/format';
import type { MessageKind } from '@/lib/types';
import { scheduleRelease } from '@/lib/engine/boxoffice';
import { filmById } from '@/lib/engine/util';
import { Button, Empty, PageHeader, Tabs } from '@/components/ui';

const KIND: Record<MessageKind, { icon: string; label: string }> = {
  news: { icon: '📰', label: 'News' }, agent: { icon: '🤝', label: 'Agents' }, rival: { icon: '⚔', label: 'Rivals' },
  board: { icon: '⚖', label: 'Board' }, awards: { icon: '🏆', label: 'Awards' }, event: { icon: '🎬', label: 'Production' },
  finance: { icon: '$', label: 'Finance' }, offer: { icon: '✉', label: 'Offers' },
};

export default function Inbox() {
  const { state: s, act } = useGame();
  const [tab, setTab] = useState<'all' | MessageKind>('all');
  const [open, setOpen] = useState<string | null>(null);
  if (!s) return null;
  const list = s.inbox.filter((m) => tab === 'all' || m.kind === tab);
  const read = (id: string) => act((d) => { const m = d.inbox.find((x) => x.id === id); if (m) m.read = true; });

  return (
    <div>
      <PageHeader title="Inbox" sub={`${s.inbox.filter((m) => !m.read).length} unread`} right={<Button variant="ghost" size="sm" onClick={() => act((d) => d.inbox.forEach((m) => (m.read = true)))}>Mark all read</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All' }, ...(Object.keys(KIND) as MessageKind[]).map((k) => ({ id: k, label: `${KIND[k].icon} ${KIND[k].label}` }))]} />
      {list.length === 0 && <Empty>Nothing here.</Empty>}
      <div className="space-y-2">
        {list.map((m) => {
          const film = m.offer ? filmById(s, m.offer.filmId) : undefined;
          const live = m.offer && m.offer.expires > s.t && film?.stage === 'ready' && !film.release;
          return (
            <div key={m.id} className={`panel overflow-hidden ${m.read ? 'opacity-80' : 'border-gold/30'}`}>
              <button className="flex w-full items-start gap-3 px-4 py-3 text-left" onClick={() => { setOpen(open === m.id ? null : m.id); if (!m.read) read(m.id); }}>
                <span className="mt-0.5 w-5 text-center">{KIND[m.kind].icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${m.read ? '' : 'font-semibold'}`}>{m.title}</span>
                  {open !== m.id && <span className="block truncate text-xs text-muted">{m.body}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{formatShort(m.t)}</span>
              </button>
              {open === m.id && (
                <div className="border-t border-line px-4 py-3 pl-12 text-sm">
                  <p className="whitespace-pre-line text-[#D8D3C8]">{m.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {live && m.offer && (
                      <>
                        <Button size="sm" onClick={() => act((d) => {
                          const f = filmById(d, m.offer!.filmId)!;
                          scheduleRelease(d, f, { type: 'sold', t: d.t, screens: 'limited', marketing: 0, buyer: m.offer!.buyer, price: m.offer!.amount });
                          d.inbox = d.inbox.filter((x) => x.id !== m.id);
                        })}>Accept {money(m.offer.amount)}</Button>
                        <Button size="sm" variant="ghost" onClick={() => act((d) => { d.inbox = d.inbox.filter((x) => x.id !== m.id); })}>Decline</Button>
                      </>
                    )}
                    {m.link && <Link href={m.link} className="link text-sm">Open →</Link>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
