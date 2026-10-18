import { useState } from 'react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNow } from '@/hooks/useNow';

import { useLookup } from '@/data/lookup';

import { useAccess } from '@/auth/useAccess';

import { NoticeItem } from '@/components/notices/Notices';
import { useNoticesFor } from '@/components/notices/useNotices';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { SectionHead } from '@/components/ui/Section';
import { Switch } from '@/components/ui/Switch';
import { FilterChips } from '@/components/ui/Tabs';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

import { NextMatchHero } from '@/features/public/me/NextMatchHero';
import { PlayerDetail } from '@/features/public/tournament/Players';

export function MyMatches() {
  useDocumentTitle('My matches');
  const lk = useLookup();
  const { playerId, user } = useAccess();
  const notices = useNoticesFor(playerId);
  const now = useNow(30000);
  const me = lk.player(playerId ?? undefined);
  const myTournaments = lk.tournaments.filter((t) => me && lk.entriesOfPlayer(me.id, t.id).length > 0);
  const live = myTournaments.find((t) => t.status === 'live');
  const [tid, setTid] = useState<string | undefined>(live?.id ?? myTournaments[0]?.id);
  const t = (tid ? myTournaments.find((x) => x.id === tid) : undefined) ?? live ?? myTournaments[0];
  const [allNotices, setAllNotices] = useState(false);
  const [prefs, setPrefs] = useState({ called: true, draw: true, early: false });

  const shownNotices = allNotices ? notices : notices.slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={me?.name ?? user?.name ?? '?'} size={60} />
          <div className="min-w-0">
            <div className="eyebrow">My matches</div>
            <h1 className="truncate font-display text-[clamp(28px,4.2vw,40px)] font-extrabold leading-[1.05]">{me?.name ?? user?.name}</h1>
            <p className="truncate text-[14px] text-muted">{me ? me.club : user?.email}</p>
          </div>
        </div>
        <ButtonLink to="/account" variant="secondary" icon={<Icon name="settings" size={18} />} className="self-start md:self-auto">
          Account settings
        </ButtonLink>
      </header>

      {!me || !t ? (
        <Empty
          icon="calendar"
          title="No tournaments yet"
          body="When you enter a tournament, your next match, results and messages from the desk show up here."
          action={
            <ButtonLink to="/" variant="primary">
              Find a tournament
            </ButtonLink>
          }
        />
      ) : (
        <>
          {myTournaments.length > 1 && (
            <FilterChips
              label="Tournament"
              value={t.id}
              onChange={setTid}
              options={myTournaments.map((x) => ({ value: x.id, label: x.name }))}
            />
          )}

          {t.status === 'live' && <NextMatchHero lk={lk} t={t} playerId={me.id} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="order-2 min-w-0 lg:order-1">
              <PlayerDetail t={t} lk={lk} p={me} header={false} />
            </div>

            <aside className="order-1 flex min-w-0 flex-col gap-6 lg:order-2">
              <section aria-labelledby="desk-msgs">
                <SectionHead
                  title={<span id="desk-msgs">Messages from the desk</span>}
                  description="Court calls, delays and announcements sent to you."
                />
                {notices.length === 0 ? (
                  <Empty
                    icon="bell"
                    title="No messages yet"
                    body="When the desk calls your match or posts an update, you'll see it here."
                  />
                ) : (
                  <div className="panel px-4">
                    <div className="flex flex-col divide-y divide-line">
                      {shownNotices.map((n) => (
                        <NoticeItem key={n.id} n={n} now={now} compact />
                      ))}
                    </div>
                    {notices.length > 4 && (
                      <div className="border-t border-line py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setAllNotices((v) => !v)}
                          iconRight={<Icon name={allNotices ? 'up' : 'down'} size={16} />}
                        >
                          {allNotices ? 'Show fewer' : `Show all ${notices.length} messages`}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section aria-labelledby="prefs">
                <SectionHead title={<span id="prefs">Notifications</span>} description="Choose how we reach you on match day." />
                <div className="panel flex flex-col divide-y divide-line px-4 py-1">
                  <div className="py-2">
                    <Switch
                      label="Text me when I'm called"
                      description="A text with your court number."
                      on={prefs.called}
                      onChange={(v) => setPrefs({ ...prefs, called: v })}
                    />
                  </div>
                  <div className="py-2">
                    <Switch
                      label="Email me when draws are out"
                      description="So you can see who you play first."
                      on={prefs.draw}
                      onChange={(v) => setPrefs({ ...prefs, draw: v })}
                    />
                  </div>
                  <div className="py-2">
                    <Switch
                      label="Heads-up 2 matches before mine"
                      description="Time to warm up before the call."
                      on={prefs.early}
                      onChange={(v) => setPrefs({ ...prefs, early: v })}
                    />
                  </div>
                </div>
              </section>

              <section aria-labelledby="display">
                <SectionHead title={<span id="display">Display</span>} />
                <div className="panel flex flex-col gap-3 p-4">
                  <div>
                    <div className="text-[14px] font-semibold">Theme</div>
                    <div className="text-[13px] text-muted">Auto follows your phone's light or dark setting.</div>
                  </div>
                  <ThemeToggle labels className="w-full" />
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
