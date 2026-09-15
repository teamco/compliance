import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Bug, ClipboardList, Clock, Inbox, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@icore/template-shared';
import { effectiveExceptionStatus } from '@icore/shared/client';
import type {
  Exception,
  ExceptionRenewal,
  Issue,
  IssueValidation,
  Assessment,
} from '@icore/shared';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import { useIssues, usePendingIssueValidations } from '@/queries/issues';
import { useExceptions, usePendingExceptionRenewals } from '@/queries/exceptions';
import { useAssessments } from '@/queries/assessments';

const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type ItemKind = 'issue' | 'exception' | 'assessment';

interface WorkItem {
  kind: ItemKind;
  key: string;
  /** id of the issue/exception/assessment this row opens */
  linkId: string;
  title: string;
  date: string;
}

const KIND_ICON: Record<ItemKind, typeof Bug> = {
  issue: Bug,
  exception: ShieldAlert,
  assessment: ClipboardList,
};

function isMine(userId: string | undefined, ...candidates: (string | null | undefined)[]) {
  return !!userId && candidates.some((c) => c === userId);
}

function buildDueBuckets(
  userId: string | undefined,
  issues: Issue[],
  exceptions: Exception[],
  assessments: Assessment[],
) {
  const now = Date.now();
  const dueSoonCutoff = now + DUE_SOON_WINDOW_MS;
  const overdue: WorkItem[] = [];
  const dueSoon: WorkItem[] = [];

  for (const issue of issues) {
    if (!isMine(userId, issue.ownerId, issue.reporterId)) continue;
    if (issue.status === 'closed' || issue.status === 'wont_fix') continue;
    if (!issue.dueDate) continue;
    const dueAt = new Date(issue.dueDate).getTime();
    const item: WorkItem = {
      kind: 'issue',
      key: `issue-${issue.id}`,
      linkId: issue.id,
      title: issue.title,
      date: issue.dueDate,
    };
    if (dueAt < now) overdue.push(item);
    else if (dueAt <= dueSoonCutoff) dueSoon.push(item);
  }

  for (const exception of exceptions) {
    if (!isMine(userId, exception.ownerId)) continue;
    if (effectiveExceptionStatus(exception) === 'rejected') continue;
    if (!exception.expiresAt) continue;
    const dueAt = new Date(exception.expiresAt).getTime();
    const item: WorkItem = {
      kind: 'exception',
      key: `exception-${exception.id}`,
      linkId: exception.id,
      title: exception.title,
      date: exception.expiresAt,
    };
    if (dueAt < now) overdue.push(item);
    else if (dueAt <= dueSoonCutoff) dueSoon.push(item);
  }

  for (const assessment of assessments) {
    if (!isMine(userId, assessment.ownerId)) continue;
    if (assessment.status === 'completed' || assessment.status === 'archived') continue;
    if (!assessment.dueDate) continue;
    const dueAt = new Date(assessment.dueDate).getTime();
    const item: WorkItem = {
      kind: 'assessment',
      key: `assessment-${assessment.id}`,
      linkId: assessment.id,
      title: assessment.title,
      date: assessment.dueDate,
    };
    if (dueAt < now) overdue.push(item);
    else if (dueAt <= dueSoonCutoff) dueSoon.push(item);
  }

  const byDate = (a: WorkItem, b: WorkItem) => a.date.localeCompare(b.date);
  overdue.sort(byDate);
  dueSoon.sort(byDate);
  return { overdue, dueSoon };
}

function buildPendingReview(
  issues: Issue[],
  exceptions: Exception[],
  pendingValidations: IssueValidation[],
  pendingRenewals: ExceptionRenewal[],
) {
  const items: WorkItem[] = [];

  for (const validation of pendingValidations) {
    const issue = issues.find((i) => i.id === validation.issueId);
    if (!issue) continue;
    items.push({
      kind: 'issue',
      key: `validation-${validation.id}`,
      linkId: issue.id,
      title: issue.title,
      date: validation.createdAt,
    });
  }

  for (const renewal of pendingRenewals) {
    const exception = exceptions.find((e) => e.id === renewal.exceptionId);
    if (!exception) continue;
    items.push({
      kind: 'exception',
      key: `renewal-${renewal.id}`,
      linkId: exception.id,
      title: exception.title,
      date: renewal.createdAt,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

function WorkItemRow({ item }: { item: WorkItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const Icon = KIND_ICON[item.kind];

  function handleClick() {
    if (item.kind === 'assessment') {
      void navigate({ to: '/assessments/$id', params: { id: item.linkId } });
    } else if (item.kind === 'issue') {
      void navigate({ to: '/issues', search: { open: item.linkId } });
    } else {
      void navigate({ to: '/exceptions', search: { open: item.linkId } });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left cursor-pointer transition-colors hover:bg-muted/40"
    >
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {t(`myWork.type.${item.kind}`)} · {new Date(item.date).toLocaleDateString()}
        </p>
      </div>
    </button>
  );
}

function WorkSection({
  title,
  icon: Icon,
  items,
  emptyLabel,
}: {
  title: string;
  icon: typeof Clock;
  items: WorkItem[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <WorkItemRow key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MyWorkPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: issues = [], isPending: issuesPending } = useIssues(orgId);
  const { data: exceptions = [], isPending: exceptionsPending } = useExceptions(orgId);
  const { data: assessments = [], isPending: assessmentsPending } = useAssessments(orgId);
  const { data: pendingValidations = [] } = usePendingIssueValidations(orgId);
  const { data: pendingRenewals = [] } = usePendingExceptionRenewals(orgId);

  const isPending = issuesPending || exceptionsPending || assessmentsPending;

  const { overdue, dueSoon } = useMemo(
    () => buildDueBuckets(user?.id, issues, exceptions, assessments),
    [user?.id, issues, exceptions, assessments],
  );

  const pendingReview = useMemo(
    () => buildPendingReview(issues, exceptions, pendingValidations, pendingRenewals),
    [issues, exceptions, pendingValidations, pendingRenewals],
  );

  const totalItems = overdue.length + dueSoon.length + pendingReview.length;

  return (
    <PageLayout title={t('nav.myWork')} description={t('myWork.subtitle')}>
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : !orgId ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Inbox size={32} className="opacity-30" />
          <p className="text-sm">{t('myWork.noOrg')}</p>
        </div>
      ) : totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Inbox size={32} className="opacity-30" />
          <p className="text-sm">{t('myWork.empty')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <WorkSection
            title={t('myWork.overdue')}
            icon={AlertTriangle}
            items={overdue}
            emptyLabel={t('myWork.emptyOverdue')}
          />
          <WorkSection
            title={t('myWork.dueSoon')}
            icon={Clock}
            items={dueSoon}
            emptyLabel={t('myWork.emptyDueSoon')}
          />
          <WorkSection
            title={t('myWork.pendingReview')}
            icon={ShieldAlert}
            items={pendingReview}
            emptyLabel={t('myWork.emptyPendingReview')}
          />
        </div>
      )}
    </PageLayout>
  );
}
