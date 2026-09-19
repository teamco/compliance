import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseNotesStrategy } from '../supabase-notes.strategy';

type Row = Record<string, unknown>;

function createMockNotesDb(tables: { controls: Row[]; org_requirement_status: Row[] }) {
  function builder(rows: Row[]) {
    let filtered = rows;
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return chain;
      },
      in: (col: string, vals: unknown[]) => {
        filtered = filtered.filter((r) => vals.includes(r[col] as never));
        return chain;
      },
      order: () => chain,
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: filtered, error: null }).then(resolve),
    };
    return chain;
  }

  return {
    from: (table: 'controls' | 'org_requirement_status') => {
      const rows = tables[table];
      return {
        ...builder(rows),
        upsert: (row: Row, opts: { onConflict: string }) => {
          const keys = opts.onConflict.split(',');
          const idx = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
          if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
          else rows.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
}

const CONTROL_A: Row = {
  id: 'ctrl-1',
  framework_id: 'fw-1',
  code: 'GV.PO-01',
  title: 'Policy established',
  description: 'Organizational policy is established.',
  category: 'Governance',
  category_code: 'GV.PO',
  function_code: 'GV',
  function_name: 'GOVERN',
  guidance: 'Document and publish the policy.',
  informative_references: ['ISO 27001 A.5.1'],
  cross_framework_mappings: [],
};

describe('SupabaseNotesStrategy.listRequirements', () => {
  it('returns catalog defaults when the org has no override row', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    const result = await strategy.listRequirements('fw-1', 'org-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'ctrl-1',
      code: 'GV.PO-01',
      functionCode: 'GV',
      applicability: 'not_determined',
      implementationStatus: 'not_implemented',
    });
  });

  it('merges the org override row over the catalog defaults', async () => {
    const db = createMockNotesDb({
      controls: [CONTROL_A],
      org_requirement_status: [
        {
          org_id: 'org-1',
          control_id: 'ctrl-1',
          applicability: 'applicable',
          applicability_rationale: 'Required by SOC 2.',
          not_applicable_reason: '',
          scope_business_units: ['Engineering'],
          scope_systems: [],
          scope_locations: [],
          scope_legal_entities: [],
          implementation_status: 'implemented',
          implementation_description: 'Policy published on the intranet.',
          control_owner: 'CISO',
          control_operator: 'SecOps',
          review_frequency: 'Annual',
          last_assessed: null,
          next_assessment: null,
        },
      ],
    });
    const strategy = new SupabaseNotesStrategy(db);

    const result = await strategy.listRequirements('fw-1', 'org-1');

    expect(result[0]).toMatchObject({
      applicability: 'applicable',
      applicabilityRationale: 'Required by SOC 2.',
      implementationStatus: 'implemented',
      controlOwner: 'CISO',
    });
  });
});

describe('SupabaseNotesStrategy.getRequirement', () => {
  it('finds a requirement by code within a framework', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    const result = await strategy.getRequirement('fw-1', 'GV.PO-01', 'org-1');

    expect(result?.id).toBe('ctrl-1');
  });

  it('returns null for an unknown requirement', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    const result = await strategy.getRequirement('fw-1', 'does-not-exist', 'org-1');

    expect(result).toBeNull();
  });
});

describe('SupabaseNotesStrategy.updateRequirement', () => {
  it('persists the patch so a later read reflects it', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    await strategy.updateRequirement('fw-1', 'ctrl-1', 'org-1', {
      applicability: 'applicable',
      implementationStatus: 'implemented',
      controlOwner: 'CISO',
    });
    const reread = await strategy.getRequirement('fw-1', 'ctrl-1', 'org-1');

    expect(reread).toMatchObject({
      applicability: 'applicable',
      implementationStatus: 'implemented',
      controlOwner: 'CISO',
    });
  });

  it("applying a second patch does not lose the first patch's other fields", async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    await strategy.updateRequirement('fw-1', 'ctrl-1', 'org-1', { controlOwner: 'CISO' });
    await strategy.updateRequirement('fw-1', 'ctrl-1', 'org-1', {
      implementationStatus: 'implemented',
    });
    const reread = await strategy.getRequirement('fw-1', 'ctrl-1', 'org-1');

    expect(reread).toMatchObject({
      controlOwner: 'CISO',
      implementationStatus: 'implemented',
    });
  });

  it('throws requirement_not_found for an unknown requirement', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    await expect(strategy.updateRequirement('fw-1', 'does-not-exist', 'org-1', {})).rejects.toThrow(
      'requirement_not_found',
    );
  });
});
