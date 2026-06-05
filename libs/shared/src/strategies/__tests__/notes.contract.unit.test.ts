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

    it('getOrganization returns null for unknown user', async () => {
      const result = await strategy.getOrganization('unknown-user');
      expect(result).toBeNull();
    });

    it('upsertOrganization creates and retrieves org', async () => {
      const data = {
        name: 'Acme',
        industry: 'technology',
        size: 'startup' as const,
        regions: ['us'],
        techStack: ['react'],
        regulations: ['gdpr'],
      };
      const org = await strategy.upsertOrganization('user-1', data);
      expect(org.name).toBe('Acme');
      expect(org.userId).toBe('user-1');

      const fetched = await strategy.getOrganization('user-1');
      expect(fetched?.name).toBe('Acme');
    });

    it('upsertOrganization updates existing org', async () => {
      const base = {
        name: 'Old',
        industry: 'technology',
        size: 'startup' as const,
        regions: [],
        techStack: [],
        regulations: [],
      };
      await strategy.upsertOrganization('user-2', base);
      await strategy.upsertOrganization('user-2', { ...base, name: 'New' });
      const fetched = await strategy.getOrganization('user-2');
      expect(fetched?.name).toBe('New');
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
