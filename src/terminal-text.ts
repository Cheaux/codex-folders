import stringWidth from 'string-width';

export const clean = (value: string) => value.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Pad or truncate plain text by terminal cells, never splitting a grapheme. */
export function fit(value: string, width: number): string {
  width = Math.max(0, Math.floor(width)); if (!width) return '';
  value = clean(value); if (stringWidth(value) <= width) return value + ' '.repeat(width - stringWidth(value));
  let result = ''; let cells = 0;
  for (const { segment } of segments.segment(value)) {
    const size = stringWidth(segment); if (cells + size > width - 1) break;
    result += segment; cells += size;
  }
  return result + '…' + ' '.repeat(Math.max(0, width - cells - 1));
}
