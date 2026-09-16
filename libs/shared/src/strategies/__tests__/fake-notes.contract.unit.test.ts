import { FakeNotesStrategy } from '../fakes/fake-notes';
import type {
  AssessmentItemControlMappingInput,
  AssessmentItemPatch,
  AssessmentPatch,
  IssuePatch,
} from '../notes';
import { effectiveExceptionStatus } from '../notes';
import { runNotesContract } from './notes.contract.unit.test';

runNotesContract('FakeNotesStrategy', () => new FakeNotesStrategy());

describe('exceptions', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('creates and lists exceptions for org', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'Cannot implement AC-1',
      justification: 'Legacy system limitation',
      statement: 'S',
      ownerId: 'owner-1',
    });
    expect(exc.status).toBe('pending');
    const list = await s.listExceptions('org1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(exc.id);
  });

  it('carries statement, ownerId, and compensatingControls through create', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'Cannot implement AC-1',
      statement: 'AC-1 requires MFA on all admin accounts.',
      justification: 'Legacy system limitation',
      ownerId: 'user-owner-1',
      compensatingControls: 'Manual quarterly access review',
    });
    expect(exc.statement).toBe('AC-1 requires MFA on all admin accounts.');
    expect(exc.ownerId).toBe('user-owner-1');
    expect(exc.compensatingControls).toBe('Manual quarterly access review');
  });

  it('approves an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const approved = await s.approveException(exc.id, 'approver-1');
    expect(approved.status).toBe('approved');
    expect(approved.reviewedBy).toBe('approver-1');
  });

  it('rejects an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const rejected = await s.rejectException(exc.id, 'approver-1');
    expect(rejected.status).toBe('rejected');
    expect(rejected.reviewedBy).toBe('approver-1');
  });

  it('updates exception fields', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'Old',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const updated = await s.updateException(exc.id, { title: 'New' });
    expect(updated.title).toBe('New');
  });

  it('deletes an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    await s.deleteException(exc.id);
    expect(await s.listExceptions('org1')).toHaveLength(0);
  });

  it('scopes exceptions by orgId', async () => {
    await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    expect(await s.listExceptions('org2')).toHaveLength(0);
  });

  it('rejects self-approval', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    await expect(s.approveException(exc.id, 'owner-1')).rejects.toThrow(
      'exception_self_approval_forbidden',
    );
    await expect(s.rejectException(exc.id, 'owner-1')).rejects.toThrow(
      'exception_self_approval_forbidden',
    );
  });
});

describe('effectiveExceptionStatus', () => {
  it('returns approved when expiresAt is in the future', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    expect(effectiveExceptionStatus({ status: 'approved', expiresAt: future })).toBe('approved');
  });

  it('returns expired when an approved exception has lapsed', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    expect(effectiveExceptionStatus({ status: 'approved', expiresAt: past })).toBe('expired');
  });

  it('leaves pending and rejected unaffected by expiresAt', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    expect(effectiveExceptionStatus({ status: 'pending', expiresAt: past })).toBe('pending');
    expect(effectiveExceptionStatus({ status: 'rejected', expiresAt: past })).toBe('rejected');
  });

  it('returns approved when expiresAt is null', () => {
    expect(effectiveExceptionStatus({ status: 'approved', expiresAt: null })).toBe('approved');
  });
});

describe('exception renewals', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('runs a renewal through request -> approve, extending expiresAt', async () => {
    const oldExpiry = new Date(Date.now() - 1000).toISOString();
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
      expiresAt: oldExpiry,
    });
    await s.approveException(exc.id, 'approver-1');

    const newExpiry = new Date(Date.now() + 86400_000 * 30).toISOString();
    const renewal = await s.requestExceptionRenewal(exc.id, 'owner-1', {
      proposedExpiresAt: newExpiry,
      justification: 'Compensating control still in place, extending review window',
    });
    expect(renewal.status).toBe('pending');

    const reviewed = await s.reviewExceptionRenewal(renewal.id, 'reviewer-1', 'approved');
    expect(reviewed.status).toBe('approved');

    const updated = await s.getException(exc.id);
    expect(updated!.expiresAt).toBe(newExpiry);
    expect(updated!.status).toBe('approved');
  });

  it('rejects a request from someone other than the exception owner', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    await expect(
      s.requestExceptionRenewal(exc.id, 'not-the-owner', {
        proposedExpiresAt: new Date().toISOString(),
        justification: 'J',
      }),
    ).rejects.toThrow('exception_renewal_only_owner_can_request');
  });

  it('rejects self-review of a renewal request', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const renewal = await s.requestExceptionRenewal(exc.id, 'owner-1', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'J',
    });
    await expect(s.reviewExceptionRenewal(renewal.id, 'owner-1', 'approved')).rejects.toThrow(
      'exception_renewal_self_review_forbidden',
    );
  });

  it('requires reviewNotes on rejection and preserves history on re-request', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const first = await s.requestExceptionRenewal(exc.id, 'owner-1', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'First attempt',
    });
    await expect(s.reviewExceptionRenewal(first.id, 'reviewer-1', 'rejected')).rejects.toThrow(
      'exception_renewal_review_notes_required',
    );
    await s.reviewExceptionRenewal(first.id, 'reviewer-1', 'rejected', 'Not enough justification');

    const second = await s.requestExceptionRenewal(exc.id, 'owner-1', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'Second attempt with more detail',
    });
    expect(second.id).not.toBe(first.id);

    const history = await s.listExceptionRenewals(exc.id);
    expect(history).toHaveLength(2);
    expect(history.find((r) => r.id === first.id)?.status).toBe('rejected');
  });

  it('lists only pending renewals for an org, excluding other orgs and resolved renewals', async () => {
    const excOrg1 = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T1',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const excOrg2 = await s.createException('org2', 'u2', {
      controlCode: 'AC-2',
      frameworkId: 'fw1',
      title: 'T2',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-2',
    });
    const pendingOrg1 = await s.requestExceptionRenewal(excOrg1.id, 'owner-1', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'Still needed',
    });
    await s.requestExceptionRenewal(excOrg2.id, 'owner-2', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'Different org',
    });
    const resolvedOrg1 = await s.requestExceptionRenewal(excOrg1.id, 'owner-1', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'Will be resolved',
    });
    await s.reviewExceptionRenewal(resolvedOrg1.id, 'reviewer-1', 'rejected', 'no');

    const pending = await s.listPendingExceptionRenewals('org1');
    expect(pending.map((r) => r.id)).toEqual([pendingOrg1.id]);
  });
});

