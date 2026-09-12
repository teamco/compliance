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
    const approved = await s.approveException(exc.id);
    expect(approved.status).toBe('approved');
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
    const rejected = await s.rejectException(exc.id);
    expect(rejected.status).toBe('rejected');
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

  it('updates issue status to resolved and sets resolvedAt', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
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
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
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
    });

    expect(created.id).toBeDefined();
    const updatedEvList = await s.listFrameworkEvidence(nistId, 'org1');
    expect(updatedEvList.some((e) => e.title === 'Quarterly Risk Assessment Signoff.pdf')).toBe(
      true,
    );
  });

  it('logs assessment findings connecting requirement to issues', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const assessments = await s.listFrameworkAssessments(nistId, 'org1');
    expect(assessments.length).toBeGreaterThanOrEqual(1);

    const finding = await s.createAssessmentFinding('org1', assessments[0].id, {
      title: 'Missing DR tabletop exercise minutes',
      severity: 'high',
      description: 'DR test conducted without recorded minutes',
    });

    expect(finding.findingId).toMatch(/^FIND-\d{4}-\d+/);

    const issues = await s.listIssues('org1');
    expect(issues.some((i) => i.title === 'Missing DR tabletop exercise minutes')).toBe(true);
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

    const resolved = await strategy.resolveFindingViaException(findings[0]!.id, 'exc-9');
    expect(resolved.status).toBe('accepted');
    expect(resolved.linkedExceptionId).toBe('exc-9');
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
    });

    const evidence = await strategy.listControlEvidence(control.id);
    expect(evidence).toHaveLength(1);

    const updated = await strategy.getInternalControl(control.id);
    expect(updated?.evidenceCount).toBe(1);

    const activity = await strategy.listControlActivity(control.id);
    expect(activity.some((a) => a.action === 'Evidence Uploaded')).toBe(true);
  });
});
