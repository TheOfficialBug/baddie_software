import { useEffect, useState } from 'react';

import { env } from '@/config/env';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fmtAgo } from '@/lib/format';
import { reportError } from '@/lib/monitoring';
import { getSupabase } from '@/lib/supabase';

import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Stat } from '@/components/ui/Section';

interface Signup {
  id: string;
  name: string;
  email: string;
  role: 'player' | 'organizer' | 'club';
  club: string | null;
  city: string | null;
  source: string | null;
  created_at: string;
}

const ROLE: Record<Signup['role'], string> = { player: 'Player', organizer: 'Organizer', club: 'Club' };

const csvCell = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`;

function download(rows: Signup[]) {
  const head = ['Name', 'Email', 'Role', 'Club', 'City', 'Source', 'Joined'];
  const body = rows.map((r) => [r.name, r.email, ROLE[r.role], r.club, r.city, r.source, r.created_at].map(csvCell).join(','));
  const url = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'smashboard-waitlist.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

/** Owners and admins: who joined the early-access waitlist. */
export function WaitlistPage() {
  useDocumentTitle('Waitlist');
  const [rows, setRows] = useState<Signup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!env.supabase) {
      setRows([]);
      return;
    }
    void (async () => {
      try {
        const sb = await getSupabase();
        const { data, error: err } = await sb.from('waitlist').select('*').order('created_at', { ascending: false });
        if (err) throw err;
        setRows(data as Signup[]);
      } catch (e) {
        reportError(e, { source: 'waitlist.load' });
        setError('Couldn’t load the waitlist. Only owners and admins can see it.');
      }
    })();
  }, []);

  const count = (r: Signup['role']) => rows?.filter((x) => x.role === r).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Organizer desk"
        title="Waitlist"
        description="People who signed up for early access on the public site (/waitlist)."
        actions={
          rows && rows.length > 0 ? (
            <Button icon={<Icon name="download" size={18} />} onClick={() => download(rows)}>
              Download CSV
            </Button>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Signed up" value={<span className="num">{rows?.length ?? '–'}</span>} />
        <Stat label="Players" value={<span className="num">{count('player')}</span>} />
        <Stat label="Organizers" value={<span className="num">{count('organizer')}</span>} />
        <Stat label="Clubs" value={<span className="num">{count('club')}</span>} />
      </div>
      {error ? (
        <p role="alert" className="text-live">
          {error}
        </p>
      ) : rows && rows.length === 0 ? (
        <Empty icon="users" title="No sign-ups yet" body="Share the /waitlist page; new sign-ups appear here." />
      ) : (
        <ul className="panel flex flex-col divide-y divide-line">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.name}</div>
                <div className="truncate text-[13px] text-muted">
                  {r.email}
                  {r.club ? ` · ${r.club}` : ''}
                  {r.city ? ` · ${r.city}` : ''}
                </div>
              </div>
              <span className="rounded-full bg-sunken px-2.5 py-1 text-[12.5px] font-semibold">{ROLE[r.role]}</span>
              <span className="text-[13px] text-muted">{fmtAgo(Date.parse(r.created_at))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
