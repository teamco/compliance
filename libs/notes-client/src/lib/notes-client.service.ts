import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type {
  ControlPatch,
  Framework,
  FrameworkControl,
  Organization,
  OrganizationInput,
  StandardControl,
  StandardsDocument,
  StandardsSnapshot,
  WorkflowTransition,
} from '@icore/shared';
import { NOTES_CLIENT } from './notes-client.tokens';

@Injectable()
export class NotesClientService {
  constructor(@Inject(NOTES_CLIENT) private readonly client: ClientProxy) {}

  listFrameworks(): Promise<Framework[]> {
    return firstValueFrom(this.client.send<Framework[]>('notes.frameworks.list', {}));
  }

  getFramework(id: string): Promise<Framework | null> {
    return firstValueFrom(this.client.send<Framework | null>('notes.frameworks.get', { id }));
  }

  listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]> {
    return firstValueFrom(
      this.client.send<FrameworkControl[]>('notes.controls.list', { frameworkId }),
    );
  }

  getOrganization(userId: string): Promise<Organization | null> {
    return firstValueFrom(this.client.send<Organization | null>('notes.org.get', { userId }));
  }

  upsertOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    return firstValueFrom(this.client.send<Organization>('notes.org.upsert', { userId, data }));
  }

  createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }> {
    return firstValueFrom(
      this.client.send<{ id: string }>('notes.standards.create', { userId, orgId, frameworkIds }),
    );
  }

  saveStandardsDocument(id: string, controls: StandardControl[]): Promise<void> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('notes.standards.save', { id, controls }),
    ).then(() => undefined);
  }

  getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    return firstValueFrom(
      this.client.send<StandardsDocument | null>('notes.standards.get', { id }),
    );
  }

  listStandardsDocuments(userId: string): Promise<StandardsDocument[]> {
    return firstValueFrom(
      this.client.send<StandardsDocument[]>('notes.standards.list', { userId }),
    );
  }

  transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument> {
    return firstValueFrom(
      this.client.send<StandardsDocument>('notes.standards.workflow', { id, transition }),
    );
  }

  updateControl(docId: string, code: string, patch: ControlPatch): Promise<StandardControl> {
    return firstValueFrom(
      this.client.send<StandardControl>('notes.standards.update-control', { docId, code, patch }),
    );
  }

  listSnapshots(documentId: string): Promise<StandardsSnapshot[]> {
    return firstValueFrom(
      this.client.send<StandardsSnapshot[]>('notes.standards.snapshots.list', { documentId }),
    );
  }

  getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null> {
    return firstValueFrom(
      this.client.send<StandardsSnapshot | null>('notes.standards.snapshots.get', { snapshotId }),
    );
  }
}