describe('issues', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('creates and lists issues for org', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'MFA not enforced',
      description: 'Admin accounts lack MFA',
      severity: 'high',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    expect(issue.status).toBe('open');
    expect(issue.source).toBe('manual');
    const list = await s.listIssues('org1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(issue.id);
  });

  it('carries reporterId, ownerId, and affectedAssets through create', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'MFA not enforced',
      description: 'Admin accounts lack MFA',
      severity: 'high',
      reporterId: 'user-reporter-1',
      ownerId: 'user-owner-1',
      affectedAssets: 'Payment API, Customer DB',
    });
    expect(issue.reporterId).toBe('user-reporter-1');
    expect(issue.ownerId).toBe('user-owner-1');
    expect(issue.affectedAssets).toBe('Payment API, Customer DB');
  });

  it('closes an issue through the validation workflow and sets resolvedAt', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    const closed = await s.reviewIssueValidation(validation!.id, 'validator-1', 'approved');
    expect(closed.status).toBe('approved');
    const updatedIssue = await s.getIssue(issue.id);
    expect(updatedIssue!.status).toBe('closed');
    expect(updatedIssue!.resolvedAt).not.toBeNull();
  });

  it('clears resolvedAt when a closed issue is reopened via generic update', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await s.reviewIssueValidation(validation!.id, 'validator-1', 'approved');
    const reopened = await s.updateIssue(issue.id, { status: 'open' });
    expect(reopened.resolvedAt).toBeNull();
  });

  it('rejects self-validation', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await expect(
      s.submitIssueForValidation(issue.id, 'owner-1', {
        rootCause: 'Root cause',
        rootCauseCategory: 'human_error',
        validatorId: 'owner-1',
      }),
    ).rejects.toThrow('issue_validation_self_validation_forbidden');
  });

  it('prevents duplicate concurrent pending validations', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'First submission',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    await expect(
      s.submitIssueForValidation(issue.id, 'owner-1', {
        rootCause: 'Second submission',
        rootCauseCategory: 'human_error',
        validatorId: 'validator-1',
      }),
    ).rejects.toThrow('issue_validation_already_pending');
  });

  it('refuses to submit a closed issue for validation', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await s.reviewIssueValidation(validation!.id, 'validator-1', 'approved');
    expect((await s.getIssue(issue.id))!.status).toBe('closed');

    await expect(
      s.submitIssueForValidation(issue.id, 'owner-1', {
        rootCause: 'Reopening through the back door',
        rootCauseCategory: 'human_error',
        validatorId: 'validator-1',
      }),
    ).rejects.toThrow('issue_status_invalid_for_submission');
  });

  it('refuses to submit a wont_fix issue for validation', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.updateIssue(issue.id, { status: 'wont_fix' });

    await expect(
      s.submitIssueForValidation(issue.id, 'owner-1', {
        rootCause: 'Should not be submittable',
        rootCauseCategory: 'other',
        validatorId: 'validator-1',
      }),
    ).rejects.toThrow('issue_status_invalid_for_submission');
  });

  it('rejects a validation with notes, returns issue to in_progress, and preserves history on resubmit', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'First attempt',
      rootCauseCategory: 'human_error',
      validatorId: 'validator-1',
    });
    const firstValidation = await s.getActiveIssueValidation(issue.id);
    const rejected = await s.reviewIssueValidation(
      firstValidation!.id,
      'validator-1',
      'rejected',
      'Fix does not address the root cause',
    );
    expect(rejected.status).toBe('rejected');
    const afterReject = await s.getIssue(issue.id);
    expect(afterReject!.status).toBe('in_progress');

    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Second attempt',
      rootCauseCategory: 'control_design_failure',
      validatorId: 'validator-1',
    });
    const secondValidation = await s.getActiveIssueValidation(issue.id);
    expect(secondValidation!.id).not.toBe(firstValidation!.id);

    const history = await s.listIssueValidations(issue.id);
    expect(history).toHaveLength(2);
    expect(history.find((v) => v.id === firstValidation!.id)?.status).toBe('rejected');
  });

  it('rejects review from someone other than the assigned validator', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Root cause',
      rootCauseCategory: 'other',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await expect(
      s.reviewIssueValidation(validation!.id, 'someone-else', 'approved'),
    ).rejects.toThrow('issue_validation_not_authorized_validator');
  });

  it('requires reviewNotes on rejection', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Root cause',
      rootCauseCategory: 'other',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await expect(
      s.reviewIssueValidation(validation!.id, 'validator-1', 'rejected'),
    ).rejects.toThrow('issue_validation_review_notes_required');
  });

  it('bypassing the type system to set status directly to closed via updateIssue throws', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await expect(
      s.updateIssue(issue.id, { status: 'closed' as unknown as IssuePatch['status'] }),
    ).rejects.toThrow('issue_status_change_requires_workflow');
  });

  it('deletes an issue', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'medium',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.deleteIssue(issue.id);
    expect(await s.listIssues('org1')).toHaveLength(0);
  });

  it('scopes issues by orgId', async () => {
    await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    expect(await s.listIssues('org2')).toHaveLength(0);
  });

  it('lists only pending validations for an org, excluding other orgs and resolved validations', async () => {
    const issuePendingOrg1 = await s.createIssue('org1', 'u1', {
      title: 'Pending in org1',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    const issueResolvedOrg1 = await s.createIssue('org1', 'u1', {
      title: 'Resolved in org1',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    const issueOrg2 = await s.createIssue('org2', 'u2', {
      title: 'Pending in org2',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-2',
      ownerId: 'owner-2',
    });
    await s.submitIssueForValidation(issuePendingOrg1.id, 'owner-1', {
      rootCause: 'Root cause',
      rootCauseCategory: 'other',
      validatorId: 'validator-1',
    });
    const pendingValidation = await s.getActiveIssueValidation(issuePendingOrg1.id);
    await s.submitIssueForValidation(issueResolvedOrg1.id, 'owner-1', {
      rootCause: 'Root cause',
      rootCauseCategory: 'other',
      validatorId: 'validator-1',
    });
    const resolvedValidation = await s.getActiveIssueValidation(issueResolvedOrg1.id);
    await s.reviewIssueValidation(resolvedValidation!.id, 'validator-1', 'approved');
    await s.submitIssueForValidation(issueOrg2.id, 'owner-2', {
      rootCause: 'Root cause',
      rootCauseCategory: 'other',
      validatorId: 'validator-2',
    });

    const pending = await s.listPendingIssueValidations('org1');
    expect(pending.map((v) => v.id)).toEqual([pendingValidation!.id]);
  });
});

describe('assets', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('creates and lists assets for org', async () => {
    const asset = await s.createAsset('org1', 'u1', {
      name: 'Payment API',
      type: 'service',
      criticality: 'critical',
      description: 'Handles card payments',
      owner: 'Platform team',
    });
    expect(asset.type).toBe('service');
    const list = await s.listAssets('org1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(asset.id);
  });

  it('updates asset criticality', async () => {
    const asset = await s.createAsset('org1', 'u1', {
      name: 'DB',
      type: 'infrastructure',
      criticality: 'low',
      description: '',
      owner: '',
    });
    const updated = await s.updateAsset(asset.id, { criticality: 'high' });
    expect(updated.criticality).toBe('high');
  });

  it('deletes an asset', async () => {
    const asset = await s.createAsset('org1', 'u1', {
      name: 'N',
      type: 'other',
      criticality: 'low',
      description: '',
      owner: '',
    });
    await s.deleteAsset(asset.id);
    expect(await s.listAssets('org1')).toHaveLength(0);
  });

  it('scopes by orgId', async () => {
    await s.createAsset('org1', 'u1', {
      name: 'N',
      type: 'other',
      criticality: 'low',
      description: '',
      owner: '',
    });
    expect(await s.listAssets('org2')).toHaveLength(0);
  });
});

describe('risks', () => {
  let s: FakeNotesStrategy;
  let categoryId: string;
  beforeEach(async () => {
    s = new FakeNotesStrategy();
    const [category] = await s.listRiskTaxonomy('org1');
    categoryId = category!.id;
  });

  it('creates risk and computes inherent score from methodology', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'SQL Injection',
      riskStatement: 'Input not sanitized',
      taxonomyCategoryId: categoryId,
      ownerId: 'u1',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });
    expect(risk.inherentScore).toBe(16); // 4 * 4
    expect(risk.inherentLabel).toBe('high');
    expect(risk.status).toBe('open');
  });

  it('lists risks for org', async () => {
    await s.createRisk('org1', 'u1', {
      title: 'R1',
      riskStatement: 'stmt',
      taxonomyCategoryId: categoryId,
      ownerId: 'u1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    const list = await s.listRisks('org1');
    expect(list).toHaveLength(1);
  });

  it('updates risk treatment strategy', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R',
      riskStatement: 'stmt',
      taxonomyCategoryId: categoryId,
      ownerId: 'u1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    const updated = await s.updateRisk(risk.id, { treatmentStrategy: 'accept' }, 'u1');
    expect(updated.treatmentStrategy).toBe('accept');
  });

  it('recomputes inherent score when likelihood changes', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R',
      riskStatement: 'stmt',
      taxonomyCategoryId: categoryId,
      ownerId: 'u1',
      inherentLikelihood: 2,
      inherentImpact: 3,
    });
    const updated = await s.updateRisk(risk.id, { inherentLikelihood: 5 }, 'u1');
    expect(updated.inherentScore).toBe(15); // 5 * 3
  });

  it('deletes a risk', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R',
      riskStatement: 'stmt',
      taxonomyCategoryId: categoryId,
      ownerId: 'u1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    await s.deleteRisk(risk.id);
    expect(await s.listRisks('org1')).toHaveLength(0);
  });
});

