const { StringDecoder } = require('node:string_decoder');

const DELIMITER_CANDIDATES = Object.freeze([',', ';', '\t', '|']);

async function* parseDelimitedStream(readable, {
  delimiter = null,
  encoding = 'utf8',
  onDiagnostics = null,
} = {}) {
  const decoder = new StringDecoder(encoding);
  let headers = null;
  let rawHeaderLine = null;
  let selectedDelimiter = delimiter;
  let diagnosticsSent = false;
  const previewRows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let pendingQuote = false;
  let afterClosingQuote = false;
  let skipNextLf = false;
  let rowNumber = 1;
  let rowMalformedReasons = [];

  const flushCell = () => {
    row.push(cell);
    cell = '';
    afterClosingQuote = false;
  };

  const markMalformed = (reason) => {
    if (!rowMalformedReasons.includes(reason)) {
      rowMalformedReasons.push(reason);
    }
  };

  const flushRow = () => {
    flushCell();
    const normalized = row.map((value) => value);
    const malformedReasons = rowMalformedReasons;
    row = [];
    rowMalformedReasons = [];

    if (normalized.length === 1 && normalized[0] === '' && headers) {
      return null;
    }

    if (!headers) {
      rawHeaderLine = buildRawHeaderLine(normalized, selectedDelimiter);
      selectedDelimiter = selectedDelimiter || detectDelimiterFromColumns(normalized, rawHeaderLine);
      headers = normalizeHeaders(normalized);
      emitDiagnostics();
      return null;
    }

    const record = {};
    headers.forEach((header, index) => {
      record[header] = normalized[index] ?? '';
    });

    rowNumber += 1;
    const parsed = {
      record,
      row_number: rowNumber,
      parse_metadata: {
        column_count: normalized.length,
        expected_column_count: headers.length,
        has_column_count_mismatch: normalized.length !== headers.length,
        malformed_reasons: malformedReasons,
      },
    };
    if (previewRows.length < 3) {
      previewRows.push(parsed);
      emitDiagnostics();
    }
    return parsed;
  };

  const emitDiagnostics = () => {
    if (!onDiagnostics || diagnosticsSent || !headers || previewRows.length < 3) {
      return;
    }

    diagnosticsSent = true;
    onDiagnostics({
      raw_header_line: rawHeaderLine,
      detected_delimiter: selectedDelimiter,
      parsed_headers: [...headers],
      first_rows: previewRows.map((rowEntry) => ({
        row_number: rowEntry.row_number,
        record: { ...rowEntry.record },
      })),
    });
  };

  for await (const chunk of readable) {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (skipNextLf) {
        skipNextLf = false;
        if (char === '\n') {
          continue;
        }
      }

      if (pendingQuote) {
        if (char === '"') {
          cell += '"';
          pendingQuote = false;
          afterClosingQuote = false;
          continue;
        }

        inQuotes = false;
        pendingQuote = false;
        afterClosingQuote = true;
      }

      if (afterClosingQuote) {
        if (!inQuotes && char === selectedDelimiter) {
          flushCell();
          continue;
        }

        if (!inQuotes && (char === '\n' || char === '\r')) {
          if (char === '\r') {
            skipNextLf = true;
          }

          const parsed = flushRow();
          if (parsed) {
            yield parsed;
          }
          continue;
        }

        if (/\s/u.test(char)) {
          continue;
        }

        markMalformed(char === '"' ? 'quote_after_closing_quote' : 'text_after_closing_quote');
        afterClosingQuote = false;
      }

      if (char === '"') {
        if (inQuotes) {
          pendingQuote = true;
        } else {
          inQuotes = true;
        }
        continue;
      }

      if (!inQuotes && !headers && !selectedDelimiter && DELIMITER_CANDIDATES.includes(char)) {
        selectedDelimiter = char;
      }

      if (!inQuotes && char === selectedDelimiter) {
        flushCell();
        continue;
      }

      if (!inQuotes && (char === '\n' || char === '\r')) {
        if (char === '\r') {
          skipNextLf = true;
        }

        const parsed = flushRow();
        if (parsed) {
          yield parsed;
        }
        continue;
      }

      cell += char;
    }
  }

  const tail = decoder.end();
  if (tail) {
    cell += tail;
  }

  if (pendingQuote) {
    inQuotes = false;
    pendingQuote = false;
    afterClosingQuote = true;
  }

  if (inQuotes) {
    markMalformed('unclosed_quote');
  }

  if (cell.length > 0 || row.length > 0) {
    const parsed = flushRow();
    if (parsed) {
      yield parsed;
    }
  }

  if (onDiagnostics && !diagnosticsSent && headers) {
    onDiagnostics({
      raw_header_line: rawHeaderLine,
      detected_delimiter: selectedDelimiter,
      parsed_headers: [...headers],
      first_rows: previewRows.map((rowEntry) => ({
        row_number: rowEntry.row_number,
        record: { ...rowEntry.record },
      })),
    });
  }
}

function normalizeHeaders(headers) {
  return headers.map((header) => normalizeHeader(header));
}

function normalizeHeader(header) {
  return String(header || '')
    .replace(/^\uFEFF/u, '')
    .trim()
    .replace(/\s+/gu, ' ');
}

function buildRawHeaderLine(columns, delimiter) {
  const joinDelimiter = delimiter || ',';
  return columns.join(joinDelimiter);
}

function detectDelimiterFromColumns(columns, rawHeaderLine) {
  if (columns.length > 1) {
    return inferDelimiterFromRawHeader(rawHeaderLine);
  }

  return inferDelimiterFromRawHeader(rawHeaderLine);
}

function inferDelimiterFromRawHeader(rawHeaderLine) {
  const line = String(rawHeaderLine || '');
  let bestDelimiter = ',';
  let bestCount = -1;

  DELIMITER_CANDIDATES.forEach((candidate) => {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = candidate;
    }
  });

  return bestDelimiter;
}

module.exports = {
  normalizeHeader,
  parseDelimitedStream,
};
