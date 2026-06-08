// Triggers a browser download for an in-memory blob.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

// YYYY-MM-DD for filenames.
export function dateStamp(iso?: string): string {
  return (iso ? new Date(iso) : new Date()).toISOString().slice(0, 10);
}
