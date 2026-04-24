const { syncFirestoreToSQL } = require('./firestore_to_sql');
const { syncFirestoreToVector } = require('./firestore_to_vector');

async function runSyncJobs({ store }) {
  return {
    sql: await syncFirestoreToSQL({ store }),
    vector: await syncFirestoreToVector({ store }),
  };
}

module.exports = {
  runSyncJobs,
};
