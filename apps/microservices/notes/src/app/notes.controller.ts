import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type {
  DocumentStandard,
  Framework,
  FrameworkControl,
  GapAnalysis,
  GapAnalysisResult,
  NotesStrategy,
  Organization,
  OrganizationInput,
  ReportTemplate,
  ReportTemplateInput,
  StandardPatch,
  StandardsDocument,
  StandardsSnapshot,
  WorkflowTransition,
} from '@icore/shared';

@Controller()
export class NotesController {
  constructor(@Inject('NotesStrategy') private readonly strategy: NotesStrategy) {}

  @MessagePattern('notes.frameworks.list')
  listFrameworks(): Promise<Framework[]> {
    return this.strategy.listFrameworks();
  }

  @MessagePattern('notes.frameworks.get')
  getFramework(@Payload() payload: { id: string }): Promise<Framework | null> {
    return this.strategy.getFramework(payload.id);
  }

  @MessagePattern('notes.controls.list')
  listControls(@Payload() payload: { frameworkId: string }): Promise<FrameworkControl[]> {
    return this.strategy.listControlsByFramework(payload.frameworkId);
  }

  @MessagePattern('notes.org.list')
  listOrganizations(@Payload() payload: { userId: string }): Promise<Organization[]> {
    return this.strategy.listOrganizations(payload.userId);
  }

  @MessagePattern('notes.org.create')
  createOrganization(
    @Payload() payload: { userId: string; data: OrganizationInput },
  ): Promise<Organization> {
    return this.strategy.createOrganization(payload.userId, payload.data);
  }

  @MessagePattern('notes.org.get-by-id')
  getOrganizationById(@Payload() payload: { orgId: string }): Promise<Organization | null> {
    return this.strategy.getOrganizationById(payload.orgId);
  }

  @MessagePattern('notes.org.update')
  updateOrganization(
    @Payload() payload: { orgId: string; data: OrganizationInput },
  ): Promise<Organization> {
    return this.strategy.updateOrganization(payload.orgId, payload.data);
  }

  @MessagePattern('notes.org.delete')
  deleteOrganization(@Payload() payload: { orgId: string }): Promise<void> {
    return this.strategy.deleteOrganization(payload.orgId);
  }

  @MessagePattern('notes.standards.create')
  createStandardsDocument(
    @Payload() payload: { userId: string; orgId: string; frameworkIds: string[] },
  ): Promise<{ id: string }> {
    return this.strategy.createStandardsDocument(
      payload.userId,
      payload.orgId,
      payload.frameworkIds,
    );
  }

  @MessagePattern('notes.standards.save')
  async saveStandardsDocument(
    @Payload() payload: { id: string; standards: DocumentStandard[] },
  ): Promise<{ ok: boolean }> {
    await this.strategy.saveStandardsDocument(payload.id, payload.standards);
    return { ok: true };
  }

  @MessagePattern('notes.standards.fail')
  async failStandardsDocument(
    @Payload() payload: { id: string; reason?: string },
  ): Promise<{ ok: boolean }> {
    await this.strategy.failStandardsDocument(payload.id, payload.reason);
    return { ok: true };
  }

  @MessagePattern('notes.standards.delete')
  async deleteStandardsDocument(@Payload() payload: { id: string }): Promise<{ ok: boolean }> {
    await this.strategy.deleteStandardsDocument(payload.id);
    return { ok: true };
  }

  @MessagePattern('notes.standards.reset')
  async resetStandardsDocument(@Payload() payload: { id: string }): Promise<{ ok: boolean }> {
    await this.strategy.resetStandardsDocument(payload.id);
    return { ok: true };
  }

  @MessagePattern('notes.standards.get')
  getStandardsDocument(@Payload() payload: { id: string }): Promise<StandardsDocument | null> {
    return this.strategy.getStandardsDocument(payload.id);
  }

  @MessagePattern('notes.standards.list')
  listStandardsDocuments(@Payload() payload: { orgId: string }): Promise<StandardsDocument[]> {
    return this.strategy.listStandardsDocuments(payload.orgId);
  }

  @MessagePattern('notes.standards.workflow')
  transitionWorkflow(
    @Payload() payload: { id: string; transition: WorkflowTransition },
  ): Promise<StandardsDocument> {
    return this.strategy.transitionWorkflow(payload.id, payload.transition);
  }

  @MessagePattern('notes.standards.update-standard')
  updateStandard(
    @Payload() payload: { docId: string; code: string; patch: StandardPatch },
  ): Promise<DocumentStandard> {
    return this.strategy.updateStandard(payload.docId, payload.code, payload.patch);
  }

  @MessagePattern('notes.standards.snapshots.list')
  listSnapshots(@Payload() payload: { documentId: string }): Promise<StandardsSnapshot[]> {
    return this.strategy.listSnapshots(payload.documentId);
  }

  @MessagePattern('notes.standards.snapshots.get')
  getSnapshot(@Payload() payload: { snapshotId: string }): Promise<StandardsSnapshot | null> {
    return this.strategy.getSnapshot(payload.snapshotId);
  }

  @MessagePattern('notes.templates.list')
  listReportTemplates(): Promise<ReportTemplate[]> {
    return this.strategy.listReportTemplates();
  }

  @MessagePattern('notes.templates.create')
  createReportTemplate(
    @Payload() payload: { userId: string; input: ReportTemplateInput },
  ): Promise<ReportTemplate> {
    return this.strategy.createReportTemplate(payload.userId, payload.input);
  }

  @MessagePattern('notes.templates.update')
  updateReportTemplate(
    @Payload() payload: { id: string; patch: Partial<ReportTemplateInput> },
  ): Promise<ReportTemplate> {
    return this.strategy.updateReportTemplate(payload.id, payload.patch);
  }

  @MessagePattern('notes.templates.delete')
  deleteReportTemplate(@Payload() payload: { id: string }): Promise<{ ok: boolean }> {
    return this.strategy.deleteReportTemplate(payload.id);
  }

  @MessagePattern('notes.templates.favorite.add')
  addTemplateFavorite(@Payload() payload: { id: string; orgId: string }): Promise<ReportTemplate> {
    return this.strategy.addTemplateFavorite(payload.id, payload.orgId);
  }

  @MessagePattern('notes.templates.favorite.remove')
  removeTemplateFavorite(
    @Payload() payload: { id: string; orgId: string },
  ): Promise<ReportTemplate> {
    return this.strategy.removeTemplateFavorite(payload.id, payload.orgId);
  }

  @MessagePattern('notes.gap.save')
  saveGapAnalysis(
    @Payload()
    payload: {
      orgId: string;
      userId: string;
      docId: string | null;
      result: GapAnalysisResult;
    },
  ): Promise<GapAnalysis> {
    return this.strategy.saveGapAnalysis(
      payload.orgId,
      payload.userId,
      payload.docId,
      payload.result,
    );
  }

  @MessagePattern('notes.gap.list')
  listGapAnalyses(@Payload() payload: { orgId: string }): Promise<GapAnalysis[]> {
    return this.strategy.listGapAnalyses(payload.orgId);
  }

  @MessagePattern('notes.gap.get')
  getGapAnalysis(@Payload() payload: { id: string }): Promise<GapAnalysis | null> {
    return this.strategy.getGapAnalysis(payload.id);
  }
}
