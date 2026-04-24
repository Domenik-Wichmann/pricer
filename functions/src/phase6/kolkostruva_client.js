const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const yauzl = require('yauzl');

const {
  DEFAULT_KOLKOSTRUVA_BASE_URL,
  DEFAULT_LOOKBACK_DAYS,
} = require('./constants');

const DEFAULT_SUPPORTED_EXTENSIONS = Object.freeze(['.csv', '.txt', '.tsv']);

function buildSnapshotZipUrl({
  snapshotDate,
  baseUrl = DEFAULT_KOLKOSTRUVA_BASE_URL,
}) {
  return `${baseUrl.replace(/\/$/, '')}/${snapshotDate}.zip`;
}

async function resolveLatestAvailableSnapshotDate({
  today = new Date(),
  fetchImpl = fetch,
  baseUrl = DEFAULT_KOLKOSTRUVA_BASE_URL,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
}) {
  for (let offset = 0; offset < lookbackDays; offset += 1) {
    const candidateDate = formatDate(addDays(today, -offset));
    const url = buildSnapshotZipUrl({
      snapshotDate: candidateDate,
      baseUrl,
    });

    const response = await fetchImpl(url, {
      method: 'HEAD',
    });

    if (response.ok) {
      return {
        snapshot_date: candidateDate,
        url,
      };
    }
  }

  return null;
}

async function downloadSnapshotZip({
  snapshotDate,
  outputDir,
  fetchImpl = fetch,
  baseUrl = DEFAULT_KOLKOSTRUVA_BASE_URL,
}) {
  const url = buildSnapshotZipUrl({
    snapshotDate,
    baseUrl,
  });
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`snapshot download failed with status ${response.status}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${snapshotDate}.zip`);
  const writeStream = fs.createWriteStream(filePath);
  await pipeline(response.body, writeStream);

  return {
    url,
    file_path: filePath,
    snapshot_date: snapshotDate,
  };
}

function openSnapshotEntryStream({
  zipFilePath,
  preferredExtensions = DEFAULT_SUPPORTED_EXTENSIONS,
}) {
  return listSnapshotEntries({
    zipFilePath,
    preferredExtensions,
  }).then((entries) => {
    if (entries.length === 0) {
      throw new Error('no supported data file found inside snapshot zip');
    }

    return openSnapshotEntryStreamByName({
      zipFilePath,
      entryName: entries[0],
    });
  });
}

function listSnapshotEntries({
  zipFilePath,
  preferredExtensions = DEFAULT_SUPPORTED_EXTENSIONS,
}) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFilePath, {
      lazyEntries: true,
      autoClose: true,
    }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      const entries = [];

      zipFile.readEntry();
      zipFile.on('entry', (entry) => {
        if (isSupportedSnapshotEntry(entry, preferredExtensions)) {
          entries.push(entry.fileName);
        }

        zipFile.readEntry();
      });

      zipFile.on('end', () => {
        resolve(entries);
      });

      zipFile.on('error', (zipError) => {
        reject(zipError);
      });
    });
  });
}

function openSnapshotEntryStreamByName({
  zipFilePath,
  entryName,
}) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFilePath, {
      lazyEntries: true,
      autoClose: false,
    }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      let settled = false;

      const closeZip = () => {
        if (zipFile.isOpen) {
          zipFile.close();
        }
      };

      const rejectOnce = (error) => {
        if (settled) {
          return;
        }

        settled = true;
        closeZip();
        reject(error);
      };

      zipFile.readEntry();
      zipFile.on('entry', (entry) => {
        if (settled) {
          return;
        }

        if (entry.fileName !== entryName) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError) {
            rejectOnce(streamError);
            return;
          }

          settled = true;
          readStream.on('end', closeZip);
          readStream.on('error', closeZip);

          resolve({
            entry_name: entry.fileName,
            stream: readStream,
          });
        });
      });

      zipFile.on('end', () => {
        rejectOnce(new Error(`entry "${entryName}" was not found inside snapshot zip`));
      });

      zipFile.on('error', rejectOnce);
    });
  });
}

function isSupportedSnapshotEntry(entry, preferredExtensions) {
  if (/\/$/u.test(entry.fileName)) {
    return false;
  }

  const lowerName = entry.fileName.toLowerCase();
  return preferredExtensions.some((extension) => lowerName.endsWith(extension));
}

function parseSnapshotEntryMetadata(fileName) {
  const sourceFileNameRaw = typeof fileName === 'string' && fileName.trim() ?
    path.basename(fileName.trim()) :
    null;
  const parsedPath = sourceFileNameRaw ? path.parse(sourceFileNameRaw) : { name: '', ext: '' };
  const sourceFileStem = parsedPath.name || null;
  const metadata = {
    source_file_name_raw: sourceFileNameRaw,
    source_file_stem: sourceFileStem,
    source_chain_name_raw: null,
    source_chain_name_normalized: null,
    source_file_numeric_id: null,
  };

  if (!sourceFileStem) {
    return metadata;
  }

  const matchedSuffix = sourceFileStem.match(/^(.*)_(\d+)$/u);
  if (!matchedSuffix) {
    return metadata;
  }

  const sourceChainNameRaw = matchedSuffix[1].trim();
  const sourceFileNumericId = matchedSuffix[2];
  if (!sourceChainNameRaw) {
    return metadata;
  }

  return {
    ...metadata,
    source_chain_name_raw: sourceChainNameRaw,
    source_chain_name_normalized: normalizeSourceChainName(sourceChainNameRaw),
    source_file_numeric_id: sourceFileNumericId,
  };
}

function normalizeSourceChainName(chainName) {
  if (typeof chainName !== 'string' || !chainName.trim()) {
    return null;
  }

  return chainName
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('bg-BG');
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = {
  buildSnapshotZipUrl,
  downloadSnapshotZip,
  listSnapshotEntries,
  openSnapshotEntryStreamByName,
  openSnapshotEntryStream,
  parseSnapshotEntryMetadata,
  resolveLatestAvailableSnapshotDate,
};
