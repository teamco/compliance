import type {
  Framework,
  FrameworkControl,
  NotesStrategy,
  Organization,
  OrganizationInput,
  StandardControl,
  StandardsDocument,
} from '../notes';

export class FakeNotesStrategy implements NotesStrategy {
  private frameworks = new Map<string, Framework>();
  private controls = new Map<string, FrameworkControl>();
  private orgs = new Map<string, Organization>(); // key = userId
  private docs = new Map<string, StandardsDocument>(); // key = id

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
}
