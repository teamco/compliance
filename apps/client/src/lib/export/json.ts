import type { GapAnalysis } from '@/queries/gap';
import type { StandardsDocument } from '@/queries/notes';
import { downloadText, dateStamp } from './download';

export function exportGapJson(gap: GapAnalysis): void {
  downloadText(
    JSON.stringify(gap, null, 2),
    `gap-analysis-${dateStamp(gap.createdAt)}.json`,
    'application/json',
  );
}

export function exportStandardsJson(doc: StandardsDocument): void {
  downloadText(
    JSON.stringify(doc, null, 2),
    `standards-${dateStamp(doc.createdAt)}.json`,
    'application/json',
  );
}
