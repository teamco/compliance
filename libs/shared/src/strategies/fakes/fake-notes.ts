import type {
  ControlPatch,
  Framework,
  FrameworkControl,
  NotesStrategy,
  Organization,
  OrganizationInput,
  StandardControl,
  StandardsDocument,
  StandardsSnapshot,
  WorkflowTransition,
} from '../notes';
import { WORKFLOW_TRANSITIONS } from '../notes';

export class FakeNotesStrategy implements NotesStrategy {
  private frameworks = new Map<string, Framework>();
  private controls = new Map<string, FrameworkControl>();
  private orgs = new Map<string, Organization>(); // key = userId
  private docs = new Map<string, StandardsDocument>(); // key = id
  private snapshots: StandardsSnapshot[] = [];

  seedFramework(fw: Framework): void {
    this.frameworks.set(fw.id, fw);
  }

  seedControl(c: FrameworkControl): void {
    this.controls.set(c.id, c);
  }

  async listFrameworks(): Promise<Framework[]> {
    return [...this.frameworks.values()];
  }

  async getFramework(id: string): Promise<Framework | null> {
    return this.frameworks.get(id) ?? null;
  }

  async listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]> {
    return [...this.controls.values()].filter((c) => c.frameworkId === frameworkId);
  }

  async upsertOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    const existing = this.orgs.get(userId);
    const now = new Date().toISOString();
    const org: Organization = {
      id: existing?.id ?? globalThis.crypto.randomUUID(),
      userId,
      ...data,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.orgs.set(userId, org);
    return org;
  }

  async getOrganization(userId: string): Promise<Organization | null> {
    return this.orgs.get(userId) ?? null;
  }

  async createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }> {
    const id = globalThis.crypto.randomUUID();
    this.docs.set(id, {
      id,
      userId,
      orgId,
      frameworkIds,
      controls: [],
      status: 'pending',
      workflowStatus: 'draft',
      createdAt: new Date().toISOString(),
    });
    return { id };
  }

  async saveStandardsDocument(id: string, controls: StandardControl[]): Promise<void> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`doc_not_found: ${id}`);
    this.docs.set(id, { ...existing, controls, status: 'completed' });
  }

  async getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    return this.docs.get(id) ?? null;
  }

  async listStandardsDocuments(userId: string): Promise<StandardsDocument[]> {
    return [...this.docs.values()].filter((d) => d.userId === userId);
  }

  async updateControl(docId: string, code: string, patch: ControlPatch): Promise<StandardControl> {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`doc_not_found: ${docId}`);
    const idx = doc.controls.findIndex((c) => c.code === code);
    if (idx === -1) throw new Error(`control_not_found: ${code}`);
    const updated = { ...doc.controls[idx], ...patch } as StandardControl;
    const controls = [...doc.controls];
    controls[idx] = updated;
    this.docs.set(docId, { ...doc, controls });
    return updated;
  }

  async transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument> {
    const doc = this.docs.get(id);
    if (!doc) throw new Error(`doc_not_found: ${id}`);
    const { from, to } = WORKFLOW_TRANSITIONS[transition];
    if (doc.workflowStatus !== from) {
      throw new Error(`invalid_transition: ${doc.workflowStatus} → ${transition}`);
    }
    const updated = { ...doc, workflowStatus: to };
    this.docs.set(id, updated);
    if (transition === 'approve') {
      const version = this.snapshots.filter((s) => s.documentId === id).length + 1;
      this.snapshots.push({
        id: globalThis.crypto.randomUUID(),
        documentId: id,
        version,
        workflowStatus: to,
        controls: [...doc.controls],
        createdAt: new Date().toISOString(),
      });
    }
    return updated;
  }

  async listSnapshots(documentId: string): Promise<StandardsSnapshot[]> {
    return this.snapshots
      .filter((s) => s.documentId === documentId)
      .sort((a, b) => b.version - a.version);
  }

  async getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null> {
    return this.snapshots.find((s) => s.id === snapshotId) ?? null;
  }
}
