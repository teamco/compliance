import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AiChatMessage,
  AiUsageLogEntry,
  AiUsageSummaryRpc,
  AiUsageTimeseriesPoint,
  Asset,
  AssetInput,
  AssetPatch,
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  ApiKey,
  ApiKeyWithSecret,
  DocumentStandard,
  Exception,
  ExceptionInput,
  ExceptionPatch,
  Framework,
  FrameworkControl,
  FrameworkRequirement,
  FrameworkRequirementPatch,
  InternalControl,
  InternalControlInput,
  InternalControlPatch,
  ControlFrameworkMappingInput,
  ControlCriticality,
  ControlType,
  ControlExecution,
  ControlFrequency,
  ControlNature,
  FrameworkMappingType,
  MappingValidation,
  ImplementationStatus,
  EffectivenessStatus,
  RequirementEvidence,
  RequirementAssessment,
  FrameworkActivity,
  Finding,
  FrameworkInput,
  FrameworkPatch,
  GapAnalysis,
  GapAnalysisResult,
  Issue,
  IssueInput,
  IssuePatch,
  NotesStrategy,
  Organization,
  OrganizationInput,
  PushSubscriptionPayload,
  ReportTemplate,
  ReportTemplateInput,
  RetentionPrefsPayload,
  Risk,
  RiskAssessment,
  RiskAssessmentInput,
  RiskAssessmentItem,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
  RiskAssessmentPatch,
  AssessmentType,
  AssessmentStatus,
  RiskImpact,
  RiskInput,
  RiskLikelihood,
  RiskPatch,
  StandardPatch,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  Webhook,
  WebhookInput,
  WorkflowTransition,
  Policy,
  PolicyInput,
  PolicyPatch,
  PolicyTemplate,
  PolicyControl,
  PolicyControlInput,
} from '@icore/shared';
import { DEFAULT_RETENTION_PREFS, DEFAULT_USER_PREFS, WORKFLOW_TRANSITIONS } from '@icore/shared';

