const fs = require('fs');
const readline = require('readline');

async function* readCsvRows(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let headers = null;
  let record = '';
  for await (const line of rl) {
    record = record ? `${record}\n${line}` : line;
    if (!isCompleteCsvRecord(record)) {
      continue;
    }

    const values = parseCsvRecord(record);
    record = '';
    if (!headers) {
      headers = values;
      continue;
    }

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] === undefined ? '' : values[index];
    });
    yield row;
  }

  if (record) {
    throw new Error(`Incomplete CSV record at end of file: ${filePath}`);
  }
}

function parseCsvRecord(record) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < record.length; index += 1) {
    const char = record[index];
    const next = record[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function isCompleteCsvRecord(record) {
  let quoteCount = 0;
  for (let index = 0; index < record.length; index += 1) {
    if (record[index] !== '"') {
      continue;
    }
    if (record[index + 1] === '"') {
      index += 1;
      continue;
    }
    quoteCount += 1;
  }
  return quoteCount % 2 === 0;
}

module.exports = {
  isCompleteCsvRecord,
  parseCsvRecord,
  readCsvRows,
};
