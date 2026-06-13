import { FakeNotesStrategy } from '../fakes/fake-notes';
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
    });
    expect(exc.status).toBe('pending');
    const list = await s.listExceptions('org1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(exc.id);
  });

  it('approves an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
    });
    const approved = await s.approveException(exc.id);
    expect(approved.status).toBe('approved');
  });

  it('rejects an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
    });
    const rejected = await s.rejectException(exc.id);
    expect(rejected.status).toBe('rejected');
  });

  it('updates exception fields', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'Old',
      justification: 'J',
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
    });
    expect(await s.listExceptions('org2')).toHaveLength(0);
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
    });
    expect(issue.status).toBe('open');
    expect(issue.source).toBe('manual');
    const list = await s.listIssues('org1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(issue.id);
  });

  it('updates issue status to resolved and sets resolvedAt', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
    });
    const updated = await s.updateIssue(issue.id, { status: 'resolved' });
    expect(updated.status).toBe('resolved');
    expect(updated.resolvedAt).not.toBeNull();
  });

  it('clears resolvedAt when status changes away from resolved', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
    });
    await s.updateIssue(issue.id, { status: 'resolved' });
    const reopened = await s.updateIssue(issue.id, { status: 'open' });
    expect(reopened.resolvedAt).toBeNull();
  });

  it('deletes an issue', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'medium',
    });
    await s.deleteIssue(issue.id);
    expect(await s.listIssues('org1')).toHaveLength(0);
  });

  it('scopes issues by orgId', async () => {
    await s.createIssue('org1', 'u1', { title: 'T', description: 'D', severity: 'low' });
    expect(await s.listIssues('org2')).toHaveLength(0);
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
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('creates risk and computes score', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'SQL Injection',
      description: 'Input not sanitized',
      category: 'Web Security',
      likelihood: 'high',
      impact: 'high',
    });
    expect(risk.riskScore).toBe(16); // 4 * 4
    expect(risk.treatment).toBe('mitigate');
  });

  it('lists risks for org', async () => {
    await s.createRisk('org1', 'u1', {
      title: 'R1',
      description: '',
      category: 'Cat',
      likelihood: 'low',
      impact: 'low',
    });
    const list = await s.listRisks('org1');
    expect(list).toHaveLength(1);
  });

  it('updates risk treatment', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R',
      description: '',
      category: 'C',
      likelihood: 'low',
      impact: 'low',
    });
    const updated = await s.updateRisk(risk.id, { treatment: 'accept' });
    expect(updated.treatment).toBe('accept');
  });

  it('recomputes score when likelihood changes', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R',
      description: '',
      category: 'C',
      likelihood: 'low',
      impact: 'medium',
    });
    const updated = await s.updateRisk(risk.id, { likelihood: 'very_high' });
    expect(updated.riskScore).toBe(15); // 5 * 3
  });

  it('deletes a risk', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R',
      description: '',
      category: 'C',
      likelihood: 'low',
      impact: 'low',
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

  it('creates CVRA assessment with draft status', async () => {
    const a = await s.createAssessment('org1', 'u1', {
      type: 'cvra',
      title: 'Q2 CVRA',
      scope: 'Payment services',
    });
    expect(a.type).toBe('cvra');
    expect(a.status).toBe('draft');
    expect(a.riskScore).toBe(0);
    expect(a.itemCount).toBe(0);
  });

  it('creates CTRA assessment', async () => {
    const a = await s.createAssessment('org1', 'u1', {
      type: 'ctra',
      title: 'Ransomware CTRA',
      scope: 'All systems',
    });
    expect(a.type).toBe('ctra');
  });

  it('adds items and recomputes aggregate score', async () => {
    const a = await s.createAssessment('org1', 'u1', {
      type: 'cvra',
      title: 'T',
      scope: 'S',
    });
    await s.addAssessmentItem(a.id, {
      subject: 'Unpatched OS',
      description: 'Missing patches',
      likelihood: 'high',
      impact: 'high',
    });
    await s.addAssessmentItem(a.id, {
      subject: 'Weak auth',
      description: 'No MFA',
      likelihood: 'medium',
      impact: 'medium',
    });
    const updated = await s.getAssessment(a.id);
    expect(updated!.itemCount).toBe(2);
    expect(updated!.riskScore).toBe(Math.round((16 + 9) / 2)); // (4*4 + 3*3) / 2 = 12
  });

  it('updates assessment status', async () => {
    const a = await s.createAssessment('org1', 'u1', {
      type: 'cvra',
      title: 'T',
      scope: 'S',
    });
    const updated = await s.updateAssessment(a.id, { status: 'in_review' });
    expect(updated.status).toBe('in_review');
  });

  it('lists assessments scoped by orgId', async () => {
    await s.createAssessment('org1', 'u1', { type: 'cvra', title: 'T', scope: 'S' });
    expect(await s.listAssessments('org2')).toHaveLength(0);
    expect(await s.listAssessments('org1')).toHaveLength(1);
  });

  it('deletes assessment and its items', async () => {
    const a = await s.createAssessment('org1', 'u1', { type: 'cvra', title: 'T', scope: 'S' });
    await s.addAssessmentItem(a.id, {
      subject: 'X',
      description: '',
      likelihood: 'low',
      impact: 'low',
    });
    await s.deleteAssessment(a.id);
    expect(await s.listAssessments('org1')).toHaveLength(0);
    expect(await s.listAssessmentItems(a.id)).toHaveLength(0);
  });

  it('updates item and recomputes score', async () => {
    const a = await s.createAssessment('org1', 'u1', { type: 'cvra', title: 'T', scope: 'S' });
    const item = await s.addAssessmentItem(a.id, {
      subject: 'X',
      description: '',
      likelihood: 'low',
      impact: 'low',
    });
    await s.updateAssessmentItem(item.id, { likelihood: 'very_high', impact: 'very_high' });
    const updated = await s.getAssessment(a.id);
    expect(updated!.riskScore).toBe(25); // 5*5
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