function ok<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export class SupabaseNotesStrategy implements NotesStrategy {
  constructor(private readonly db: SupabaseClient) {}

  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    const L: Record<RiskLikelihood, number> = {
      very_low: 1,
      low: 2,
      medium: 3,
      high: 4,
      very_high: 5,
    };
    const I: Record<RiskImpact, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    return L[likelihood] * I[impact];
  }

  async listFrameworks(): Promise<Framework[]> {
    const { data, error } = await this.db
      .from('frameworks')
      .select('id, slug, name, description, version, category')
      .order('name');
    const rows = ok(data, error) as Array<{
      id: string;
      slug: string;
      name: string;
      description: string;
      version: string;
      category: string;
    }>;

    const counts = await Promise.all(
      rows.map(async (fw) => {
        const { count } = await this.db
          .from('controls')
          .select('id', { count: 'exact', head: true })
          .eq('framework_id', fw.id);
        return { id: fw.id, count: count ?? 0 };
      }),
    );
    const countMap = Object.fromEntries(counts.map((c) => [c.id, c.count]));

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      version: r.version,
      category: r.category as Framework['category'],
      controlCount: countMap[r.id] ?? 0,
    }));
  }

  async getFramework(id: string): Promise<Framework | null> {
    const { data, error } = await this.db
      .from('frameworks')
      .select('id, slug, name, description, version, category')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const r = data as {
      id: string;
      slug: string;
      name: string;
      description: string;
      version: string;
      category: string;
    };
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      version: r.version,
      category: r.category as Framework['category'],
    };
  }

  async createFramework(orgId: string, input: FrameworkInput): Promise<Framework> {
    const id = globalThis.crypto.randomUUID();
    const now = new Date().toISOString();
    const { data: row, error } = await this.db
      .from('frameworks')
      .insert({
        id,
        slug: input.slug,
        name: input.name,
        description: input.description,
        version: input.version,
        category: input.category,
      })
      .select()
      .single();

    if (error) {
      return {
        id,
        slug: input.slug,
        name: input.name,
        description: input.description,
        version: input.version,
        category: input.category,
        status: input.status ?? 'enabled',
        lastUpdated: new Date().getFullYear().toString(),
        controlCount: input.requirements?.length ?? 0,
        requirementsCount: input.requirements?.length ?? 0,
        applicableCount: input.requirements?.length ?? 0,
        notApplicableCount: 0,
        notReviewedCount: 0,
        isCustom: true,
        createdAt: now,
        updatedAt: now,
      };
    }

    const r = row as {
      id: string;
      slug: string;
      name: string;
      description: string;
      version: string;
      category: string;
    };
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      version: r.version,
      category: r.category as Framework['category'],
      status: input.status ?? 'enabled',
      controlCount: input.requirements?.length ?? 0,
      requirementsCount: input.requirements?.length ?? 0,
      applicableCount: input.requirements?.length ?? 0,
      isCustom: true,
    };
  }

  async updateFramework(id: string, _orgId: string, patch: FrameworkPatch): Promise<Framework> {
    const existing = await this.getFramework(id);
    if (!existing) throw new Error(`framework_not_found: ${id}`);
    return { ...existing, ...patch };
  }

  async deleteFramework(id: string, _orgId: string): Promise<void> {
    await this.db.from('frameworks').delete().eq('id', id);
  }

  async listRequirements(frameworkId: string, _orgId?: string): Promise<FrameworkRequirement[]> {
    const controls = await this.listControlsByFramework(frameworkId);
    return controls.map((c) => ({
      id: c.id,
      frameworkId: c.frameworkId,
      code: c.code,
      title: c.title,
      description: c.description,
      categoryCode: c.code.split('-')[0] ?? c.code,
      categoryName: c.category,
      applicability: 'applicable',
      implementationStatus: 'implemented',
      evidenceCount: 1,
      mappedControlsCount: 1,
      openFindingsCount: 0,
    }));
  }

  async getRequirement(
    frameworkId: string,
    reqId: string,
    orgId?: string,
  ): Promise<FrameworkRequirement | null> {
    const reqs = await this.listRequirements(frameworkId, orgId);
    return reqs.find((r) => r.id === reqId || r.code === reqId) ?? null;
  }

  async updateRequirement(
    frameworkId: string,
    reqId: string,
    _orgId: string,
    patch: FrameworkRequirementPatch,
  ): Promise<FrameworkRequirement> {
    const req = await this.getRequirement(frameworkId, reqId);
    if (!req) throw new Error(`requirement_not_found: ${reqId}`);
    return { ...req, ...patch };
  }

  async listInternalControls(orgId?: string, frameworkId?: string): Promise<InternalControl[]> {
    let query = this.db
      .from('internal_controls')
      .select('*')
      .order('created_at', { ascending: false });
    if (orgId) query = query.eq('org_id', orgId);
    const { data, error } = await query;
    const controls = await Promise.all(ok(data, error).map((row) => this.toInternalControl(row)));
    if (!frameworkId) return controls;
    return controls.filter((c) => c.frameworkMappings?.some((m) => m.frameworkId === frameworkId));
  }

  async getInternalControl(id: string, _orgId?: string): Promise<InternalControl | null> {
    const { data, error } = await this.db
      .from('internal_controls')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toInternalControl(data) : null;
  }

  async createInternalControl(orgId: string, data: InternalControlInput): Promise<InternalControl> {
    const { data: row, error } = await this.db
      .from('internal_controls')
      .insert({
        org_id: orgId,
        code: data.code,
        title: data.title,
        description: data.description,
        domain: data.domain,
        owner: data.owner,
        operator: data.operator ?? '',
        criticality: data.criticality,
        control_type: data.controlType,
        execution: data.execution,
        frequency: data.frequency,
        nature: data.nature,
        key_control: data.keyControl ?? false,
        parent_control_id: data.parentControlId ?? null,
        category: data.category,
        implementation_status: data.implementationStatus ?? 'not_implemented',
        implementation_description: data.implementationDescription ?? '',
      })
      .select()
      .single();
    return this.toInternalControl(ok(row, error));
  }

  async updateInternalControl(id: string, patch: InternalControlPatch): Promise<InternalControl> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.domain !== undefined) update['domain'] = patch.domain;
    if (patch.owner !== undefined) update['owner'] = patch.owner;
    if (patch.operator !== undefined) update['operator'] = patch.operator;
    if (patch.criticality !== undefined) update['criticality'] = patch.criticality;
    if (patch.controlType !== undefined) update['control_type'] = patch.controlType;
    if (patch.execution !== undefined) update['execution'] = patch.execution;
    if (patch.frequency !== undefined) update['frequency'] = patch.frequency;
    if (patch.nature !== undefined) update['nature'] = patch.nature;
    if (patch.keyControl !== undefined) update['key_control'] = patch.keyControl;
    if ('parentControlId' in patch) update['parent_control_id'] = patch.parentControlId;
    if (patch.implementationStatus !== undefined)
      update['implementation_status'] = patch.implementationStatus;
    if (patch.implementationDescription !== undefined)
      update['implementation_description'] = patch.implementationDescription;
    if (patch.designEffectiveness !== undefined)
      update['design_effectiveness'] = patch.designEffectiveness;
    if (patch.operatingEffectiveness !== undefined)
      update['operating_effectiveness'] = patch.operatingEffectiveness;

    const { data, error } = await this.db
      .from('internal_controls')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toInternalControl(ok(data, error));
  }

  async deleteInternalControl(id: string): Promise<void> {
    const { error } = await this.db.from('internal_controls').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async addControlFrameworkMapping(
    controlId: string,
    data: ControlFrameworkMappingInput,
  ): Promise<InternalControl> {
    const { error } = await this.db.from('internal_control_framework_mappings').insert({
      control_id: controlId,
      framework_id: data.frameworkId,
      requirement_code: data.requirementCode,
      requirement_title: data.requirementTitle ?? null,
      mapping_type: data.mappingType,
      validation: data.validation,
    });
    if (error) throw new Error(error.message);
    const control = await this.getInternalControl(controlId);
    if (!control) throw new Error(`internal_control_not_found: ${controlId}`);
    return control;
  }

  async removeControlFrameworkMapping(
    controlId: string,
    mappingId: string,
  ): Promise<InternalControl> {
    const { error } = await this.db
      .from('internal_control_framework_mappings')
      .delete()
      .eq('id', mappingId);
    if (error) throw new Error(error.message);
    const control = await this.getInternalControl(controlId);
    if (!control) throw new Error(`internal_control_not_found: ${controlId}`);
    return control;
  }

  private async toInternalControl(row: Record<string, unknown>): Promise<InternalControl> {
    const { data: mappingRows, error } = await this.db
      .from('internal_control_framework_mappings')
      .select(
        'id, framework_id, requirement_code, requirement_title, mapping_type, validation, frameworks(name)',
      )
      .eq('control_id', row['id'] as string);
    if (error) throw new Error(error.message);
    const frameworkMappings = (mappingRows ?? []).map((m: Record<string, unknown>) => ({
      id: m['id'] as string,
      frameworkId: m['framework_id'] as string,
      frameworkName:
        ((m['frameworks'] as Record<string, unknown> | null)?.['name'] as string) ?? '',
      requirementCode: m['requirement_code'] as string,
      requirementTitle: m['requirement_title'] as string | undefined,
      mappingType: m['mapping_type'] as FrameworkMappingType,
      validation: m['validation'] as MappingValidation,
    }));

    const { count: evidenceCount } = await this.db
      .from('requirement_evidence')
      .select('id', { count: 'exact', head: true })
      .eq('control_id', row['id'] as string);
    const { count: findingsCount } = await this.db
      .from('findings')
      .select('id', { count: 'exact', head: true })
      .eq('control_id', row['id'] as string);

    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      code: row['code'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      domain: row['domain'] as string,
      owner: row['owner'] as string,
      operator: row['operator'] as string,
      criticality: row['criticality'] as ControlCriticality,
      controlType: row['control_type'] as ControlType,
      execution: row['execution'] as ControlExecution,
      frequency: row['frequency'] as ControlFrequency,
      nature: row['nature'] as ControlNature,
      keyControl: row['key_control'] as boolean,
      parentControlId: row['parent_control_id'] as string | null,
      category: row['category'] as string,
      implementationStatus: row['implementation_status'] as ImplementationStatus,
      implementationDescription: row['implementation_description'] as string,
      designEffectiveness: row['design_effectiveness'] as EffectivenessStatus,
      operatingEffectiveness: row['operating_effectiveness'] as EffectivenessStatus,
      frameworkMappings,
      frameworkCount: new Set(frameworkMappings.map((m) => m.frameworkId)).size,
      requirementCount: frameworkMappings.length,
      evidenceCount: evidenceCount ?? 0,
      findingsCount: findingsCount ?? 0,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  async listFrameworkEvidence(
    frameworkId: string,
    _orgId?: string,
  ): Promise<RequirementEvidence[]> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('framework_id', frameworkId);
    return ok(data, error).map((row) => this.toRequirementEvidence(row));
  }

  async createFrameworkEvidence(
    orgId: string,
    data: Omit<RequirementEvidence, 'id'>,
  ): Promise<RequirementEvidence> {
    const { data: row, error } = await this.db
      .from('requirement_evidence')
      .insert(this.evidenceInsertPayload(orgId, data))
      .select()
      .single();
    return this.toRequirementEvidence(ok(row, error));
  }

  async listControlEvidence(controlId: string): Promise<RequirementEvidence[]> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('control_id', controlId);
    return ok(data, error).map((row) => this.toRequirementEvidence(row));
  }

  async createControlEvidence(
    orgId: string,
    controlId: string,
    data: Omit<RequirementEvidence, 'id' | 'controlId'>,
  ): Promise<RequirementEvidence> {
    const { data: row, error } = await this.db
      .from('requirement_evidence')
      .insert({ ...this.evidenceInsertPayload(orgId, data), control_id: controlId })
      .select()
      .single();
    const evidence = this.toRequirementEvidence(ok(row, error));
    await this.db.from('framework_activities').insert({
      control_id: controlId,
      action: 'Evidence Uploaded',
      details: `Evidence item "${data.title}" added by ${data.owner}.`,
      actor: data.owner,
    });
    return evidence;
  }

  private evidenceInsertPayload(
    orgId: string,
    data: Omit<RequirementEvidence, 'id'>,
  ): Record<string, unknown> {
    return {
      org_id: orgId,
      framework_id: data.frameworkId ?? null,
      requirement_id: data.requirementId ?? null,
      title: data.title,
      owner: data.owner,
      evidence_type: data.evidenceType,
      source: data.source,
      collection_date: data.collectionDate,
      period_covered: data.periodCovered,
      expiration_date: data.expirationDate,
      verification_status: data.verificationStatus,
      url: data.url ?? null,
    };
  }

  private toRequirementEvidence(row: Record<string, unknown>): RequirementEvidence {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      controlId: row['control_id'] as string | undefined,
      frameworkId: row['framework_id'] as string | undefined,
      requirementId: row['requirement_id'] as string | undefined,
      title: row['title'] as string,
      owner: row['owner'] as string,
      evidenceType: row['evidence_type'] as string,
      source: row['source'] as string,
      collectionDate: row['collection_date'] as string,
      periodCovered: row['period_covered'] as string,
      expirationDate: row['expiration_date'] as string,
      verificationStatus: row['verification_status'] as RequirementEvidence['verificationStatus'],
      url: row['url'] as string | undefined,
    };
  }

  async listFrameworkAssessments(
    frameworkId: string,
    _orgId?: string,
  ): Promise<RequirementAssessment[]> {
    const { data, error } = await this.db
      .from('requirement_assessments')
      .select('*')
      .eq('framework_id', frameworkId);
    return ok(data, error).map((row) => this.toRequirementAssessment(row));
  }

  async createAssessmentFinding(
    _orgId: string,
    _assessmentId: string,
    _findingData: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ): Promise<{ findingId: string }> {
    return {
      findingId: `FIND-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    };
  }

  async listControlAssessments(controlId: string): Promise<RequirementAssessment[]> {
    const { data, error } = await this.db
      .from('requirement_assessments')
      .select('*')
      .eq('control_id', controlId);
    return ok(data, error).map((row) => this.toRequirementAssessment(row));
  }

  async createControlAssessment(
    orgId: string,
    controlId: string,
    data: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ): Promise<RequirementAssessment> {
    const { data: row, error } = await this.db
      .from('requirement_assessments')
      .insert({
        org_id: orgId,
        control_id: controlId,
        cycle_name: data.cycleName,
        status: data.status,
        implementation_status: data.implementationStatus,
        design_effectiveness: data.designEffectiveness,
        operating_effectiveness: data.operatingEffectiveness,
        assessor: data.assessor,
        assessment_date: data.assessmentDate,
        observation: data.observation,
      })
      .select()
      .single();
    const assessment = this.toRequirementAssessment(ok(row, error));

    await this.db
      .from('internal_controls')
      .update({
        design_effectiveness: data.designEffectiveness,
        operating_effectiveness: data.operatingEffectiveness,
        updated_at: new Date().toISOString(),
      })
      .eq('id', controlId);

    if (
      data.operatingEffectiveness === 'ineffective' ||
      data.operatingEffectiveness === 'partially_effective'
    ) {
      const control = await this.getInternalControl(controlId);
      const findingNum = Math.floor(1000 + Math.random() * 9000);
      const { data: findingRow, error: findingError } = await this.db
        .from('findings')
        .insert({
          org_id: orgId,
          code: `FIND-${new Date().getFullYear()}-${findingNum}`,
          control_id: controlId,
          assessment_id: assessment.id,
          title: `${control?.title ?? 'Control'} — ${data.operatingEffectiveness.replace('_', ' ')}`,
          description: data.observation,
          severity: data.operatingEffectiveness === 'ineffective' ? 'high' : 'medium',
        })
        .select()
        .single();
      const finding = ok(findingRow, findingError);
      await this.db
        .from('requirement_assessments')
        .update({ finding_id: finding['id'] })
        .eq('id', assessment.id);
      assessment.findingId = finding['id'] as string;
      assessment.findingTitle = finding['title'] as string;
      assessment.findingSeverity = finding['severity'] as RequirementAssessment['findingSeverity'];
    }

    await this.db.from('framework_activities').insert({
      control_id: controlId,
      action: 'Assessment Completed',
      details: `Cycle "${data.cycleName}" — operating effectiveness: ${data.operatingEffectiveness}.`,
      actor: data.assessor,
    });

    return assessment;
  }

  private toRequirementAssessment(row: Record<string, unknown>): RequirementAssessment {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      controlId: row['control_id'] as string | undefined,
      frameworkId: row['framework_id'] as string | undefined,
      requirementId: row['requirement_id'] as string | undefined,
      cycleName: row['cycle_name'] as string,
      status: row['status'] as RequirementAssessment['status'],
      implementationStatus: row['implementation_status'] as ImplementationStatus,
      designEffectiveness: row['design_effectiveness'] as EffectivenessStatus,
      operatingEffectiveness: row['operating_effectiveness'] as EffectivenessStatus,
      assessor: row['assessor'] as string,
      assessmentDate: row['assessment_date'] as string,
      observation: row['observation'] as string,
      findingId: row['finding_id'] as string | undefined,
    };
  }

  async listControlFindings(controlId: string): Promise<Finding[]> {
    const { data, error } = await this.db.from('findings').select('*').eq('control_id', controlId);
    return ok(data, error).map((row) => this.toFinding(row));
  }

  async linkFindingToRisk(findingId: string, riskId: string): Promise<Finding> {
    const { data, error } = await this.db
      .from('findings')
      .update({ linked_risk_id: riskId, updated_at: new Date().toISOString() })
      .eq('id', findingId)
      .select()
      .single();
    return this.toFinding(ok(data, error));
  }

  async linkFindingToIssue(findingId: string, issueId: string): Promise<Finding> {
    const { data, error } = await this.db
      .from('findings')
      .update({ linked_issue_id: issueId, updated_at: new Date().toISOString() })
      .eq('id', findingId)
      .select()
      .single();
    return this.toFinding(ok(data, error));
  }

  async resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    const { data, error } = await this.db
      .from('findings')
      .update({
        linked_exception_id: exceptionId,
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', findingId)
      .select()
      .single();
    return this.toFinding(ok(data, error));
  }

  private toFinding(row: Record<string, unknown>): Finding {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      code: row['code'] as string,
      controlId: row['control_id'] as string,
      assessmentId: row['assessment_id'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      severity: row['severity'] as Finding['severity'],
      status: row['status'] as Finding['status'],
      linkedIssueId: row['linked_issue_id'] as string | undefined,
      linkedExceptionId: row['linked_exception_id'] as string | undefined,
      linkedRiskId: row['linked_risk_id'] as string | undefined,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  async listFrameworkActivities(
    frameworkId: string,
    _orgId?: string,
  ): Promise<FrameworkActivity[]> {
    const { data, error } = await this.db
      .from('framework_activities')
      .select('*')
      .eq('framework_id', frameworkId)
      .order('timestamp', { ascending: false });
    return ok(data, error).map((row) => this.toFrameworkActivity(row));
  }

  async listControlActivity(controlId: string): Promise<FrameworkActivity[]> {
    const { data, error } = await this.db
      .from('framework_activities')
      .select('*')
      .eq('control_id', controlId)
      .order('timestamp', { ascending: false });
    return ok(data, error).map((row) => this.toFrameworkActivity(row));
  }

  private toFrameworkActivity(row: Record<string, unknown>): FrameworkActivity {
    return {
      id: row['id'] as string,
      frameworkId: row['framework_id'] as string | undefined,
      controlId: row['control_id'] as string | undefined,
      action: row['action'] as string,
      details: row['details'] as string,
      actor: row['actor'] as string,
      timestamp: row['timestamp'] as string,
    };
  }

  async listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]> {
    const { data, error } = await this.db
      .from('controls')
      .select('id, framework_id, code, title, description, category')
      .eq('framework_id', frameworkId)
      .order('code');
    const rows = ok(data, error) as Array<{
      id: string;
      framework_id: string;
      code: string;
      title: string;
      description: string;
      category: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      frameworkId: r.framework_id,
      code: r.code,
      title: r.title,
      description: r.description,
      category: r.category,
    }));
  }

  async listStandardsByFramework(orgId: string, frameworkId: string): Promise<DocumentStandard[]> {
    const { data, error } = await this.db
      .from('generated_standards')
      .select('standards')
      .eq('org_profile_id', orgId)
      .eq('status', 'completed');
    const rows = ok(data, error) as Array<{ standards: DocumentStandard[] }>;
    const seen = new Set<string>();
    const result: DocumentStandard[] = [];
    for (const row of rows) {
      for (const std of row.standards ?? []) {
        if (
          std.frameworkMappings?.some((m) => m.frameworkId === frameworkId) &&
          !seen.has(std.code)
        ) {
          seen.add(std.code);
          result.push(std);
        }
      }
    }
    return result;
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    const { data, error } = await this.db
      .from('org_profiles')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapOrg(r));
  }

  async createOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    const now = new Date().toISOString();
    const { data: row, error } = await this.db
      .from('org_profiles')
      .insert({
        user_id: userId,
        name: data.name,
        industry: data.industry,
        size: data.size,
        regions: data.regions,
        tech_stack: data.techStack,
        regulations: data.regulations,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    return this.mapOrg(ok(row, error));
  }

  async getOrganizationById(orgId: string): Promise<Organization | null> {
    const { data, error } = await this.db
      .from('org_profiles')
      .select()
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapOrg(data) : null;
  }

  async updateOrganization(orgId: string, data: OrganizationInput): Promise<Organization> {
    const { data: row, error } = await this.db
      .from('org_profiles')
      .update({
        name: data.name,
        industry: data.industry,
        size: data.size,
        regions: data.regions,
        tech_stack: data.techStack,
        regulations: data.regulations,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)
      .select()
      .single();
    return this.mapOrg(ok(row, error));
  }

  async deleteOrganization(orgId: string): Promise<void> {
    const { error } = await this.db.from('org_profiles').delete().eq('id', orgId);
    if (error) throw new Error(error.message);
  }

  async createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }> {
    const { data, error } = await this.db
      .from('generated_standards')
      .insert({
        user_id: userId,
        org_profile_id: orgId,
        framework_ids: frameworkIds,
        standards: [],
        status: 'pending',
        workflow_status: 'draft',
      })
      .select('id')
      .single();
    const r = ok(data, error) as { id: string };
    return { id: r.id };
  }

  async saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void> {
    const { error } = await this.db
      .from('generated_standards')
      .update({ standards, status: 'completed' })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async failStandardsDocument(id: string, _reason?: string): Promise<void> {
    const { error } = await this.db
      .from('generated_standards')
      .update({ status: 'failed' })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async deleteStandardsDocument(id: string): Promise<void> {
    const { error } = await this.db.from('generated_standards').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async resetStandardsDocument(id: string): Promise<void> {
    const { error } = await this.db
      .from('generated_standards')
      .update({ status: 'pending', standards: [] })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    const { data, error } = await this.db
      .from('generated_standards')
      .select()
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapDoc(data) : null;
  }

  async listStandardsDocuments(orgId: string): Promise<StandardsDocument[]> {
    const { data, error } = await this.db
      .from('generated_standards')
      .select()
      .eq('org_profile_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapDoc(r));
  }

  async transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument> {
    const doc = await this.getStandardsDocument(id);
    if (!doc) throw new Error('doc_not_found');
    const { from, to } = WORKFLOW_TRANSITIONS[transition];
    if (doc.workflowStatus !== from) {
      throw new Error(`invalid_transition: ${doc.workflowStatus} → ${transition}`);
    }
    const { error } = await this.db
      .from('generated_standards')
      .update({ workflow_status: to })
      .eq('id', id);
    if (error) throw new Error(error.message);
    if (transition === 'approve') {
      const { count } = await this.db
        .from('standards_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', id);
      const version = (count ?? 0) + 1;
      const { error: snapErr } = await this.db.from('standards_snapshots').insert({
        document_id: id,
        version,
        workflow_status: to,
        standards: doc.standards,
      });
      if (snapErr) throw new Error(snapErr.message);
    }
    return { ...doc, workflowStatus: to };
  }

  async listSnapshots(documentId: string): Promise<StandardsSnapshot[]> {
    const { data, error } = await this.db
      .from('standards_snapshots')
      .select()
      .eq('document_id', documentId)
      .order('version', { ascending: false });
    return (ok(data, error) as unknown[]).map((r) => this.mapSnapshot(r));
  }

  async getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null> {
    const { data, error } = await this.db
      .from('standards_snapshots')
      .select()
      .eq('id', snapshotId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapSnapshot(data) : null;
  }

  async updateStandard(
    docId: string,
    code: string,
    patch: StandardPatch,
  ): Promise<DocumentStandard> {
    const doc = await this.getStandardsDocument(docId);
    if (!doc) throw new Error('doc_not_found');
    const idx = doc.standards.findIndex((c) => c.code === code);
    if (idx === -1) throw new Error('standard_not_found');
    const updated = { ...doc.standards[idx], ...patch } as DocumentStandard;
    const standards = [...doc.standards];
    standards[idx] = updated;
    const { error } = await this.db
      .from('generated_standards')
      .update({ standards })
      .eq('id', docId);
    if (error) throw new Error(error.message);
    return updated;
  }

  async getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    const { data } = await this.db
      .from('profiles')
      .select('theme, language, notification_prefs')
      .eq('id', userId)
      .single();

    if (!data) return { ...DEFAULT_USER_PREFS };

    return {
      theme: (data.theme as UserPrefsPayload['theme']) ?? 'system',
      language: (data.language as UserPrefsPayload['language']) ?? 'en',
      notificationPrefs: {
        ...DEFAULT_USER_PREFS.notificationPrefs,
        ...((data.notification_prefs as Partial<UserPrefsPayload['notificationPrefs']>) ?? {}),
      },
    };
  }

  async updateUserPrefs(
    userId: string,
    patch: Partial<UserPrefsPayload>,
  ): Promise<UserPrefsPayload> {
    const update: Record<string, unknown> = {};
    if (patch.theme !== undefined) update['theme'] = patch.theme;
    if (patch.language !== undefined) update['language'] = patch.language;
    if (patch.notificationPrefs !== undefined)
      update['notification_prefs'] = patch.notificationPrefs;

    const { error } = await this.db.from('profiles').update(update).eq('id', userId);

    if (error) throw new Error(error.message);
    return this.getUserPrefs(userId);
  }

  async savePushSubscription(
    userId: string,
    sub: PushSubscriptionPayload,
  ): Promise<{ ok: boolean }> {
    const { error } = await this.db
      .from('push_subscriptions')
      .upsert(
        { user_id: userId, endpoint: sub.endpoint, keys: sub.keys },
        { onConflict: 'endpoint' },
      );

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    const { error } = await this.db
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  async getChatHistory(userId: string, limit = 100): Promise<AiChatMessage[]> {
    const { data, error } = await this.db
      .from('ai_chat_messages')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      role: r.role as 'user' | 'assistant',
      content: r.content as string,
      createdAt: r.created_at as string,
    }));
  }

  async saveChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AiChatMessage> {
    const { data, error } = await this.db
      .from('ai_chat_messages')
      .insert({ user_id: userId, role, content })
      .select('id, role, content, created_at')
      .single();

    if (error) throw new Error(error.message);
    const r = data as { id: string; role: string; content: string; created_at: string };
    return {
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      createdAt: r.created_at,
    };
  }

  async clearChatHistory(userId: string): Promise<{ ok: boolean }> {
    const { error } = await this.db.from('ai_chat_messages').delete().eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  // ─── Audit log ─────────────────────────────────────────────────────────────

  async logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const { error } = await this.db.from('audit_logs').insert({
      user_id: userId,
      action,
      resource_type: resourceType ?? null,
      resource_id: resourceId ?? null,
      metadata,
    });
    if (error) throw new Error(error.message);
  }

  async listAuditLogs(userId: string, filters: AuditLogFilters = {}): Promise<AuditLogPage> {
    const { page = 1, limit = 50, action, from, to } = filters;
    const offset = (page - 1) * limit;

    let q = this.db
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) q = q.eq('action', action);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, count, error } = await q;
    if (error) throw new Error(error.message);

    const items: AuditLog[] = (data ?? []).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      action: r.action as string,
      resourceType: r.resource_type as string | null,
      resourceId: r.resource_id as string | null,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.created_at as string,
    }));

    return { items, total: count ?? 0, page, limit };
  }

  // ─── API keys ──────────────────────────────────────────────────────────────

  async createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret> {
    const rawKey = `cpiq_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);

    const { data, error } = await this.db
      .from('api_keys')
      .insert({
        user_id: userId,
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        expires_at: expiresAt ?? null,
      })
      .select('id, user_id, name, key_prefix, expires_at, last_used_at, revoked_at, created_at')
      .single();

    if (error) throw new Error(error.message);
    return { ...this.mapApiKey(data), fullKey: rawKey };
  }

  async listApiKeys(userId: string): Promise<ApiKey[]> {
    const { data, error } = await this.db
      .from('api_keys')
      .select('id, user_id, name, key_prefix, expires_at, last_used_at, revoked_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapApiKey(r));
  }

  async revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }> {
    const { error } = await this.db
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  private mapApiKey(r: unknown): ApiKey {
    const row = r as {
      id: string;
      user_id: string;
      name: string;
      key_prefix: string;
      expires_at: string | null;
      last_used_at: string | null;
      revoked_at: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  async createWebhook(userId: string, input: WebhookInput): Promise<Webhook> {
    const secret = randomBytes(20).toString('hex');
    const { data, error } = await this.db
      .from('webhooks')
      .insert({ user_id: userId, url: input.url, events: input.events, secret })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapWebhook(data);
  }

  async listWebhooks(userId: string): Promise<Webhook[]> {
    const { data, error } = await this.db
      .from('webhooks')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapWebhook(r));
  }

  async updateWebhook(
    id: string,
    userId: string,
    patch: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook> {
    const update: Record<string, unknown> = {};
    if (patch.url !== undefined) update['url'] = patch.url;
    if (patch.events !== undefined) update['events'] = patch.events;
    if (patch.active !== undefined) update['active'] = patch.active;

    const { data, error } = await this.db
      .from('webhooks')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapWebhook(data);
  }

  async deleteWebhook(id: string, userId: string): Promise<{ ok: boolean }> {
    const { error } = await this.db.from('webhooks').delete().eq('id', id).eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  private mapWebhook(r: unknown): Webhook {
    const row = r as {
      id: string;
      user_id: string;
      url: string;
      events: string[];
      secret: string;
      active: boolean;
      created_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      url: row.url,
      events: row.events as Webhook['events'],
      secret: row.secret,
      active: row.active,
      createdAt: row.created_at,
    };
  }

  // ─── Report templates ──────────────────────────────────────────────────────

  async listReportTemplates(): Promise<ReportTemplate[]> {
    const { data, error } = await this.db
      .from('report_templates')
      .select()
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapReportTemplate(r));
  }

  async createReportTemplate(userId: string, input: ReportTemplateInput): Promise<ReportTemplate> {
    const { data, error } = await this.db
      .from('report_templates')
      .insert({
        name: input.name,
        scope: input.scope,
        brand_name: input.brandName,
        accent_color: input.accentColor,
        include_summary: input.includeSummary,
        include_details: input.includeDetails,
        include_recommendations: input.includeRecommendations,
        footer_note: input.footerNote,
        favorite_org_ids: input.favoriteOrgIds,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapReportTemplate(data);
  }

  async updateReportTemplate(
    id: string,
    patch: Partial<ReportTemplateInput>,
  ): Promise<ReportTemplate> {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update['name'] = patch.name;
    if (patch.scope !== undefined) update['scope'] = patch.scope;
    if (patch.brandName !== undefined) update['brand_name'] = patch.brandName;
    if (patch.accentColor !== undefined) update['accent_color'] = patch.accentColor;
    if (patch.includeSummary !== undefined) update['include_summary'] = patch.includeSummary;
    if (patch.includeDetails !== undefined) update['include_details'] = patch.includeDetails;
    if (patch.includeRecommendations !== undefined)
      update['include_recommendations'] = patch.includeRecommendations;
    if (patch.footerNote !== undefined) update['footer_note'] = patch.footerNote;
    if (patch.favoriteOrgIds !== undefined) update['favorite_org_ids'] = patch.favoriteOrgIds;

    const { data, error } = await this.db
      .from('report_templates')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapReportTemplate(data);
  }

  async deleteReportTemplate(id: string): Promise<{ ok: boolean }> {
    const { error } = await this.db.from('report_templates').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  async addTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    const current = await this.getTemplateFavorites(id);
    const next = current.includes(orgId) ? current : [...current, orgId];
    return this.updateReportTemplate(id, { favoriteOrgIds: next });
  }

  async removeTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    const current = await this.getTemplateFavorites(id);
    return this.updateReportTemplate(id, {
      favoriteOrgIds: current.filter((o) => o !== orgId),
    });
  }

  private async getTemplateFavorites(id: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('report_templates')
      .select('favorite_org_ids')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return ((data as { favorite_org_ids: string[] | null })?.favorite_org_ids ?? []) as string[];
  }

  private mapReportTemplate(r: unknown): ReportTemplate {
    const row = r as {
      id: string;
      name: string;
      scope: string;
      brand_name: string;
      accent_color: string;
      include_summary: boolean;
      include_details: boolean;
      include_recommendations: boolean;
      footer_note: string;
      favorite_org_ids: string[] | null;
      created_by: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      name: row.name,
      scope: row.scope as ReportTemplate['scope'],
      brandName: row.brand_name,
      accentColor: row.accent_color,
      includeSummary: row.include_summary,
      includeDetails: row.include_details,
      includeRecommendations: row.include_recommendations,
      footerNote: row.footer_note,
      favoriteOrgIds: row.favorite_org_ids ?? [],
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  // ─── Retention ─────────────────────────────────────────────────────────────

  async getRetentionPrefs(userId: string): Promise<RetentionPrefsPayload> {
    const { data } = await this.db
      .from('profiles')
      .select('retention_prefs')
      .eq('id', userId)
      .single();

    if (!data) return { ...DEFAULT_RETENTION_PREFS };
    return {
      ...DEFAULT_RETENTION_PREFS,
      ...((data.retention_prefs as Partial<RetentionPrefsPayload>) ?? {}),
    };
  }

  async updateRetentionPrefs(
    userId: string,
    patch: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload> {
    const current = await this.getRetentionPrefs(userId);
    const updated = { ...current, ...patch };
    const { error } = await this.db
      .from('profiles')
      .update({ retention_prefs: updated })
      .eq('id', userId);

    if (error) throw new Error(error.message);
    return updated;
  }

  // ─── AI usage ──────────────────────────────────────────────────────────────

  logAiUsage(entry: AiUsageLogEntry): void {
    void Promise.resolve(
      this.db.from('ai_usage_log').insert({
        user_id: entry.user_id,
        provider: entry.provider,
        operation: entry.operation,
        model: entry.model,
        key_source: entry.key_source,
        input_tokens: entry.input_tokens ?? 0,
        output_tokens: entry.output_tokens ?? 0,
        success: entry.success,
        error_code: entry.error_code ?? null,
        latency_ms: entry.latency_ms ?? 0,
      }),
    )
      .then(({ error }) => {
        if (error) console.warn('ai_usage_log insert failed:', error.message);
      })
      .catch((err: unknown) => {
        console.warn(
          'ai_usage_log insert threw:',
          err instanceof Error ? err.message : String(err),
        );
      });
  }

  async getAiUsageSummary(since: string, userId?: string): Promise<AiUsageSummaryRpc> {
    const { data, error } = await this.db.rpc('ai_usage_summary', {
      p_since: since,
      p_user_id: userId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as AiUsageSummaryRpc;
  }

  async getAiUsageTimeseries(since: string, userId?: string): Promise<AiUsageTimeseriesPoint[]> {
    const { data, error } = await this.db.rpc('ai_usage_timeseries', {
      p_since: since,
      p_user_id: userId ?? null,
    });
    if (error) throw new Error(error.message);
    return (data as AiUsageTimeseriesPoint[]) ?? [];
  }

  private mapOrg(r: unknown): Organization {
    const row = r as {
      id: string;
      user_id: string;
      name: string;
      industry: string;
      size: string;
      regions: string[];
      tech_stack: string[];
      regulations: string[];
      created_at: string;
      updated_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      industry: row.industry,
      size: row.size as Organization['size'],
      regions: row.regions,
      techStack: row.tech_stack,
      regulations: row.regulations,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSnapshot(r: unknown): StandardsSnapshot {
    const row = r as {
      id: string;
      document_id: string;
      version: number;
      workflow_status: string;
      standards: DocumentStandard[];
      created_at: string;
      created_by?: string;
    };
    return {
      id: row.id,
      documentId: row.document_id,
      version: row.version,
      workflowStatus: row.workflow_status as StandardsSnapshot['workflowStatus'],
      standards: row.standards ?? [],
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  async saveGapAnalysis(
    orgId: string,
    userId: string,
    docId: string | null,
    result: GapAnalysisResult,
  ): Promise<GapAnalysis> {
    const { data, error } = await this.db
      .from('gap_analyses')
      .insert({
        org_id: orgId,
        user_id: userId,
        doc_id: docId,
        result,
        risk_score: result.riskScore,
      })
      .select()
      .single();
    const row = ok(data, error) as {
      id: string;
      org_id: string;
      user_id: string;
      doc_id: string | null;
      result: GapAnalysisResult;
      risk_score: number;
      created_at: string;
    };
    return {
      id: row.id,
      orgId: row.org_id,
      userId: row.user_id,
      docId: row.doc_id,
      result: row.result,
      riskScore: row.risk_score,
      createdAt: row.created_at,
    };
  }

  async listGapAnalyses(orgId: string): Promise<GapAnalysis[]> {
    const { data, error } = await this.db
      .from('gap_analyses')
      .select()
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      userId: r.user_id,
      docId: r.doc_id,
      result: r.result as GapAnalysisResult,
      riskScore: r.risk_score,
      createdAt: r.created_at,
    }));
  }

  async getGapAnalysis(id: string): Promise<GapAnalysis | null> {
    const { data, error } = await this.db.from('gap_analyses').select().eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: data.id,
      orgId: data.org_id,
      userId: data.user_id,
      docId: data.doc_id,
      result: data.result as GapAnalysisResult,
      riskScore: data.risk_score,
      createdAt: data.created_at,
    };
  }

  private mapDoc(r: unknown): StandardsDocument {
    const row = r as {
      id: string;
      user_id: string;
      org_profile_id: string;
      framework_ids: string[];
      standards: DocumentStandard[];
      status: string;
      workflow_status: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      orgId: row.org_profile_id,
      frameworkIds: row.framework_ids,
      standards: row.standards ?? [],
      status: row.status as StandardsDocument['status'],
      workflowStatus: (row.workflow_status ?? 'draft') as StandardsDocument['workflowStatus'],
      createdAt: row.created_at,
    };
  }

  // ─── Exceptions ────────────────────────────────────────────────────────────

  async listExceptions(orgId: string): Promise<Exception[]> {
    const { data, error } = await this.db
      .from('exceptions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map((row) => this.toException(row));
  }

  async createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception> {
    const { data: row, error } = await this.db
      .from('exceptions')
      .insert({
        org_id: orgId,
        user_id: userId,
        control_code: data.controlCode,
        standard_code: data.standardCode ?? null,
        framework_id: data.frameworkId,
        title: data.title,
        statement: data.statement,
        justification: data.justification,
        owner_id: data.ownerId,
        compensating_controls: data.compensatingControls ?? null,
        expires_at: data.expiresAt ?? null,
      })
      .select()
      .single();
    return this.toException(ok(row, error));
  }

  async getException(id: string): Promise<Exception | null> {
    const { data, error } = await this.db.from('exceptions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toException(data) : null;
  }

  async updateException(id: string, patch: ExceptionPatch): Promise<Exception> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.statement !== undefined) update['statement'] = patch.statement;
    if (patch.justification !== undefined) update['justification'] = patch.justification;
    if (patch.ownerId !== undefined) update['owner_id'] = patch.ownerId;
    if (patch.compensatingControls !== undefined)
      update['compensating_controls'] = patch.compensatingControls;
    if ('expiresAt' in patch) update['expires_at'] = patch.expiresAt;
    const { data, error } = await this.db
      .from('exceptions')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }

  async approveException(id: string): Promise<Exception> {
    const { data, error } = await this.db
      .from('exceptions')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }

  async rejectException(id: string): Promise<Exception> {
    const { data, error } = await this.db
      .from('exceptions')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }

  async deleteException(id: string): Promise<void> {
    const { error } = await this.db.from('exceptions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toException(row: Record<string, unknown>): Exception {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      controlCode: row['control_code'] as string,
      standardCode: row['standard_code'] as string | undefined,
      frameworkId: row['framework_id'] as string,
      title: row['title'] as string,
      statement: row['statement'] as string,
      justification: row['justification'] as string,
      ownerId: row['owner_id'] as string,
      compensatingControls: row['compensating_controls'] as string | undefined,
      status: row['status'] as Exception['status'],
      expiresAt: row['expires_at'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Issues ────────────────────────────────────────────────────────────────

  async listIssues(orgId: string): Promise<Issue[]> {
    const { data, error } = await this.db
      .from('issues')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map((row) => this.toIssue(row));
  }

  async createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue> {
    const { data: row, error } = await this.db
      .from('issues')
      .insert({
        org_id: orgId,
        user_id: userId,
        title: data.title,
        description: data.description,
        severity: data.severity,
        reporter_id: data.reporterId,
        owner_id: data.ownerId,
        affected_assets: data.affectedAssets ?? null,
        source: data.source ?? 'manual',
        source_id: data.sourceId ?? null,
        due_date: data.dueDate ?? null,
      })
      .select()
      .single();
    return this.toIssue(ok(row, error));
  }

  async getIssue(id: string): Promise<Issue | null> {
    const { data, error } = await this.db.from('issues').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toIssue(data) : null;
  }

  async updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.severity !== undefined) update['severity'] = patch.severity;
    if (patch.reporterId !== undefined) update['reporter_id'] = patch.reporterId;
    if (patch.ownerId !== undefined) update['owner_id'] = patch.ownerId;
    if (patch.affectedAssets !== undefined) update['affected_assets'] = patch.affectedAssets;
    if (patch.status !== undefined) {
      update['status'] = patch.status;
      if (!('resolvedAt' in patch)) {
        update['resolved_at'] = patch.status === 'resolved' ? new Date().toISOString() : null;
      }
    }
    if ('resolvedAt' in patch) update['resolved_at'] = patch.resolvedAt;
    if ('dueDate' in patch) update['due_date'] = patch.dueDate;
    const { data, error } = await this.db
      .from('issues')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toIssue(ok(data, error));
  }

  async deleteIssue(id: string): Promise<void> {
    const { error } = await this.db.from('issues').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toIssue(row: Record<string, unknown>): Issue {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      severity: row['severity'] as Issue['severity'],
      reporterId: row['reporter_id'] as string | null,
      ownerId: row['owner_id'] as string | null,
      affectedAssets: row['affected_assets'] as string | undefined,
      status: row['status'] as Issue['status'],
      source: row['source'] as Issue['source'],
      sourceId: row['source_id'] as string | null,
      dueDate: row['due_date'] as string | null,
      resolvedAt: row['resolved_at'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Assets ────────────────────────────────────────────────────────────────

  async listAssets(orgId: string): Promise<Asset[]> {
    const { data, error } = await this.db
      .from('assets')
      .select('*')
      .eq('org_id', orgId)
      .order('name');
    return ok(data, error).map((row) => this.toAsset(row));
  }

  async createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset> {
    const { data: row, error } = await this.db
      .from('assets')
      .insert({
        org_id: orgId,
        user_id: userId,
        code: data.code,
        name: data.name,
        type: data.type,
        criticality: data.criticality,
        description: data.description,
        owner: data.owner || data.businessOwner || '',
        business_owner: data.businessOwner,
        technical_owner: data.technicalOwner,
        department: data.department,
        status: data.status ?? 'active',
        data_classification: data.dataClassification,
        data_types: data.dataTypes ?? [],
        cia_confidentiality: data.ciaConfidentiality,
        cia_integrity: data.ciaIntegrity,
        cia_availability: data.ciaAvailability,
        hosting_type: data.hostingType,
        environment: data.environment,
        location: data.location,
        internet_facing: data.internetFacing,
        is_production: data.isProduction,
        vendor_id: data.vendorId,
        vendor_name: data.vendorName,
        vendor_ids: data.vendorIds ?? (data.vendorId ? [data.vendorId] : []),
        related_asset_ids: data.relatedAssetIds ?? [],
        compliance_scope: data.complianceScope ?? [],
        tags: data.tags ?? [],
      })
      .select()
      .single();
    return this.toAsset(ok(row, error));
  }

  async getAsset(id: string): Promise<Asset | null> {
    const { data, error } = await this.db.from('assets').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toAsset(data) : null;
  }

  async updateAsset(id: string, patch: AssetPatch): Promise<Asset> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.code !== undefined) update['code'] = patch.code;
    if (patch.name !== undefined) update['name'] = patch.name;
    if (patch.type !== undefined) update['type'] = patch.type;
    if (patch.criticality !== undefined) update['criticality'] = patch.criticality;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.owner !== undefined) update['owner'] = patch.owner;
    if (patch.businessOwner !== undefined) update['business_owner'] = patch.businessOwner;
    if (patch.technicalOwner !== undefined) update['technical_owner'] = patch.technicalOwner;
    if (patch.department !== undefined) update['department'] = patch.department;
    if (patch.status !== undefined) update['status'] = patch.status;
    if (patch.dataClassification !== undefined)
      update['data_classification'] = patch.dataClassification;
    if (patch.dataTypes !== undefined) update['data_types'] = patch.dataTypes;
    if (patch.ciaConfidentiality !== undefined)
      update['cia_confidentiality'] = patch.ciaConfidentiality;
    if (patch.ciaIntegrity !== undefined) update['cia_integrity'] = patch.ciaIntegrity;
    if (patch.ciaAvailability !== undefined) update['cia_availability'] = patch.ciaAvailability;
    if (patch.hostingType !== undefined) update['hosting_type'] = patch.hostingType;
    if (patch.environment !== undefined) update['environment'] = patch.environment;
    if (patch.location !== undefined) update['location'] = patch.location;
    if (patch.internetFacing !== undefined) update['internet_facing'] = patch.internetFacing;
    if (patch.isProduction !== undefined) update['is_production'] = patch.isProduction;
    if (patch.vendorId !== undefined) update['vendor_id'] = patch.vendorId;
    if (patch.vendorName !== undefined) update['vendor_name'] = patch.vendorName;
    if (patch.vendorIds !== undefined) update['vendor_ids'] = patch.vendorIds;
    if (patch.relatedAssetIds !== undefined) update['related_asset_ids'] = patch.relatedAssetIds;
    if (patch.complianceScope !== undefined) update['compliance_scope'] = patch.complianceScope;
    if (patch.tags !== undefined) update['tags'] = patch.tags;
    const { data, error } = await this.db
      .from('assets')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toAsset(ok(data, error));
  }

  async deleteAsset(id: string): Promise<void> {
    const { error } = await this.db.from('assets').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toAsset(row: Record<string, unknown>): Asset {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      code: row['code'] as string | undefined,
      name: row['name'] as string,
      type: row['type'] as Asset['type'],
      criticality: row['criticality'] as Asset['criticality'],
      description: (row['description'] as string) || '',
      owner: (row['owner'] as string) || (row['business_owner'] as string) || '',
      businessOwner: row['business_owner'] as string | undefined,
      technicalOwner: row['technical_owner'] as string | undefined,
      department: row['department'] as string | undefined,
      status: (row['status'] as Asset['status']) || 'active',
      dataClassification: row['data_classification'] as Asset['dataClassification'],
      dataTypes: (row['data_types'] as string[]) || [],
      ciaConfidentiality: row['cia_confidentiality'] as Asset['ciaConfidentiality'],
      ciaIntegrity: row['cia_integrity'] as Asset['ciaIntegrity'],
      ciaAvailability: row['cia_availability'] as Asset['ciaAvailability'],
      hostingType: row['hosting_type'] as string | undefined,
      environment: (row['environment'] as string) || 'production',
      location: row['location'] as string | undefined,
      internetFacing: Boolean(row['internet_facing']),
      isProduction: row['is_production'] !== undefined ? Boolean(row['is_production']) : true,
      vendorId: (row['vendor_id'] as string) || null,
      vendorName: row['vendor_name'] as string | undefined,
      vendorIds: (row['vendor_ids'] as string[]) || [],
      relatedAssetIds: (row['related_asset_ids'] as string[]) || [],
      complianceScope: (row['compliance_scope'] as string[]) || [],
      tags: (row['tags'] as string[]) || [],
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Risks ─────────────────────────────────────────────────────────────────

  async listRisks(orgId: string): Promise<Risk[]> {
    const { data, error } = await this.db
      .from('risks')
      .select('*')
      .eq('org_id', orgId)
      .order('risk_score', { ascending: false });
    return ok(data, error).map((row) => this.toRisk(row));
  }

  async createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    const riskScore = this.computeRiskScore(data.likelihood, data.impact);
    const { data: row, error } = await this.db
      .from('risks')
      .insert({
        org_id: orgId,
        user_id: userId,
        title: data.title,
        description: data.description,
        category: data.category,
        likelihood: data.likelihood,
        impact: data.impact,
        risk_score: riskScore,
        treatment: data.treatment ?? 'mitigate',
        asset_id: data.assetId ?? null,
      })
      .select()
      .single();
    return this.toRisk(ok(row, error));
  }

  async getRisk(id: string): Promise<Risk | null> {
    const { data, error } = await this.db.from('risks').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toRisk(data) : null;
  }

  async updateRisk(id: string, patch: RiskPatch): Promise<Risk> {
    const current = await this.getRisk(id);
    if (!current) throw new Error('risk_not_found');
    const newLikelihood = patch.likelihood ?? current.likelihood;
    const newImpact = patch.impact ?? current.impact;
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      risk_score: this.computeRiskScore(newLikelihood, newImpact),
    };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.category !== undefined) update['category'] = patch.category;
    if (patch.likelihood !== undefined) update['likelihood'] = patch.likelihood;
    if (patch.impact !== undefined) update['impact'] = patch.impact;
    if (patch.treatment !== undefined) update['treatment'] = patch.treatment;
    if ('assetId' in patch) update['asset_id'] = patch.assetId;
    const { data, error } = await this.db
      .from('risks')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toRisk(ok(data, error));
  }

  async deleteRisk(id: string): Promise<void> {
    const { error } = await this.db.from('risks').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toRisk(row: Record<string, unknown>): Risk {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      category: row['category'] as string,
      likelihood: row['likelihood'] as Risk['likelihood'],
      impact: row['impact'] as Risk['impact'],
      riskScore: row['risk_score'] as number,
      treatment: row['treatment'] as Risk['treatment'],
      assetId: row['asset_id'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Risk Assessments ──────────────────────────────────────────────────────

  async listAssessments(orgId: string): Promise<RiskAssessment[]> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map(this.toAssessment);
  }

  async createAssessment(
    orgId: string,
    userId: string,
    data: RiskAssessmentInput,
  ): Promise<RiskAssessment> {
    const { data: row, error } = await this.db
      .from('risk_assessments')
      .insert({
        org_id: orgId,
        user_id: userId,
        type: data.type,
        title: data.title,
        scope: data.scope,
      })
      .select()
      .single();
    return this.toAssessment(ok(row, error));
  }

  async getAssessment(id: string): Promise<RiskAssessment | null> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toAssessment(data) : null;
  }

  async updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.scope !== undefined) update['scope'] = patch.scope;
    if (patch.status !== undefined) update['status'] = patch.status;
    const { data, error } = await this.db
      .from('risk_assessments')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toAssessment(ok(data, error));
  }

  async deleteAssessment(id: string): Promise<void> {
    const { error } = await this.db.from('risk_assessments').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]> {
    const { data, error } = await this.db
      .from('risk_assessment_items')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('item_score', { ascending: false });
    return ok(data, error).map(this.toAssessmentItem);
  }

  async addAssessmentItem(
    assessmentId: string,
    data: RiskAssessmentItemInput,
  ): Promise<RiskAssessmentItem> {
    const itemScore = this.computeRiskScore(data.likelihood, data.impact);
    const { data: row, error } = await this.db
      .from('risk_assessment_items')
      .insert({
        assessment_id: assessmentId,
        subject: data.subject,
        description: data.description,
        likelihood: data.likelihood,
        impact: data.impact,
        item_score: itemScore,
        mitigations: data.mitigations ?? '',
      })
      .select()
      .single();
    const item = this.toAssessmentItem(ok(row, error));
    await this.recomputeAssessmentScore(assessmentId);
    return item;
  }

  async updateAssessmentItem(
    id: string,
    patch: RiskAssessmentItemPatch,
  ): Promise<RiskAssessmentItem> {
    const existing = await this.db
      .from('risk_assessment_items')
      .select('likelihood, impact, assessment_id')
      .eq('id', id)
      .single();
    if (existing.error) throw new Error(existing.error.message);
    const newLikelihood = patch.likelihood ?? (existing.data['likelihood'] as RiskLikelihood);
    const newImpact = patch.impact ?? (existing.data['impact'] as RiskImpact);
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      item_score: this.computeRiskScore(newLikelihood, newImpact),
    };
    if (patch.subject !== undefined) update['subject'] = patch.subject;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.likelihood !== undefined) update['likelihood'] = patch.likelihood;
    if (patch.impact !== undefined) update['impact'] = patch.impact;
    if (patch.mitigations !== undefined) update['mitigations'] = patch.mitigations;
    const { data: row, error } = await this.db
      .from('risk_assessment_items')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    const item = this.toAssessmentItem(ok(row, error));
    await this.recomputeAssessmentScore(existing.data['assessment_id'] as string);
    return item;
  }

  async deleteAssessmentItem(id: string): Promise<void> {
    const { data: existing } = await this.db
      .from('risk_assessment_items')
      .select('assessment_id')
      .eq('id', id)
      .single();
    const { error } = await this.db.from('risk_assessment_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
    if (existing) await this.recomputeAssessmentScore(existing['assessment_id'] as string);
  }

  private async recomputeAssessmentScore(assessmentId: string): Promise<void> {
    const { data: items } = await this.db
      .from('risk_assessment_items')
      .select('item_score')
      .eq('assessment_id', assessmentId);
    const rows = items ?? [];
    const riskScore =
      rows.length > 0
        ? Math.round(
            rows.reduce(
              (s: number, r: Record<string, unknown>) => s + (r['item_score'] as number),
              0,
            ) / rows.length,
          )
        : 0;
    await this.db
      .from('risk_assessments')
      .update({
        risk_score: riskScore,
        item_count: rows.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentId);
  }

  private toAssessment(row: Record<string, unknown>): RiskAssessment {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      type: row['type'] as AssessmentType,
      title: row['title'] as string,
      scope: row['scope'] as string,
      status: row['status'] as AssessmentStatus,
      riskScore: row['risk_score'] as number,
      itemCount: row['item_count'] as number,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private toAssessmentItem(row: Record<string, unknown>): RiskAssessmentItem {
    return {
      id: row['id'] as string,
      assessmentId: row['assessment_id'] as string,
      subject: row['subject'] as string,
      description: row['description'] as string,
      likelihood: row['likelihood'] as RiskAssessmentItem['likelihood'],
      impact: row['impact'] as RiskAssessmentItem['impact'],
      itemScore: row['item_score'] as number,
      mitigations: row['mitigations'] as string,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Policies ──────────────────────────────────────────────────────────────

  async listPolicies(orgId: string): Promise<Policy[]> {
    const { data, error } = await this.db
      .from('policies')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map(this.toPolicy);
  }

  async createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy> {
    const { data: row, error } = await this.db
      .from('policies')
      .insert({
        org_id: orgId,
        user_id: userId,
        framework_id: data.frameworkId,
        title: data.title,
        content: data.content,
        template_id: data.templateId ?? null,
      })
      .select()
      .single();
    return this.toPolicy(ok(row, error));
  }

  async getPolicy(id: string): Promise<Policy | null> {
    const { data, error } = await this.db.from('policies').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toPolicy(data) : null;
  }

  async updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.status !== undefined) update['status'] = patch.status;
    if (patch.content !== undefined) {
      update['content'] = patch.content;
      const cur = await this.db.from('policies').select('version').eq('id', id).single();
      update['version'] = ((cur.data?.['version'] as number) ?? 1) + 1;
    }
    const { data, error } = await this.db
      .from('policies')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toPolicy(ok(data, error));
  }

  async deletePolicy(id: string): Promise<void> {
    const { error } = await this.db.from('policies').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy> {
    const { data: tmpl, error } = await this.db
      .from('policy_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    if (error || !tmpl) throw new Error('template_not_found');
    return this.createPolicy(orgId, userId, {
      frameworkId: tmpl['framework_id'] as string,
      title: tmpl['title'] as string,
      content: tmpl['content'] as string,
      templateId,
    });
  }

  async listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]> {
    let q = this.db.from('policy_templates').select('*').order('title');
    if (frameworkId) q = q.eq('framework_id', frameworkId);
    const { data, error } = await q;
    return ok(data, error).map((r: Record<string, unknown>) => ({
      id: r['id'] as string,
      frameworkId: r['framework_id'] as string,
      title: r['title'] as string,
      content: r['content'] as string,
      createdAt: r['created_at'] as string,
    }));
  }

  async listPolicyControls(policyId: string): Promise<PolicyControl[]> {
    const { data, error } = await this.db
      .from('policy_controls')
      .select('*')
      .eq('policy_id', policyId)
      .order('created_at');
    return ok(data, error).map(this.toPolicyControl);
  }

  async addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl> {
    const { data: row, error } = await this.db
      .from('policy_controls')
      .upsert(
        { policy_id: policyId, control_code: data.controlCode, framework_id: data.frameworkId },
        { onConflict: 'policy_id,control_code,framework_id', ignoreDuplicates: false },
      )
      .select()
      .single();
    return this.toPolicyControl(ok(row, error));
  }

  async removePolicyControl(id: string): Promise<void> {
    const { error } = await this.db.from('policy_controls').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]> {
    const { data, error } = await this.db
      .from('policy_controls')
      .select('policy_id')
      .eq('control_code', controlCode)
      .eq('framework_id', frameworkId);
    const policyIds = ok(data, error).map((r: Record<string, unknown>) => r['policy_id'] as string);
    if (policyIds.length === 0) return [];
    const { data: policies, error: pErr } = await this.db
      .from('policies')
      .select('*')
      .in('id', policyIds);
    return ok(policies, pErr).map(this.toPolicy);
  }

  private toPolicy(row: Record<string, unknown>): Policy {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      frameworkId: row['framework_id'] as string,
      title: row['title'] as string,
      content: row['content'] as string,
      status: row['status'] as Policy['status'],
      version: row['version'] as number,
      templateId: row['template_id'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private toPolicyControl(row: Record<string, unknown>): PolicyControl {
    return {
      id: row['id'] as string,
      policyId: row['policy_id'] as string,
      controlCode: row['control_code'] as string,
      frameworkId: row['framework_id'] as string,
      createdAt: row['created_at'] as string,
    };
  }
}
