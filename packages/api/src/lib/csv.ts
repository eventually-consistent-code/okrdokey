/**
 * Purpose: Hand-rolled RFC 4180 CSV — emit anything, parse the strict
 *          subset we document (quoted fields with embedded commas and
 *          quotes: yes; embedded newlines inside fields: no). One import
 *          format, one parser, loud errors — a dep can move in when the
 *          format outgrows this.
 * Author(s): John Reed
 */

// Emit

function escapeField(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

/**
 * Rows → CSV text with a header row. Values are escaped per RFC 4180.
 *
 * :param header: column names, emitted first
 * :param rows: data rows, same order as header
 * :returns CSV string, \n line endings, trailing newline
 */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header.map(escapeField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeField).join(','));
  }
  return `${lines.join('\n')}\n`;
}

// Parse (strict subset)

export interface CsvParseError {
  line: number; // 1-based, header = line 1
  message: string;
}

/**
 * Parse one CSV line into fields. Supports quoted fields with embedded
 * commas and doubled quotes. Embedded newlines never reach here — the
 * caller splits on newlines first (the documented restriction).
 *
 * :param line: one physical line
 * :returns fields, or null when quoting is malformed
 */
function parseLine(line: string): string[] | null {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      // quoted field
      let val = '';
      i += 1;
      for (;;) {
        if (i >= line.length) return null; // unterminated quote
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i += 1;
            break;
          }
        } else {
          val += line[i];
          i += 1;
        }
      }
      if (i < line.length && line[i] !== ',') return null; // junk after closing quote
      fields.push(val);
      i += 1;
    } else {
      const comma = line.indexOf(',', i);
      if (comma === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, comma));
      i = comma + 1;
      if (i === line.length) {
        fields.push(''); // trailing comma = trailing empty field
        break;
      }
    }
  }
  return fields;
}

export interface CsvRecord {
  line: number;
  fields: Record<string, string>;
}

/**
 * Parse CSV text into records keyed by the header row. Each record
 * remembers its physical line for error reporting.
 *
 * :param text: full CSV document
 * :param expectedColumns: exact header the document must carry
 * :returns records + per-line errors (malformed lines are skipped)
 */
export function parseCsv(
  text: string,
  expectedColumns: string[],
): { records: CsvRecord[]; errors: CsvParseError[] } {
  const errors: CsvParseError[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l, idx) => ({ l, n: idx + 1 }))
    .filter(({ l }) => l.trim() !== '');

  const first = lines.shift();
  if (!first) {
    return { records: [], errors: [{ line: 1, message: 'empty document' }] };
  }
  const header = parseLine(first.l);
  if (!header || header.join(',') !== expectedColumns.join(',')) {
    return {
      records: [],
      errors: [
        { line: first.n, message: `header must be exactly: ${expectedColumns.join(',')}` },
      ],
    };
  }

  const records: CsvRecord[] = [];
  for (const { l, n } of lines) {
    const fields = parseLine(l);
    if (!fields) {
      errors.push({ line: n, message: 'malformed quoting (embedded newlines are not supported)' });
      continue;
    }
    if (fields.length !== expectedColumns.length) {
      errors.push({
        line: n,
        message: `expected ${expectedColumns.length} columns, got ${fields.length}`,
      });
      continue;
    }
    const rec: Record<string, string> = {};
    expectedColumns.forEach((c, idx) => {
      rec[c] = fields[idx] ?? '';
    });
    records.push({ line: n, fields: rec });
  }
  return { records, errors };
}
