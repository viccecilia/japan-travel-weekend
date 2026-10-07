export function policyLocalizationText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(policyLocalizationText).filter(Boolean).join(' / ');
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const preferred = ['title', 'body', 'summary', 'text']
    .map((key) => policyLocalizationText(record[key]))
    .filter(Boolean);
  if (preferred.length) return preferred.join('：');
  return Object.values(record).map(policyLocalizationText).filter(Boolean).join(' / ');
}