describe('risk assessments', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('creates assessment with auto-generated code and draft status', async () => {
    const types = await s.listAssessmentTypes('org1');
    const a = await s.createAssessment('org1', 'u1', {
      assessmentTypeId: types[0]!.id,
      title: 'Q2 Vulnerability Sweep',
      ownerId: 'u1',
    });
    expect(a.assessmentCode).toMatch(/^ASM-\d{6}$/);
    expect(a.status).toBe('draft');
    expect(a.itemCount).toBe(0);
    expect(a.highestInherentScore).toBeUndefined();
  });

  it('creates assessment with different assessment types', async () => {
    const types = await s.listAssessmentTypes('org1');
    expect(types).toHaveLength(2);
    const a1 = await s.createAssessment('org1', 'u1', {
      assessmentTypeId: types[0]!.id,
      title: 'Vulnerability Assessment',
      ownerId: 'u1',
    });
    const a2 = await s.createAssessment('org1', 'u1', {
      assessmentTypeId: types[1]!.id,
      title: 'Threat Assessment',
      ownerId: 'u1',
    });
    expect(a1.assessmentTypeId).toBe(types[0]!.id);
    expect(a2.assessmentTypeId).toBe(types[1]!.id);
  });

  it('adds items, scores them, and recomputes assessment summary', async () => {
    const types = await s.listAssessmentTypes('org1');
    const a = await s.createAssessment('org1', 'u1', {
      assessmentTypeId: types[0]!.id,
      title: 'T',
      ownerId: 'u1',
    });
    const item1 = await s.createAssessmentItem(a.id, {
      subject: 'Unpatched OS',
      description: 'Missing patches',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });
    expect(item1.inherentScore).toBe(16);
    const item2 = await s.createAssessmentItem(a.id, {
      subject: 'Weak auth',
      description: 'No MFA',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    expect(item2.inherentScore).toBe(9);
    const updated = await s.getAssessment(a.id);
    expect(updated!.itemCount).toBe(2);
    expect(updated!.highestInherentScore).toBe(16);
  });

  it('updates assessment status via the owner-gated lifecycle transition', async () => {
    const types = await s.listAssessmentTypes('org1');
    const a = await s.createAssessment('org1', 'u1', {
      assessmentTypeId: types[0]!.id,
      title: 'T',
      ownerId: 'u1',
    });
    const updated = await s.startAssessment(a.id, 'u1');
    expect(updated.status).toBe('in_progress');
  });

  it('lists assessments scoped by orgId', async () => {
    const types = await s.listAssessmentTypes('org1');
    await s.createAssessment('org1', 'u1', {
      assessmentTypeId: types[0]!.id,
      title: 'T',
      ownerId: 'u1',
    });
    expect(await s.listAssessments('org2')).toHaveLength(0);
    expect(await s.listAssessments('org1')).toHaveLength(1);
  });

  it('deletes assessment and its items', async () => {
    const types = await s.listAssessmentTypes('org1');
    const a = await s.createAssessment('org1', 'u1', {
      assessmentTypeId: types[0]!.id,
      title: 'T',
      ownerId: 'u1',
    });
    await s.createAssessmentItem(a.id, {
      subject: 'X',
      description: '',
      inherentLikelihood: 1,
      inherentImpact: 1,
    });
    await s.deleteAssessment(a.id, 'u1');
    expect(await s.listAssessments('org1')).toHaveLength(0);
    expect(await s.listAssessmentItems(a.id)).toHaveLength(0);
  });

  it('updates item and recomputes assessment summary', async () => {
    const types = await s.listAssessmentTypes('org1');
    const a = await s.createAssessment('org1', 'u1', {
      assessmentTypeId: types[0]!.id,
      title: 'T',
      ownerId: 'u1',
    });
    const item = await s.createAssessmentItem(a.id, {
      subject: 'X',
      description: '',
      inherentLikelihood: 1,
      inherentImpact: 1,
    });
    expect(item.inherentScore).toBe(1);
    await s.updateAssessmentItem(item.id, {
      inherentLikelihood: 5,
      inherentImpact: 5,
    });
    const updated = await s.getAssessment(a.id);
    expect(updated!.highestInherentScore).toBe(25);
  });
});

describe('Assessment lifecycle (Phase B.1)', () => {
  it('seeds two default assessment types on first access', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    expect(types).toHaveLength(2);
    expect(types.map((t) => t.itemNounSingular).sort()).toEqual([
      'Threat Scenario',
      'Vulnerability',
    ]);
  });

  it('getAssessmentType returns the type by id, or null when not found', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');

    await expect(strategy.getAssessmentType(types[0]!.id)).resolves.toEqual(types[0]);
    await expect(strategy.getAssessmentType('missing')).resolves.toBeNull();
  });

  it('getAssessmentItemControlMapping returns the mapping by id, or null when not found', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'user-1',
    });
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });
    const mapping = await strategy.addAssessmentItemControlMapping(item.id, {
      controlId: 'ctrl-1',
      controlCode: 'VULN-001',
      controlTitle: 'Patch Management',
    });

    await expect(strategy.getAssessmentItemControlMapping(mapping.id)).resolves.toEqual(mapping);
    await expect(strategy.getAssessmentItemControlMapping('missing')).resolves.toBeNull();
  });

  it('creates an assessment with an auto-generated code and pinned methodology', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Q1 Vulnerability Sweep',
      assessmentTypeId: types[0]!.id,
      ownerId: 'user-1',
    });
    expect(assessment.assessmentCode).toMatch(/^ASM-\d{6}$/);
    expect(assessment.status).toBe('draft');
    expect(assessment.methodologyId).toBeTruthy();
    expect(assessment.itemCount).toBe(0);
  });

  it('adding an item scores it and recomputes the assessment summary', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'user-1',
    });
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Unpatched Log4j',
      description: 'CVE-2025-XXXX on web-01',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });
    expect(item.inherentScore).toBe(16);
    const refreshed = await strategy.getAssessment(assessment.id);
    expect(refreshed?.itemCount).toBe(1);
    expect(refreshed?.highestInherentScore).toBe(16);
  });

  it('links a control to an item, and manual residual scoring works after linking', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'user-1',
    });
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });

    await strategy.addAssessmentItemControlMapping(item.id, {
      controlId: 'ctrl-1',
      controlCode: 'VULN-001',
      controlTitle: 'Patch Management',
    });
    expect(await strategy.listAssessmentItemControlMappings(item.id)).toHaveLength(1);

    const updated = await strategy.updateAssessmentItem(item.id, {
      residualLikelihood: 2,
      residualImpact: 3,
    });
    expect(updated.residualScore).toBe(6);

    const refreshed = await strategy.getAssessment(assessment.id);
    expect(refreshed?.highestResidualScore).toBe(6);
  });

  it('clears highestResidualScore/label once no remaining item carries a residual score', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'user-1',
    });
    const itemWithResidual = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject A',
      description: 'Description A',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });
    await strategy.updateAssessmentItem(itemWithResidual.id, {
      residualLikelihood: 4,
      residualImpact: 5,
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject B (no residual)',
      description: 'Description B',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });

    const beforeDelete = await strategy.getAssessment(assessment.id);
    expect(beforeDelete?.highestResidualScore).toBe(20);

    await strategy.deleteAssessmentItem(itemWithResidual.id);

    const afterDelete = await strategy.getAssessment(assessment.id);
    expect(afterDelete?.itemCount).toBe(1);
    expect(afterDelete?.highestResidualScore).toBeUndefined();
    expect(afterDelete?.highestResidualLabel).toBeUndefined();
  });

  it('enforces the full lifecycle with owner/approver gating', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'approver-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    await strategy.startAssessment(assessment.id, 'owner-1');
    const submitted = await strategy.submitForReview(assessment.id, 'owner-1');
    expect(submitted.status).toBe('pending_review');

    await expect(strategy.approveAssessment(assessment.id, 'owner-1')).rejects.toThrow(
      'assessment_self_approval_forbidden',
    );

    const approved = await strategy.approveAssessment(assessment.id, 'approver-1');
    expect(approved.status).toBe('approved');

    const completed = await strategy.completeAssessment(assessment.id, 'owner-1');
    expect(completed.status).toBe('completed');

    const archived = await strategy.archiveAssessment(assessment.id, 'owner-1');
    expect(archived.status).toBe('archived');
  });

  it('requestChanges records a note and returns the assessment to changes_requested', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'approver-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    const changed = await strategy.requestChanges(assessment.id, 'approver-1', 'Add mitigations');
    expect(changed.status).toBe('changes_requested');
    expect(changed.lastReviewNote).toBe('Add mitigations');

    const resubmitted = await strategy.submitForReview(assessment.id, 'owner-1');
    expect(resubmitted.status).toBe('pending_review');
  });

  it('rejects requestChanges without a note', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'approver-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    await expect(strategy.requestChanges(assessment.id, 'approver-1', '   ')).rejects.toThrow(
      'note_required',
    );
    expect((await strategy.getAssessment(assessment.id))?.status).toBe('pending_review');
  });
});

