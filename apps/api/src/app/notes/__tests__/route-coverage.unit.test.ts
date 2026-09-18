import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every route in notes.controller.ts must either call one of the org-access
 * helpers (checkOrgAccess, or the stricter owner-only checkOrgOwner) or be
 * listed here with a reason it's legitimately exempt. Verified live during
 * Notes Gateway Hardening Phase 1-3 (PRs #58, #63, and this one) — do not add
 * an entry without confirming the reason still holds (re-read the route).
 */
const EXEMPT_ROUTES: Record<string, string> = {
  "Get 'frameworks'": 'Platform-wide catalog; Supabase strategy applies no org filter',
  "Get 'frameworks/:id'": 'Platform-wide catalog; Supabase strategy applies no org filter',
  "Get 'frameworks/:id/requirements'":
    'Platform-wide catalog; Supabase strategy applies no org filter',
  "Get 'frameworks/:id/requirements/:reqId'":
    'Platform-wide catalog; Supabase strategy applies no org filter',
  "Get 'frameworks/:id/controls'":
    'Catalog controls table, no org column, no org filter in the query',
  "Get 'orgs'": "Filtered server-side by the caller's own uid, nothing attacker-controlled",
  "Post 'orgs'": 'Creates an org owned by uid(req); no existing org to check access against yet',
  "Post 'exceptions/:id/renewals'": 'Hand-rolled: exception.ownerId !== userId check',
  "Get 'exceptions/:id/renewals'":
    'Hand-rolled: org.userId or isPartyToException (owner/requester/reviewer) check',
  "Post 'issues/:id/submit-for-validation'": 'Hand-rolled: issue.ownerId !== userId check',
  "Post 'issue-validations/:id/review'":
    'Strategy layer enforces validatorId match (supabase-notes.strategy.ts)',
  "Get 'issues/:id/validations'":
    'Hand-rolled: org.userId or isPartyToIssue (owner/requester/validator) check',
  "Post 'risk-acceptances/:id/review'": 'Strategy layer: assertCanDecideRiskAcceptance',
  "Post 'risk-acceptances/:id/approve'": 'Strategy layer: assertCanDecideRiskAcceptance',
  "Post 'risk-acceptances/:id/reject'": 'Strategy layer: assertCanDecideRiskAcceptance',
  "Post 'assessments/:id/approve'":
    'Strategy layer: self-approval-forbidden + approverId match checks',
  "Post 'assessments/:id/request-changes'":
    'Strategy layer: self-approval-forbidden + approverId match checks',
  "Get 'policy-templates'": 'policy_templates table has no org column',
};

const ROUTE_DECORATOR_RE = /^\s*@(Get|Post|Patch|Put|Delete)\((.*)\)\s*$/;

const ORG_CHECK_HELPERS = ['checkOrgAccess(', 'checkOrgOwner(', 'checkOrgManage('];

interface RouteChunk {
  key: string;
  body: string;
}

function extractRouteChunks(source: string): RouteChunk[] {
  const lines = source.split('\n');
  const decorators: { idx: number; key: string }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(ROUTE_DECORATOR_RE);
    if (m) decorators.push({ idx: i, key: `${m[1]} ${m[2]}` });
  });
  return decorators.map((d, k) => {
    const start = d.idx;
    const end = k + 1 < decorators.length ? decorators[k + 1].idx : lines.length;
    return { key: d.key, body: lines.slice(start, end).join('\n') };
  });
}

describe('notes.controller.ts route coverage', () => {
  const source = readFileSync(join(__dirname, '..', 'notes.controller.ts'), 'utf8');
  const chunks = extractRouteChunks(source);

  it('finds routes to check (sanity guard against a broken parser)', () => {
    expect(chunks.length).toBeGreaterThan(100);
  });

  it('every route either calls an org-access helper or is in the exemption allowlist', () => {
    const violations = chunks
      .filter((c) => !ORG_CHECK_HELPERS.some((helper) => c.body.includes(helper)))
      .filter((c) => !(c.key in EXEMPT_ROUTES))
      .map((c) => c.key);

    expect(violations).toEqual([]);
  });

  it('every exemption allowlist entry still corresponds to a real route', () => {
    const routeKeys = new Set(chunks.map((c) => c.key));
    const stale = Object.keys(EXEMPT_ROUTES).filter((k) => !routeKeys.has(k));

    expect(stale).toEqual([]);
  });
});
