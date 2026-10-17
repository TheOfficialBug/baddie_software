import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { useAccess } from '@/auth/useAccess';

import { PageHeader } from '@/components/ui/PageHeader';

import { TeamSection } from '@/features/admin/settings/TeamSection';

/** Everyone who helps run this account's tournaments: invite collaborators by email and set their roles. */
export function TeamPage() {
  useDocumentTitle('Team');
  const access = useAccess();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Organizer desk"
        title="Team"
        description="Invite people to help run your tournaments. They get the organizer desk when they sign in with the invited email."
      />
      {access.memberships.map((m) => (
        <TeamSection key={m.orgId} orgId={m.orgId} />
      ))}
    </div>
  );
}