describe('Assessment write-path hardening', () => {
  async function seedDraft(strategy: FakeNotesStrategy) {
    const types = await strategy.listAssessmentTypes('org-1');
    return strategy.createAssessment('org-1', 'creator-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'approver-1',
    });
  }

  it('ignores ownerId/approverId supplied in a raw updateAssessment payload', async () => {
    const strategy = new FakeNotesStrategy();
    const assessment = await seedDraft(strategy);

    const updated = await strategy.updateAssessment(assessment.id, {
      title: 'Renamed',
      ownerId: 'attacker',
      approverId: 'attacker',
    } as AssessmentPatch);

    expect(updated.title).toBe('Renamed');
    expect(updated.ownerId).toBe('owner-1');
    expect(updated.approverId).toBe('approver-1');
  });

  it('ignores identity and derived score fields in a raw updateAssessmentItem payload', async () => {
    const strategy = new FakeNotesStrategy();
    const assessment = await seedDraft(strategy);
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });

    const updated = await strategy.updateAssessmentItem(item.id, {
      subject: 'Renamed',
      id: 'forged-id',
      assessmentId: 'forged-assessment',
      orgId: 'forged-org',
      inherentScore: 999,
      inherentLabel: 'critical',
      residualScore: 999,
      residualLabel: 'critical',
      createdAt: '1970-01-01T00:00:00.000Z',
    } as AssessmentItemPatch);

    expect(updated.subject).toBe('Renamed');
    expect(updated.id).toBe(item.id);
    expect(updated.assessmentId).toBe(assessment.id);
    expect(updated.orgId).toBe('org-1');
    expect(updated.inherentScore).toBe(4);
    expect(updated.inherentLabel).toBe('low');
    expect(updated.residualScore).toBeUndefined();
    expect(updated.residualLabel).toBeUndefined();
    expect(updated.createdAt).toBe(item.createdAt);
  });

  it('ignores id/itemId supplied in a raw control mapping payload', async () => {
    const strategy = new FakeNotesStrategy();
    const assessment = await seedDraft(strategy);
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });

    const mapping = await strategy.addAssessmentItemControlMapping(item.id, {
      controlId: 'ctrl-1',
      controlCode: 'VULN-001',
      controlTitle: 'Patch Management',
      id: 'forged-id',
      itemId: 'forged-item',
    } as AssessmentItemControlMappingInput);

    expect(mapping.id).not.toBe('forged-id');
    expect(mapping.itemId).toBe(item.id);
    expect(await strategy.listAssessmentItemControlMappings(item.id)).toHaveLength(1);
  });

  it('removes a control mapping by id', async () => {
    const strategy = new FakeNotesStrategy();
    const assessment = await seedDraft(strategy);
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    const mapping = await strategy.addAssessmentItemControlMapping(item.id, {
      controlId: 'ctrl-1',
      controlCode: 'VULN-001',
      controlTitle: 'Patch Management',
    });
    const other = await strategy.addAssessmentItemControlMapping(item.id, {
      controlId: 'ctrl-2',
      controlCode: 'VULN-002',
      controlTitle: 'Vulnerability Scanning',
    });

    await strategy.removeAssessmentItemControlMapping(mapping.id);

    const remaining = await strategy.listAssessmentItemControlMappings(item.id);
    expect(remaining.map((m) => m.id)).toEqual([other.id]);
  });

  it('archives an assessment type without removing it from the org listing', async () => {
    const strategy = new FakeNotesStrategy();
    const created = await strategy.createAssessmentType('org-1', {
      name: 'Third Party Risk Assessment',
      itemNounSingular: 'Vendor',
      itemNounPlural: 'Vendors',
    });
    expect(created.archived).toBe(false);

    const archived = await strategy.archiveAssessmentType(created.id);
    expect(archived.archived).toBe(true);

    const types = await strategy.listAssessmentTypes('org-1');
    expect(types.find((t) => t.id === created.id)?.archived).toBe(true);
  });

  it('only lets the owner delete a draft assessment', async () => {
    const strategy = new FakeNotesStrategy();
    const assessment = await seedDraft(strategy);

    await expect(strategy.deleteAssessment(assessment.id, 'someone-else')).rejects.toThrow(
      'not_authorized_owner',
    );
    expect(await strategy.listAssessments('org-1')).toHaveLength(1);

    await strategy.deleteAssessment(assessment.id, 'owner-1');
    expect(await strategy.listAssessments('org-1')).toHaveLength(0);
  });

  it('refuses to delete an assessment that has left draft', async () => {
    const strategy = new FakeNotesStrategy();
    const assessment = await seedDraft(strategy);
    await strategy.startAssessment(assessment.id, 'owner-1');

    await expect(strategy.deleteAssessment(assessment.id, 'owner-1')).rejects.toThrow(
      'delete_forbidden_from_in_progress',
    );
    expect(await strategy.listAssessments('org-1')).toHaveLength(1);
  });

  it('does not collide with a live assessment code after a delete', async () => {
    const strategy = new FakeNotesStrategy();
    const first = await seedDraft(strategy);
    const second = await seedDraft(strategy);
    expect(second.assessmentCode).not.toBe(first.assessmentCode);

    await strategy.deleteAssessment(first.id, 'owner-1');
    const third = await seedDraft(strategy);

    expect(third.assessmentCode).not.toBe(second.assessmentCode);
  });

  it('sorts assessment items by descending inherent score', async () => {
    const strategy = new FakeNotesStrategy();
    const assessment = await seedDraft(strategy);
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Low',
      description: '',
      inherentLikelihood: 1,
      inherentImpact: 1,
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'High',
      description: '',
      inherentLikelihood: 5,
      inherentImpact: 5,
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Medium',
      description: '',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    const items = await strategy.listAssessmentItems(assessment.id);
    expect(items.map((i) => i.subject)).toEqual(['High', 'Medium', 'Low']);
  });

  it('rejects an assessment owner approving their own assessment even when named as approver', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Self-approval attempt',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'owner-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    await expect(strategy.approveAssessment(assessment.id, 'owner-1')).rejects.toThrow(
      'assessment_self_approval_forbidden',
    );
  });

  it('rejects an assessment owner requesting changes on their own assessment even when named as approver', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Self-review attempt',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'owner-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    await expect(
      strategy.requestChanges(assessment.id, 'owner-1', 'Needs more evidence'),
    ).rejects.toThrow('assessment_self_approval_forbidden');
  });

  it('still allows the legitimate, distinct approver to approve', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Legitimate approval',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'approver-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    const approved = await strategy.approveAssessment(assessment.id, 'approver-1');
    expect(approved.status).toBe('approved');
  });
});

