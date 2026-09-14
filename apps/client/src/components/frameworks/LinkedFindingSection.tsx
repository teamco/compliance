import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useControlFindings,
  useCreateIssueFromFinding,
  useLinkFindingToIssue,
  type InternalControl,
} from '@/queries/frameworks';
import { useIssues } from '@/queries/issues';
import { useOrgMembers } from '@/queries/org-members';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-500/10 text-red-400 border-red-500/20',
  remediated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  accepted: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-blue-500/20 text-blue-400',
};

interface LinkedFindingSectionProps {
  findingId: string;
  controlId: string;
  orgId: string;
  frameworkId: string;
  internalControls: InternalControl[];
}

export function LinkedFindingSection({
  findingId,
  controlId,
  orgId,
  frameworkId: _frameworkId,
  internalControls: _internalControls,
}: LinkedFindingSectionProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { data: findings } = useControlFindings(controlId, orgId);
  const finding = findings?.find((f) => f.id === findingId);

  const { data: issues = [] } = useIssues(orgId);
  const { data: members = [] } = useOrgMembers(orgId);

  const createIssueMut = useCreateIssueFromFinding(findingId);
  const linkIssueMut = useLinkFindingToIssue(findingId);

  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [linkIssueOpen, setLinkIssueOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [issueOwnerId, setIssueOwnerId] = useState('');

  function closeCreateIssue() {
    setCreateIssueOpen(false);
    setIssueOwnerId('');
  }
  function closeLinkIssue() {
    setLinkIssueOpen(false);
    setSelectedIssueId('');
  }

  if (!finding) return null;

  return (
    <div className="p-3 rounded-lg bg-surface border border-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-foreground">{finding.code}</span>
          <span className="text-xs text-foreground font-medium">{finding.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${SEVERITY_COLORS[finding.severity]}`}
          >
            {finding.severity}
          </span>
          <span
            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${STATUS_COLORS[finding.status]}`}
          >
            {finding.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">
            {t('frameworks.drawer.findingBridge.issueTitle', 'Issue')}
          </p>
          {finding.linkedIssueId ? (
            <Link to="/issues" className="underline text-muted-foreground hover:text-foreground">
              {t('frameworks.drawer.findingBridge.linked', 'Linked')}
            </Link>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setCreateIssueOpen(true)}>
                {t('frameworks.drawer.findingBridge.createIssue', 'Create New Issue')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLinkIssueOpen(true)}>
                {t('frameworks.drawer.findingBridge.linkIssue', 'Link Existing')}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={createIssueOpen} onOpenChange={(o) => !o && closeCreateIssue()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('frameworks.drawer.findingBridge.createIssue', 'Create New Issue')}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t('frameworks.drawer.findingBridge.selectOwner', 'Owner')}</Label>
            <Combobox
              options={members.map((m) => ({ value: m.userId, label: m.displayName }))}
              value={issueOwnerId}
              onChange={setIssueOwnerId}
              placeholder={t('frameworks.drawer.findingBridge.selectOwner', 'Select owner...')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateIssue}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!issueOwnerId || createIssueMut.isPending}
              onClick={() =>
                createIssueMut.mutate(
                  {
                    title: finding.title,
                    description: finding.description,
                    severity: finding.severity,
                    ownerId: issueOwnerId,
                  },
                  {
                    onSuccess: () => {
                      closeCreateIssue();
                      notify.success(
                        t('frameworks.drawer.findingBridge.issueCreated', 'Issue created'),
                      );
                    },
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('frameworks.drawer.findingBridge.createIssue', 'Create New Issue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkIssueOpen} onOpenChange={(o) => !o && closeLinkIssue()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('frameworks.drawer.findingBridge.linkIssue', 'Link Existing Issue')}
            </DialogTitle>
          </DialogHeader>
          <Combobox
            options={issues.map((i) => ({ value: i.id, label: i.title }))}
            value={selectedIssueId}
            onChange={setSelectedIssueId}
            placeholder={t('frameworks.drawer.findingBridge.selectIssue', 'Select an issue...')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeLinkIssue}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedIssueId || linkIssueMut.isPending}
              onClick={() =>
                linkIssueMut.mutate(
                  { issueId: selectedIssueId },
                  {
                    onSuccess: () => closeLinkIssue(),
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('frameworks.drawer.findingBridge.linkIssue', 'Link Existing Issue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
