import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type {
  Framework,
  FrameworkControl,
  NotesStrategy,
  Organization,
  OrganizationInput,
  StandardControl,
  StandardsDocument,
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

  @MessagePattern('notes.org.get')
  getOrganization(@Payload() payload: { userId: string }): Promise<Organization | null> {
    return this.strategy.getOrganization(payload.userId);
  }

  @MessagePattern('notes.org.upsert')
  upsertOrganization(
    @Payload() payload: { userId: string; data: OrganizationInput },
  ): Promise<Organization> {
    return this.strategy.upsertOrganization(payload.userId, payload.data);
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
    @Payload() payload: { id: string; controls: StandardControl[] },
  ): Promise<{ ok: boolean }> {
    await this.strategy.saveStandardsDocument(payload.id, payload.controls);
    return { ok: true };
  }

  @MessagePattern('notes.standards.get')
  getStandardsDocument(@Payload() payload: { id: string }): Promise<StandardsDocument | null> {
    return this.strategy.getStandardsDocument(payload.id);
  }

  @MessagePattern('notes.standards.list')
  listStandardsDocuments(@Payload() payload: { userId: string }): Promise<StandardsDocument[]> {
    return this.strategy.listStandardsDocuments(payload.userId);
  }
}