describe('assessment item <-> risk bridge', () => {
  async function seedItem(strategy: FakeNotesStrategy, orgId: string) {
    const types = await strategy.listAssessmentTypes(orgId);
    const assessment = await strategy.createAssessment(orgId, 'creator-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      businessUnit: 'Engineering',
      assetIds: ['asset-1'],
      vendorIds: ['vendor-1'],
      approverId: 'approver-1',
    });
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Unpatched CVE',
      description: 'Critical CVE found on prod host',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });
    return { assessment, item };
  }

  it('creates a risk from an assessment item and links it back', async () => {
    const strategy = new FakeNotesStrategy();
    const { assessment, item } = await seedItem(strategy, 'org-1');
    const [category] = await strategy.listRiskTaxonomy('org-1');

    const risk = await strategy.createRiskFromAssessmentItem('org-1', 'u1', item.id, {
      taxonomyCategoryId: category!.id,
    });

    expect(risk.title).toBe(item.subject);
    expect(risk.riskStatement).toBe(item.description);
    expect(risk.ownerId).toBe(assessment.ownerId);
    expect(risk.businessUnit).toBe(assessment.businessUnit);
    expect(risk.assetIds).toEqual(assessment.assetIds);
    expect(risk.vendorIds).toEqual(assessment.vendorIds);
    expect(risk.inherentLikelihood).toBe(item.inherentLikelihood);
    expect(risk.inherentImpact).toBe(item.inherentImpact);
    expect(risk.source).toBe('risk_assessment');
    expect(risk.sourceRef).toBe(item.id);

    const updatedItems = await strategy.listAssessmentItems(assessment.id);
    expect(updatedItems.find((i) => i.id === item.id)?.linkedRiskId).toBe(risk.id);
  });

  it('refuses to create a risk from an assessment item under a mismatched org', async () => {
    const strategy = new FakeNotesStrategy();
    const { item } = await seedItem(strategy, 'org-1');
    const [otherCategory] = await strategy.listRiskTaxonomy('org-2');

    await expect(
      strategy.createRiskFromAssessmentItem('org-2', 'u2', item.id, {
        taxonomyCategoryId: otherCategory!.id,
      }),
    ).rejects.toThrow();

    const risksInOrg2 = await strategy.listRisks('org-2');
    expect(risksInOrg2).toHaveLength(0);
    const items = await strategy.listAssessmentItems(item.assessmentId);
    expect(items.find((i) => i.id === item.id)?.linkedRiskId).toBeUndefined();
  });

  it('links an assessment item to a risk in the same org', async () => {
    const strategy = new FakeNotesStrategy();
    const { item } = await seedItem(strategy, 'org-1');
    const [category] = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'u1', {
      title: 'Standalone Risk',
      riskStatement: 'stmt',
      taxonomyCategoryId: category!.id,
      ownerId: 'u1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });

    const linked = await strategy.linkAssessmentItemToRisk(item.id, risk.id);

    expect(linked.linkedRiskId).toBe(risk.id);
  });

  it('refuses to link an assessment item to a risk from a different org', async () => {
    const strategy = new FakeNotesStrategy();
    const { item } = await seedItem(strategy, 'org-1');
    const [otherCategory] = await strategy.listRiskTaxonomy('org-2');
    const otherOrgRisk = await strategy.createRisk('org-2', 'u2', {
      title: 'Other Org Risk',
      riskStatement: 'stmt',
      taxonomyCategoryId: otherCategory!.id,
      ownerId: 'u2',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });

    await expect(strategy.linkAssessmentItemToRisk(item.id, otherOrgRisk.id)).rejects.toThrow();
  });

  it('unlinks an assessment item from its risk', async () => {
    const strategy = new FakeNotesStrategy();
    const { item } = await seedItem(strategy, 'org-1');
    const [category] = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'u1', {
      title: 'Standalone Risk',
      riskStatement: 'stmt',
      taxonomyCategoryId: category!.id,
      ownerId: 'u1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    await strategy.linkAssessmentItemToRisk(item.id, risk.id);

    const unlinked = await strategy.unlinkAssessmentItemFromRisk(item.id);

    expect(unlinked.linkedRiskId).toBeUndefined();
  });

  it('lists only the assessment items linked to a given risk, with assessment context', async () => {
    const strategy = new FakeNotesStrategy();
    const { assessment, item: item1 } = await seedItem(strategy, 'org-1');
    const item2 = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Second finding',
      description: 'Another finding on the same assessment',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    const [category] = await strategy.listRiskTaxonomy('org-1');
    const riskA = await strategy.createRisk('org-1', 'u1', {
      title: 'Risk A',
      riskStatement: 'stmt',
      taxonomyCategoryId: category!.id,
      ownerId: 'u1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    const riskB = await strategy.createRisk('org-1', 'u1', {
      title: 'Risk B',
      riskStatement: 'stmt',
      taxonomyCategoryId: category!.id,
      ownerId: 'u1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    await strategy.linkAssessmentItemToRisk(item1.id, riskA.id);
    await strategy.linkAssessmentItemToRisk(item2.id, riskB.id);

    const linkedToA = await strategy.listAssessmentItemsForRisk(riskA.id);
    const linkedToB = await strategy.listAssessmentItemsForRisk(riskB.id);

    expect(linkedToA.map((i) => i.id)).toEqual([item1.id]);
    expect(linkedToB.map((i) => i.id)).toEqual([item2.id]);
    expect(linkedToA[0]!.assessmentCode).toBe(assessment.assessmentCode);
    expect(linkedToA[0]!.assessmentTitle).toBe(assessment.title);
    expect(linkedToA[0]!.assessmentStatus).toBe(assessment.status);
  });
});

describe('policies', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('creates policy with draft status', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1',
      title: 'Access Control Policy',
      content: '# Access Control\n\nAll systems require MFA.',
    });
    expect(p.status).toBe('draft');
    expect(p.version).toBe(1);
  });

  it('approves policy', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1',
      title: 'T',
      content: 'C',
    });
    const approved = await s.updatePolicy(p.id, { status: 'approved' });
    expect(approved.status).toBe('approved');
  });

  it('bumps version on content update', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1',
      title: 'T',
      content: 'C v1',
    });
    const updated = await s.updatePolicy(p.id, { content: 'C v2' });
    expect(updated.version).toBe(2);
  });

  it('lists policies scoped by orgId', async () => {
    await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    expect(await s.listPolicies('org2')).toHaveLength(0);
    expect(await s.listPolicies('org1')).toHaveLength(1);
  });

  it('deletes policy and its control mappings', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    await s.deletePolicy(p.id);
    expect(await s.listPolicies('org1')).toHaveLength(0);
    expect(await s.listPolicyControls(p.id)).toHaveLength(0);
  });

  it('clones template into a new draft policy', async () => {
    const cloned = await s.cloneTemplate('org1', 'u1', 'tmpl-1');
    expect(cloned.templateId).toBe('tmpl-1');
    expect(cloned.status).toBe('draft');
    expect(cloned.content).toContain('SOC 2');
  });

  it('lists policy templates filtered by framework', async () => {
    const all = await s.listPolicyTemplates();
    const filtered = await s.listPolicyTemplates('fw-soc2');
    expect(filtered.length).toBeLessThanOrEqual(all.length);
    filtered.forEach((t) => expect(t.frameworkId).toBe('fw-soc2'));
  });
});

describe('policy controls mapping', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('adds control mapping and lists it', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    const pc = await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    expect(pc.controlCode).toBe('AC-1');
    const list = await s.listPolicyControls(p.id);
    expect(list).toHaveLength(1);
  });

  it('deduplicates: adding same mapping twice returns existing', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    expect(await s.listPolicyControls(p.id)).toHaveLength(1);
  });

  it('lists policies for a given control code', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    const policies = await s.listPoliciesForControl('AC-1', 'fw1');
    expect(policies).toHaveLength(1);
    expect(policies[0].id).toBe(p.id);
  });

  it('removes control mapping', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    const pc = await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    await s.removePolicyControl(pc.id);
    expect(await s.listPolicyControls(p.id)).toHaveLength(0);
  });
});

describe('listStandardsByFramework', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('returns standards mapped to the given framework, deduplicated by code', async () => {
    const { id } = await s.createStandardsDocument('u1', 'org1', ['fw1']);
    await s.saveStandardsDocument(id, [
      {
        code: 'STD-1',
        title: 'Access Control',
        objective: 'Restrict access',
        scope: 'All systems',
        requirements: ['MFA required'],
        frameworkMappings: [{ frameworkId: 'fw1', standardCode: 'AC-1' }],
      },
      {
        code: 'STD-2',
        title: 'Unrelated',
        objective: 'N/A',
        scope: 'N/A',
        requirements: [],
        frameworkMappings: [{ frameworkId: 'fw2', standardCode: 'X-1' }],
      },
    ]);

    const result = await s.listStandardsByFramework('org1', 'fw1');
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('STD-1');
  });

  it('returns an empty array for an org with no standards documents', async () => {
    const result = await s.listStandardsByFramework('org-none', 'fw1');
    expect(result).toEqual([]);
  });
});

