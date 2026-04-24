const crypto = require('crypto');

function hashIdentity(parts) {
  return crypto.createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

function computeSnapshotId({ snapshotDate, localityCode, storeNameRaw, productCode, categoryCode }) {
  return hashIdentity([
    snapshotDate,
    localityCode,
    storeNameRaw,
    productCode,
    categoryCode,
  ]);
}

function computeSourceProductId({ localityCode, storeNameRaw, productCode, categoryCode }) {
  return hashIdentity([
    localityCode,
    storeNameRaw,
    productCode,
    categoryCode,
  ]);
}

module.exports = {
  computeSnapshotId,
  computeSourceProductId,
  hashIdentity,
};
