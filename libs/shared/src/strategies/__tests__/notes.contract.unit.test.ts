import type { NotesStrategy } from '../notes';

export function runNotesContract(name: string, factory: () => NotesStrategy): void {
  describe(`NotesStrategy contract: ${name}`, () => {
    let strategy: NotesStrategy;

    beforeEach(() => {
      strategy = factory();
    });

    // ── Frameworks ──────────────────────────────────────────────────────────

    it('listFrameworks returns an array', async () => {
      const result = await strategy.listFrameworks();
      expect(Array.isArray(result)).toBe(true);
    });

    it('getFramework returns null for unknown id', async () => {
      const result = await strategy.getFramework('nonexistent');
      expect(result).toBeNull();
    });

    it('listControlsByFramework returns an array', async () => {
      const result = await strategy.listControlsByFramework('nonexistent');
      expect(Array.isArray(result)).toBe(true);
    });

    // ── Organization ────────────────────────────────────────────────────────

    it('listOrganizations returns empty array for unknown user', async () => {
      const result = await strategy.listOrganizations('unknown-user');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('createOrganization returns org with correct userId and name', async () => {
      const org = await strategy.createOrganization('user-1', {
        name: 'Acme',
        industry: 'technology',
        size: 'startup',
        regions: ['us'],
        techStack: ['react'],
        regulations: ['gdpr'],
      });
      expect(org.name).toBe('Acme');
      expect(org.userId).toBe('user-1');
      expect(typeof org.id).toBe('string');
    });

    it('listOrganizations returns only orgs for that user', async () => {
      const org1 = await strategy.createOrganization('user-a', {
        name: 'Alpha',
        industry: 'technology',
        size: 'startup',
        regions: [],
        techStack: [],
        regulations: [],
      });
      await strategy.createOrganization('user-b', {
        name: 'Beta',
        industry: 'finance',
        size: 'smb',
        regions: [],
        techStack: [],
        regulations: [],
      });
      const orgs = await strategy.listOrganizations('user-a');
      expect(orgs.map((o) => o.id)).toContain(org1.id);
      expect(orgs.every((o) => o.userId === 'user-a')).toBe(true);
    });

    it('getOrganizationById returns null for unknown id', async () => {
      const result = await strategy.getOrganizationById('nonexistent');
      expect(result).toBeNull();
    });

    it('getOrganizationById returns created org', async () => {
      const org = await strategy.createOrganization('user-1', {
        name: 'Acme',
        industry: 'technology',
        size: 'startup',
        regions: [],
        techStack: [],
        regulations: [],
      });
      const fetched = await strategy.getOrganizationById(org.id);
      expect(fetched?.id).toBe(org.id);
      expect(fetched?.name).toBe('Acme');
    });

    it('updateOrganization patches fields and returns updated org', async () => {
      const org = await strategy.createOrganization('user-1', {
        name: 'Old Name',
        industry: 'technology',
        size: 'startup',
        regions: [],
        techStack: [],
        regulations: [],
      });
      const updated = await strategy.updateOrganization(org.id, {
        name: 'New Name',
        industry: 'finance',
        size: 'enterprise',
        regions: ['eu'],
        techStack: ['go'],
        regulations: ['gdpr'],
      });
      expect(updated.name).toBe('New Name');
      expect(updated.size).toBe('enterprise');
    });

    it('updateOrganization throws for unknown org id', async () => {
      await expect(
        strategy.updateOrganization('nonexistent', {
          name: 'X',
          industry: 'technology',
          size: 'startup',
          regions: [],
          techStack: [],
          regulations: [],
        }),
      ).rejects.toThrow();
    });

    it('deleteOrganization removes org from list', async () => {
      const org = await strategy.createOrganization('user-1', {
        name: 'ToDelete',
        industry: 'technology',
        size: 'startup',
        regions: [],
        techStack: [],
        regulations: [],
      });
      await strategy.deleteOrganization(org.id);
      const fetched = await strategy.getOrganizationById(org.id);
      expect(fetched).toBeNull();
    });

    it('deleteOrganization removes org from listOrganizations', async () => {
      const org = await strategy.createOrganization('user-1', {
        name: 'ToDelete',
        industry: 'technology',
        size: 'startup',
        regions: [],
        techStack: [],
        regulations: [],
      });
      await strategy.deleteOrganization(org.id);
      const orgs = await strategy.listOrganizations('user-1');
      expect(orgs.map((o) => o.id)).not.toContain(org.id);
    });

    it('deleteOrganization throws for unknown org id', async () => {
      await expect(strategy.deleteOrganization('nonexistent')).rejects.toThrow();
    });

    // ── Standards documents ──────────────────────────────────────────────────

    it('createStandardsDocument returns an id', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', ['fw-1']);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('getStandardsDocument returns null for unknown id', async () => {
      const result = await strategy.getStandardsDocument('nonexistent');
      expect(result).toBeNull();
    });

    it('saveStandardsDocument persists controls and sets status completed', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', ['fw-1']);
      const controls = [
        {
          code: 'CTRL-001',
          title: 'Access Control',
          description: 'Manage access',
          implementation: 'Use RBAC',
          evidence: [],
          frameworkMappings: [],
          priority: 'high' as const,
          category: 'general',
        },
      ];
      await strategy.saveStandardsDocument(id, controls);
      const doc = await strategy.getStandardsDocument(id);
      expect(doc?.status).toBe('completed');
      expect(doc?.controls).toHaveLength(1);
      expect(doc?.controls[0]?.code).toBe('CTRL-001');
    });

    it('listStandardsDocuments returns only docs for given user', async () => {
      const { id: id1 } = await strategy.createStandardsDocument('user-a', 'org-1', []);
      const { id: id2 } = await strategy.createStandardsDocument('user-b', 'org-1', []);
      const docsA = await strategy.listStandardsDocuments('user-a');
      const docsB = await strategy.listStandardsDocuments('user-b');
      expect(docsA.map((d) => d.id)).toContain(id1);
      expect(docsA.map((d) => d.id)).not.toContain(id2);
      expect(docsB.map((d) => d.id)).toContain(id2);
    });

    // ── updateControl ────────────────────────────────────────────────────────

    it('updateControl patches priority on an existing control', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
      await strategy.saveStandardsDocument(id, [
        {
          code: 'CTRL-001',
          title: 'Access Control',
          description: 'Manage access',
          implementation: 'Use RBAC',
          evidence: [],
          frameworkMappings: [],
          priority: 'high' as const,
          category: 'general',
        },
      ]);
      const updated = await strategy.updateControl(id, 'CTRL-001', { priority: 'critical' });
      expect(updated.priority).toBe('critical');
      const doc = await strategy.getStandardsDocument(id);
      expect(doc?.controls[0]?.priority).toBe('critical');
    });

    it('updateControl patches implementation text', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
      await strategy.saveStandardsDocument(id, [
        {
          code: 'CTRL-002',
          title: 'Encryption',
          description: 'Encrypt at rest',
          implementation: 'old text',
          evidence: [],
          frameworkMappings: [],
          priority: 'medium' as const,
          category: 'security',
        },
      ]);
      const updated = await strategy.updateControl(id, 'CTRL-002', {
        implementation: 'new text',
      });
      expect(updated.implementation).toBe('new text');
    });

    it('updateControl throws for unknown document', async () => {
      await expect(
        strategy.updateControl('nonexistent-doc', 'CTRL-001', { priority: 'low' }),
      ).rejects.toThrow();
    });

    it('updateControl throws for unknown control code', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
      await strategy.saveStandardsDocument(id, []);
      await expect(
        strategy.updateControl(id, 'NO-SUCH-CODE', { priority: 'low' }),
      ).rejects.toThrow();
    });
  });
}