describe('framework workspace & GRC hierarchy', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('lists default frameworks with rich hierarchy counts', async () => {
    const fws = await s.listFrameworks('org1');
    expect(fws.length).toBeGreaterThanOrEqual(4);
    const nist = fws.find((f) => f.slug === 'nist-csf');
    expect(nist).toBeDefined();
    expect(nist?.status).toBe('enabled');
    expect(nist?.requirementsCount).toBe(106);
    expect(nist?.functionsCount).toBe(6);
    expect(nist?.categoriesCount).toBe(22);
  });

  it('creates custom framework and initializes hierarchy', async () => {
    const created = await s.createFramework('org1', {
      slug: 'custom-sec',
      name: 'Custom Security Standard',
      description: 'Internal baseline',
      version: '1.0',
      category: 'security',
      requirements: [
        { code: 'AC-1', title: 'Access Control', description: 'MFA enforced' },
        { code: 'LOG-1', title: 'Log Management', description: 'Logs stored 365d' },
      ],
    });

    expect(created.id).toBeDefined();
    expect(created.isCustom).toBe(true);
    expect(created.requirementsCount).toBe(2);

    const reqs = await s.listRequirements(created.id, 'org1');
    expect(reqs).toHaveLength(2);
    expect(reqs[0].code).toBe('AC-1');
  });

  it('updates framework status', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const updated = await s.updateFramework(nistId, 'org1', { status: 'in_assessment' });
    expect(updated.status).toBe('in_assessment');

    const fetched = await s.getFramework(nistId, 'org1');
    expect(fetched?.status).toBe('in_assessment');
  });

  it('lists requirements for NIST CSF with functions and categories', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const reqs = await s.listRequirements(nistId, 'org1');
    expect(reqs.length).toBeGreaterThanOrEqual(6);

    const gvPo01 = reqs.find((r) => r.code === 'GV.PO-01');
    expect(gvPo01).toBeDefined();
    expect(gvPo01?.functionCode).toBe('GV');
    expect(gvPo01?.functionName).toBe('GOVERN');
    expect(gvPo01?.categoryCode).toBe('GV.PO');
    expect(gvPo01?.categoryName).toBe('Policy');
    expect(gvPo01?.evidenceCount).toBe(3);
    expect(gvPo01?.mappedControlsCount).toBe(4);
    expect(gvPo01?.openFindingsCount).toBe(1);
  });

  it('updates requirement applicability, implementation, and mandatory NA justification', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const updated = await s.updateRequirement(nistId, 'GV.PO-01', 'org1', {
      applicability: 'not_applicable',
      notApplicableReason: 'Third party manages all policy documentation exclusively',
      implementationStatus: 'not_applicable',
    });

    expect(updated.applicability).toBe('not_applicable');
    expect(updated.notApplicableReason).toBe(
      'Third party manages all policy documentation exclusively',
    );
    expect(updated.implementationStatus).toBe('not_applicable');

    // Scoped retrieval
    const fetched = await s.getRequirement(nistId, 'GV.PO-01', 'org1');
    expect(fetched?.applicability).toBe('not_applicable');
  });

  it('lists common internal controls and mappings to multiple frameworks', async () => {
    const controls = await s.listInternalControls('org1');
    expect(controls.length).toBeGreaterThanOrEqual(3);

    const mfaCtrl = controls.find((c) => c.code === 'AC-001');
    expect(mfaCtrl).toBeDefined();
    expect(mfaCtrl?.title).toContain('MFA');
    expect(mfaCtrl?.frameworkMappings.length).toBeGreaterThanOrEqual(4);
  });

  it('manages framework evidence and links to requirements', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const evList = await s.listFrameworkEvidence(nistId, 'org1');
    expect(evList.length).toBeGreaterThanOrEqual(3);

    const created = await s.createFrameworkEvidence('org1', {
      frameworkId: nistId,
      requirementId: 'nist-gv-po-01',
      title: 'Quarterly Risk Assessment Signoff.pdf',
      owner: 'Risk Officer',
      evidenceType: 'Policy Document',
      source: 'Jira',
      collectionDate: '2026-09-01',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01',
      verificationStatus: 'verified',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });

    expect(created.id).toBeDefined();
    const updatedEvList = await s.listFrameworkEvidence(nistId, 'org1');
    expect(updatedEvList.some((e) => e.title === 'Quarterly Risk Assessment Signoff.pdf')).toBe(
      true,
    );
  });

  it('logs a real Finding row connecting a control to a requirement assessment', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const assessments = await s.listFrameworkAssessments(nistId, 'org1');
    const asm = assessments.find((a) => a.id === 'asm-nist-2026');
    expect(asm?.controlId).toBe('ctrl-pol-001');

    const { findingId } = await s.createAssessmentFinding('org1', asm!.id, {
      title: 'Missing DR tabletop exercise minutes',
      severity: 'high',
      description: 'DR test conducted without recorded minutes',
    });

    const findings = await s.listControlFindings('ctrl-pol-001');
    const finding = findings.find((f) => f.id === findingId);
    expect(finding).toBeDefined();
    expect(finding?.code).toMatch(/^FIND-\d{6}$/);
    expect(finding?.status).toBe('open');
    expect(finding?.orgId).toBe('org1');
    expect(finding?.controlId).toBe('ctrl-pol-001');
    expect(finding?.assessmentId).toBe('asm-nist-2026');

    // createAssessmentFinding no longer auto-creates an unrelated Issue as a side effect
    const issues = await s.listIssues('org1');
    expect(issues.some((i) => i.title === 'Missing DR tabletop exercise minutes')).toBe(false);
  });

  it('rejects createAssessmentFinding for an assessment with no controlId', async () => {
    const isoId = '00000000-0000-0000-0000-000000000002';
    const assessments = await s.listFrameworkAssessments(isoId, 'org1');
    const asmWithoutControl = assessments.find((a) => !a.controlId);
    expect(asmWithoutControl).toBeDefined();

    await expect(
      s.createAssessmentFinding('org1', asmWithoutControl!.id, {
        title: 'x',
        severity: 'low',
        description: 'y',
      }),
    ).rejects.toThrow('requirement_assessment_missing_control');
  });

  it('rejects createAssessmentFinding when the assessment belongs to a different org', async () => {
    const asm = await s.getRequirementAssessment('asm-nist-2026');
    expect(asm?.orgId).toBe('org1');

    await expect(
      s.createAssessmentFinding('org-2', 'asm-nist-2026', {
        title: 'x',
        severity: 'low',
        description: 'y',
      }),
    ).rejects.toThrow('requirement_assessment_belongs_to_different_org');
  });

  it('getRequirementAssessment returns null for an unknown id, and the real record otherwise', async () => {
    expect(await s.getRequirementAssessment('nope')).toBeNull();
    const found = await s.getRequirementAssessment('asm-nist-2026');
    expect(found?.cycleName).toBe('2026 NIST CSF Assessment');
  });

  it('getFinding returns null for an unknown id, and the real record otherwise', async () => {
    expect(await s.getFinding('nope')).toBeNull();
    const found = await s.getFinding('finding-nist-gvpo01');
    expect(found?.title).toBe('Missing Q2 Access Review Evidence');
  });

  it('createRiskFromFinding creates a Risk with gap_analysis provenance and links it back', async () => {
    const risk = await s.createRiskFromFinding('org1', 'user1', 'finding-nist-gvpo01', {
      title: 'Policy governance gap',
      description: 'Access re-certification evidence gap',
      taxonomyCategoryId: (await s.listRiskTaxonomy('org1'))[0]!.id,
      ownerId: 'user1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    expect(risk.source).toBe('gap_analysis');
    expect(risk.sourceRef).toBe('finding-nist-gvpo01');
    const finding = await s.getFinding('finding-nist-gvpo01');
    expect(finding?.linkedRiskId).toBe(risk.id);
  });

  it('createIssueFromFinding creates an Issue with gap_analysis provenance and links it back', async () => {
    const issue = await s.createIssueFromFinding('org1', 'user1', 'finding-nist-gvpo01', {
      title: 'Policy governance gap',
      description: 'Access re-certification evidence gap',
      severity: 'high',
      ownerId: 'user1',
    });
    expect(issue.source).toBe('gap_analysis');
    expect(issue.sourceId).toBe('finding-nist-gvpo01');
    const finding = await s.getFinding('finding-nist-gvpo01');
    expect(finding?.linkedIssueId).toBe(issue.id);
  });

  it('createExceptionFromFinding creates a pending Exception and does NOT resolve the finding', async () => {
    const exc = await s.createExceptionFromFinding('org1', 'user1', 'finding-nist-gvpo01', {
      controlCode: 'POL-001',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      title: 'Temporary policy exception',
      statement: 'stmt',
      justification: 'just',
      ownerId: 'user1',
    });
    expect(exc.status).toBe('pending');
    const finding = await s.getFinding('finding-nist-gvpo01');
    expect(finding?.linkedExceptionId).toBeUndefined();
    expect(finding?.status).toBe('open');
  });

  it('resolveFindingViaException rejects a non-approved exception', async () => {
    const exc = await s.createException('org1', 'user1', {
      controlCode: 'POL-001',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      title: 'Pending exception',
      statement: 'stmt',
      justification: 'just',
      ownerId: 'user1',
    });
    await expect(s.resolveFindingViaException('finding-nist-gvpo01', exc.id)).rejects.toThrow(
      'exception_not_approved',
    );
  });

  it('resolveFindingViaException accepts an approved exception and closes the finding', async () => {
    const exc = await s.createException('org1', 'user1', {
      controlCode: 'POL-001',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      title: 'Approved exception',
      statement: 'stmt',
      justification: 'just',
      ownerId: 'user1',
    });
    await s.approveException(exc.id);
    const finding = await s.resolveFindingViaException('finding-nist-gvpo01', exc.id);
    expect(finding.status).toBe('accepted');
    expect(finding.linkedExceptionId).toBe(exc.id);
  });

  it('listFindingsByLink filters findings by linked entity', async () => {
    const risk = await s.createRiskFromFinding('org1', 'user1', 'finding-nist-gvpo01', {
      title: 'x',
      description: 'y',
      taxonomyCategoryId: (await s.listRiskTaxonomy('org1'))[0]!.id,
      ownerId: 'user1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    const byRisk = await s.listFindingsByLink({ riskId: risk.id });
    expect(byRisk.map((f) => f.id)).toContain('finding-nist-gvpo01');
    expect(await s.listFindingsByLink({ riskId: 'nope' })).toEqual([]);
  });

  it('tracks framework audit activities', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const activities = await s.listFrameworkActivities(nistId, 'org1');
    expect(activities.length).toBeGreaterThanOrEqual(2);
  });
});

describe('InternalControl lifecycle', () => {
  it('creates, mutates, and maps a control end-to-end', async () => {
    const strategy = new FakeNotesStrategy();
    const control = await strategy.createInternalControl('org-1', {
      code: 'IAM-001',
      title: 'Privileged Access MFA',
      description: 'Privileged accounts must use MFA.',
      domain: 'Identity & Access Management',
      owner: 'Director, Cybersecurity',
      criticality: 'high',
      controlType: 'preventive',
      execution: 'hybrid',
      frequency: 'continuous',
      nature: 'technical',
      category: 'access-control',
      implementationStatus: 'not_implemented',
    });
    expect(control.id).toBeTruthy();
    expect(control.implementationStatus).toBe('not_implemented');

    const mapped = await strategy.addControlFrameworkMapping(control.id, {
      frameworkId: 'fw-nist',
      frameworkName: 'NIST CSF 2.0',
      requirementCode: 'PR.AA-03',
      mappingType: 'direct',
      validation: 'human_validated',
    });
    expect(mapped.frameworkMappings).toHaveLength(1);
    expect(mapped.frameworkCount).toBe(1);

    const patched = await strategy.updateInternalControl(control.id, {
      implementationStatus: 'implemented',
    });
    expect(patched.implementationStatus).toBe('implemented');

    const fetched = await strategy.getInternalControl(control.id);
    expect(fetched?.id).toBe(control.id);

    await strategy.deleteInternalControl(control.id);
    expect(await strategy.getInternalControl(control.id)).toBeNull();
  });

  it('creates a Finding when an assessment records ineffective operating effectiveness', async () => {
    const strategy = new FakeNotesStrategy();
    const control = await strategy.createInternalControl('org-1', {
      code: 'BCM-003',
      title: 'Backup Restoration Testing',
      description: 'Quarterly restoration test of production backups.',
      domain: 'Resilience',
      owner: 'Infrastructure',
      criticality: 'high',
      controlType: 'corrective',
      execution: 'manual',
      frequency: 'quarterly',
      nature: 'technical',
      category: 'resilience',
    });

    const assessment = await strategy.createControlAssessment('org-1', control.id, {
      cycleName: 'Q3 2026',
      status: 'completed',
      implementationStatus: 'partially_implemented',
      designEffectiveness: 'effective',
      operatingEffectiveness: 'ineffective',
      assessor: 'Jane Auditor',
      assessmentDate: new Date().toISOString(),
      observation: '2 of 5 sampled backups failed restoration.',
    });
    expect(assessment.findingId).toBeTruthy();

    const findings = await strategy.listControlFindings(control.id);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.status).toBe('open');

    const linked = await strategy.linkFindingToRisk(findings[0]!.id, 'risk-42');
    expect(linked.linkedRiskId).toBe('risk-42');

    const linkedIssue = await strategy.linkFindingToIssue(findings[0]!.id, 'issue-7');
    expect(linkedIssue.linkedIssueId).toBe('issue-7');

    const exc = await strategy.createException('org-1', 'user1', {
      controlCode: 'BCM-003',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      title: 'Backup restoration exception',
      statement: 'stmt',
      justification: 'just',
      ownerId: 'user1',
    });
    await strategy.approveException(exc.id);

    const resolved = await strategy.resolveFindingViaException(findings[0]!.id, exc.id);
    expect(resolved.status).toBe('accepted');
    expect(resolved.linkedExceptionId).toBe(exc.id);
  });

  it('attaches evidence to a control and increments its evidence count', async () => {
    const strategy = new FakeNotesStrategy();
    const control = await strategy.createInternalControl('org-1', {
      code: 'VM-001',
      title: 'Vulnerability Scanning',
      description: 'Weekly authenticated vulnerability scans.',
      domain: 'Vulnerability Management',
      owner: 'Security Ops',
      criticality: 'medium',
      controlType: 'detective',
      execution: 'automated',
      frequency: 'weekly',
      nature: 'technical',
      category: 'vuln-mgmt',
    });

    await strategy.createControlEvidence('org-1', control.id, {
      title: 'Weekly scan report — 2026-09-08',
      owner: 'Security Ops',
      evidenceType: 'report',
      source: 'Qualys',
      collectionDate: new Date().toISOString(),
      periodCovered: '2026-09-01/2026-09-08',
      expirationDate: new Date().toISOString(),
      verificationStatus: 'verified',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });

    const evidence = await strategy.listControlEvidence(control.id);
    expect(evidence).toHaveLength(1);

    const updated = await strategy.getInternalControl(control.id);
    expect(updated?.evidenceCount).toBe(1);

    const activity = await strategy.listControlActivity(control.id);
    expect(activity.some((a) => a.action === 'Evidence Uploaded')).toBe(true);
  });
});

