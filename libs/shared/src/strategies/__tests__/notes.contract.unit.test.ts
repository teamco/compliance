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

    it('saveStandardsDocument persists standards and sets status completed', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', ['fw-1']);
      const standards = [
        {
          code: 'STD-001',
          title: 'Access Control Standard',
          objective: 'Ensure controlled access to systems',
          scope: 'All systems and applications',
          requirements: ['Users must authenticate before accessing systems'],
          frameworkMappings: [],
        },
      ];
      await strategy.saveStandardsDocument(id, standards);
      const doc = await strategy.getStandardsDocument(id);
      expect(doc?.status).toBe('completed');
      expect(doc?.standards).toHaveLength(1);
      expect(doc?.standards[0]?.code).toBe('STD-001');
    });

    it('listStandardsDocuments returns only docs for given org', async () => {
      const { id: id1 } = await strategy.createStandardsDocument('user-a', 'org-1', []);
      const { id: id2 } = await strategy.createStandardsDocument('user-b', 'org-2', []);
      const docs1 = await strategy.listStandardsDocuments('org-1');
      const docs2 = await strategy.listStandardsDocuments('org-2');
      expect(docs1.map((d) => d.id)).toContain(id1);
      expect(docs1.map((d) => d.id)).not.toContain(id2);
      expect(docs2.map((d) => d.id)).toContain(id2);
      expect(docs2.map((d) => d.id)).not.toContain(id1);
    });

    // ── updateStandard ──────────────────────────────────────────────────────────

    it('updateStandard patches objective on an existing standard', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
      await strategy.saveStandardsDocument(id, [
        {
          code: 'STD-001',
          title: 'Access Control Standard',
          objective: 'original objective',
          scope: 'all systems',
          requirements: [],
          frameworkMappings: [],
        },
      ]);
      const updated = await strategy.updateStandard(id, 'STD-001', { objective: 'updated objective' });
      expect(updated.objective).toBe('updated objective');
      const doc = await strategy.getStandardsDocument(id);
      expect(doc?.standards[0]?.objective).toBe('updated objective');
    });

    it('updateStandard patches scope text', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
      await strategy.saveStandardsDocument(id, [
        {
          code: 'STD-002',
          title: 'Encryption Standard',
          objective: 'Protect data at rest',
          scope: 'old scope',
          requirements: [],
          frameworkMappings: [],
        },
      ]);
      const updated = await strategy.updateStandard(id, 'STD-002', { scope: 'new scope' });
      expect(updated.scope).toBe('new scope');
    });

    it('updateStandard throws for unknown document', async () => {
      await expect(
        strategy.updateStandard('nonexistent-doc', 'STD-001', { objective: 'x' }),
      ).rejects.toThrow();
    });

    it('updateStandard throws for unknown standard code', async () => {
      const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
      await strategy.saveStandardsDocument(id, []);
      await expect(
        strategy.updateStandard(id, 'NO-SUCH-CODE', { objective: 'x' }),
      ).rejects.toThrow();
    });
  });
}
