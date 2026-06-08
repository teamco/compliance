import type { GapAnalysis } from '@/queries/gap';
import type { StandardsDocument } from '@/queries/notes';
import { downloadText, dateStamp } from './download';

// Quote a field per RFC 4180 — wrap in quotes and double any inner quotes.
function cell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function exportGapCsv(gap: GapAnalysis): void {
  const r = gap.result;
  const rows: unknown[][] = [
    ['Type', 'Reference', 'Severity / Effort', 'Detail'],
    ['Summary', '', `Risk score: ${r.riskScore}`, r.summary],
    ...r.criticalGaps.map((g) => ['Gap', g.controlId, g.severity, g.description]),
    ...r.recommendations.map((rec) => [
      'Recommendation',
      `#${rec.priority}`,
      rec.effort,
      rec.action,
    ]),
  ];
  downloadText(toCsv(rows), `gap-analysis-${dateStamp(gap.createdAt)}.csv`, 'text/csv');
}

export function exportStandardsCsv(
  doc: StandardsDocument,
  frameworks: { id: string; name: string }[],
): void {
  const fwName = (id: string) => frameworks.find((f) => f.id === id)?.name ?? id;
  const rows: unknown[][] = [
    ['Framework', 'Code', 'Title', 'Priority', 'Category', 'Implementation'],
    ...doc.controls.map((c) => [
      c.frameworkMappings.map((m) => fwName(m.frameworkId)).join('; '),
      c.code,
      c.title,
      c.priority,
      c.category,
      c.implementation,
    ]),
  ];
  downloadText(toCsv(rows), `standards-${dateStamp(doc.createdAt)}.csv`, 'text/csv');
}