describe('Risk Register lifecycle', () => {
  it('seeds a default methodology and taxonomy on first access', async () => {
    const strategy = new FakeNotesStrategy();
    const methodology = await strategy.getRiskMethodology('org-1');
    expect(methodology?.scaleSize).toBe(5);
    expect(methodology?.thresholds).toHaveLength(4);

    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    expect(taxonomy.length).toBeGreaterThan(0);
    expect(taxonomy.every((c) => c.orgId === 'org-1')).toBe(true);
  });

  it('creates a risk with an auto-generated ID and a methodology-based inherent score', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Unauthorized Access to Customer Data',
      riskStatement: 'Due to weak access controls, unauthorized access may occur.',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 4,
      inherentImpact: 5,
    });
    expect(risk.riskId).toMatch(/^RSK-\d{6}$/);
    expect(risk.inherentScore).toBe(20);
    expect(risk.inherentLabel).toBe('critical');
    expect(risk.status).toBe('open');
  });

  it('writes a snapshot before applying a residual-score update, and computes above-appetite', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Cloud Service Outage',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 4,
      inherentImpact: 5,
    });

    const updated = await strategy.updateRisk(
      risk.id,
      { residualLikelihood: 2, residualImpact: 5 },
      'user-1',
      'MFA deployed',
    );
    expect(updated.residualScore).toBe(10);
    expect(updated.residualLabel).toBe('high');
    expect(updated.aboveAppetite).toBe(true); // 10 > default appetite threshold 9

    const snapshots = await strategy.listRiskSnapshots(risk.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.inherentScore).toBe(20);
    expect(snapshots[0]?.reason).toBe('MFA deployed');
  });

  it('maps a risk to a control directly, independent of findings', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    const mapping = await strategy.addRiskControlMapping(risk.id, {
      controlId: 'ctrl-1',
      controlCode: 'IAM-001',
      controlTitle: 'Privileged Access MFA',
      effectivenessNote: 'Effective',
    });
    expect(await strategy.listRiskControlMappings(risk.id)).toHaveLength(1);

    await strategy.removeRiskControlMapping(mapping.id);
    expect(await strategy.listRiskControlMappings(risk.id)).toHaveLength(0);
  });

  it('runs a risk acceptance through requested -> approved, and supersedes on a new request', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    const future = new Date(Date.now() + 86400_000).toISOString();
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: future,
      approverId: 'ciso-1',
    });
    expect(acceptance.status).toBe('requested');

    await strategy.reviewRiskAcceptance(acceptance.id, 'ciso-1', 'Looks reasonable');
    const approved = await strategy.approveRiskAcceptance(acceptance.id, 'ciso-1');
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.approvedBy).toBe('ciso-1');

    const active = await strategy.getActiveRiskAcceptance(risk.id);
    expect(active?.id).toBe(acceptance.id);
  });

  it('rejects reviewing a risk acceptance as its own requester', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      approverId: 'ciso-1',
    });

    await expect(strategy.reviewRiskAcceptance(acceptance.id, 'user-1')).rejects.toThrow(
      'risk_acceptance_self_approval_forbidden',
    );
  });

  it('rejects reviewing a risk acceptance as someone other than the named approver', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      approverId: 'ciso-1',
    });

    await expect(strategy.reviewRiskAcceptance(acceptance.id, 'someone-else')).rejects.toThrow(
      'risk_acceptance_not_authorized_approver',
    );
  });

  it('rejects reviewing a risk acceptance that has already been decided', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      approverId: 'ciso-1',
    });
    await strategy.approveRiskAcceptance(acceptance.id, 'ciso-1');

    await expect(strategy.reviewRiskAcceptance(acceptance.id, 'ciso-1')).rejects.toThrow(
      `risk_acceptance_already_decided: ${acceptance.id}`,
    );
  });

  it('getRiskAcceptance returns the acceptance by id, or null when not found', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      approverId: 'ciso-1',
    });

    await expect(strategy.getRiskAcceptance(acceptance.id)).resolves.toEqual(acceptance);
    await expect(strategy.getRiskAcceptance('missing')).resolves.toBeNull();
  });

  it('getRiskTaxonomyCategory returns the category by id, or null when not found', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');

    await expect(strategy.getRiskTaxonomyCategory(taxonomy[0]!.id)).resolves.toEqual(taxonomy[0]);
    await expect(strategy.getRiskTaxonomyCategory('missing')).resolves.toBeNull();
  });

  it('attaches evidence to a risk', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    await strategy.createRiskEvidence('org-1', risk.id, {
      title: 'Risk acceptance memo',
      owner: 'user-1',
      evidenceType: 'document',
      source: 'internal',
      collectionDate: new Date().toISOString(),
      periodCovered: '2026',
      expirationDate: new Date().toISOString(),
      verificationStatus: 'verified',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });

    expect(await strategy.listRiskEvidence(risk.id)).toHaveLength(1);
  });

  it('attaches evidence to an assessment item', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      assessmentTypeId: types[0]!.id,
      title: 'Q3 Risk Assessment',
      ownerId: 'user-1',
    });
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Unpatched OS',
      description: 'Missing patches',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    const ev = await strategy.createAssessmentItemEvidence('org-1', item.id, {
      title: 'Patch report',
      owner: 'user-1',
      evidenceType: 'document',
      source: 'internal',
      collectionDate: new Date().toISOString(),
      periodCovered: '2026',
      expirationDate: new Date().toISOString(),
      verificationStatus: 'verified',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });

    expect(ev.assessmentItemId).toBe(item.id);
    expect(ev.orgId).toBe('org-1');
    expect(await strategy.listAssessmentItemEvidence(item.id)).toHaveLength(1);
  });

  it('scopes assessment item evidence to the requested item, excluding other items and risk-scoped evidence', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.createRiskEvidence('org-1', risk.id, {
      title: 'Risk acceptance memo',
      owner: 'user-1',
      evidenceType: 'document',
      source: 'internal',
      collectionDate: new Date().toISOString(),
      periodCovered: '2026',
      expirationDate: new Date().toISOString(),
      verificationStatus: 'verified',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });

    const control = await strategy.createInternalControl('org-1', {
      code: 'VM-002',
      title: 'Vulnerability Scanning',
      description: 'Weekly authenticated vulnerability scans.',
      domain: 'Vulnerability Management',
      owner: 'Security Ops',
      criticality: 'medium',
      controlType: 'detective',
      execution: 'automated',
      frequency: 'weekly',
      nature: 'technical',
      category: 'vuln-mgmt',
    });
    await strategy.createControlEvidence('org-1', control.id, {
      title: 'Weekly scan report — 2026-09-08',
      owner: 'Security Ops',
      evidenceType: 'report',
      source: 'Qualys',
      collectionDate: new Date().toISOString(),
      periodCovered: '2026-09-01/2026-09-08',
      expirationDate: new Date().toISOString(),
      verificationStatus: 'verified',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });

    const nistId = '00000000-0000-0000-0000-000000000003';
    await strategy.createFrameworkEvidence('org-1', {
      frameworkId: nistId,
      requirementId: 'nist-gv-po-01',
      title: 'Quarterly Risk Assessment Signoff.pdf',
      owner: 'Risk Officer',
      evidenceType: 'Policy Document',
      source: 'Jira',
      collectionDate: '2026-09-01',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01',
      verificationStatus: 'verified',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });

    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      assessmentTypeId: types[0]!.id,
      title: 'Q3 Risk Assessment',
      ownerId: 'user-1',
    });
    const item1 = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Unpatched OS',
      description: 'Missing patches',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    const item2 = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Weak auth',
      description: 'No MFA',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });

    const evidenceInput = {
      title: 'Evidence',
      owner: 'user-1',
      evidenceType: 'document',
      source: 'internal',
      collectionDate: new Date().toISOString(),
      periodCovered: '2026',
      expirationDate: new Date().toISOString(),
      verificationStatus: 'verified',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    } as const;
    await strategy.createAssessmentItemEvidence('org-1', item1.id, evidenceInput);
    await strategy.createAssessmentItemEvidence('org-1', item2.id, evidenceInput);

    const item1Evidence = await strategy.listAssessmentItemEvidence(item1.id);
    const item2Evidence = await strategy.listAssessmentItemEvidence(item2.id);
    expect(item1Evidence).toHaveLength(1);
    expect(item2Evidence).toHaveLength(1);
    expect(item1Evidence[0]!.id).not.toBe(item2Evidence[0]!.id);
    expect(item1Evidence.every((e) => e.assessmentItemId === item1.id)).toBe(true);
    expect(item2Evidence.every((e) => e.assessmentItemId === item2.id)).toBe(true);

    const riskEvidence = await strategy.listRiskEvidence(risk.id);
    expect(riskEvidence).toHaveLength(1);
    expect(item1Evidence.some((e) => e.id === riskEvidence[0]!.id)).toBe(false);

    const controlEvidence = await strategy.listControlEvidence(control.id);
    expect(controlEvidence).toHaveLength(1);
    expect(item1Evidence.some((e) => e.id === controlEvidence[0]!.id)).toBe(false);

    const frameworkEvidence = await strategy.listFrameworkEvidence(nistId, 'org-1');
    expect(frameworkEvidence.length).toBeGreaterThanOrEqual(1);
    expect(item1Evidence.some((e) => frameworkEvidence.some((fe) => fe.id === e.id))).toBe(false);
  });
});

describe('unified evidence', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('creates and lists evidence scoped to an asset', async () => {
    const ev = await s.createAssetEvidence('org1', 'asset-1', {
      title: 'Firewall config export',
      owner: 'Network Team',
      evidenceType: 'config',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    expect(ev.assetId).toBe('asset-1');
    expect(ev.createdBy).toBe('user-1');
    const list = await s.listAssetEvidence('asset-1');
    expect(list.map((e) => e.id)).toEqual([ev.id]);
  });

  it('updates evidence metadata without touching verificationStatus', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'Old title',
      owner: 'IT',
      evidenceType: 'screenshot',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    const updated = await s.updateEvidence(ev.id, {
      title: 'New title',
      verificationStatus: 'verified',
    } as never);
    expect(updated.title).toBe('New title');
    expect(updated.verificationStatus).toBe('pending_review');
  });

  it('deletes evidence', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'T',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    await s.deleteEvidence(ev.id);
    expect(await s.getEvidence(ev.id)).toBeNull();
  });

  it('verifies evidence, recording reviewer and timestamp', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'T',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    const reviewed = await s.reviewEvidence(ev.id, 'reviewer-1', 'verified');
    expect(reviewed.verificationStatus).toBe('verified');
    expect(reviewed.verifiedBy).toBe('reviewer-1');
    expect(reviewed.verifiedAt).not.toBeNull();
  });

  it('rejects self-verification', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'T',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    await expect(s.reviewEvidence(ev.id, 'user-1', 'verified')).rejects.toThrow(
      'evidence_self_review_forbidden',
    );
  });

  it('requires reviewNotes on rejection', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'T',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    await expect(s.reviewEvidence(ev.id, 'reviewer-1', 'rejected')).rejects.toThrow(
      'evidence_review_notes_required',
    );
    const rejected = await s.reviewEvidence(ev.id, 'reviewer-1', 'rejected', 'Not sufficient');
    expect(rejected.verificationStatus).toBe('rejected');
  });
});
