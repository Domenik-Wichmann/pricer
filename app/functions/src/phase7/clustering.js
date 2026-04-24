const crypto = require('node:crypto');

const { generateDeterministicEmbedding } = require('../phase3/embedding_generator');
const { tokenizeInput } = require('../phase2/normalize');

const DEMAND_EMBEDDING_MODEL = 'phase7-demand-hash-v1';

async function rebuildDemandEmbeddings({
  store,
  generatedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  const aggregates = state.demand_aggregates || [];

  state.demand_embeddings = aggregates.map((aggregate) => {
    const vector = generateDemandEmbedding(aggregate.normalized_query);
    return {
      demand_key: aggregate.demand_key,
      embedding_model: DEMAND_EMBEDDING_MODEL,
      embedding_dimensions: vector.length,
      embedding_text: aggregate.normalized_query,
      embedding_vector_json: JSON.stringify(vector),
      generated_at: generatedAt,
    };
  });

  await store.save(state);
  return {
    embedding_count: state.demand_embeddings.length,
  };
}

async function rebuildDemandClusters({
  store,
  similarityThreshold = 0.72,
  generatedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  const aggregates = (state.demand_aggregates || []).map((aggregate) => ({
    ...aggregate,
    _vector: findAggregateVector({
      demandKey: aggregate.demand_key,
      demandEmbeddings: state.demand_embeddings || [],
      normalizedQuery: aggregate.normalized_query,
    }),
  }));
  const clusters = [];

  aggregates
    .sort((left, right) => {
      if (right.frequency !== left.frequency) {
        return right.frequency - left.frequency;
      }

      return left.normalized_query.localeCompare(right.normalized_query);
    })
    .forEach((aggregate) => {
      const bestCluster = findBestCluster({
        aggregate,
        clusters,
        similarityThreshold,
      });

      if (bestCluster) {
        bestCluster.members.push(aggregate);
        if (aggregate.frequency > bestCluster.representative.frequency) {
          bestCluster.representative = aggregate;
          bestCluster.vector = aggregate._vector;
        }
        return;
      }

      clusters.push({
        locality_code: aggregate.locality_code || null,
        city: aggregate.city || null,
        representative: aggregate,
        vector: aggregate._vector,
        members: [aggregate],
      });
    });

  const clusterRows = clusters.map((cluster) => buildClusterRow({
    cluster,
    generatedAt,
  }));
  const clusterIdByDemandKey = new Map();
  clusterRows.forEach((cluster) => {
    JSON.parse(cluster.member_demand_keys_json).forEach((demandKey) => {
      clusterIdByDemandKey.set(demandKey, cluster.cluster_id);
    });
  });

  state.demand_clusters = clusterRows;
  state.demand_aggregates = (state.demand_aggregates || []).map((aggregate) => ({
    ...aggregate,
    cluster_id: clusterIdByDemandKey.get(aggregate.demand_key) || null,
  }));
  await store.save(state);

  return {
    cluster_count: clusterRows.length,
    clustered_aggregate_count: state.demand_aggregates.length,
  };
}

function generateDemandEmbedding(text, dimensions = 8) {
  const tokens = tokenizeInput(text);
  const tokenInputs = tokens.length > 0 ? tokens : [text];
  const vectors = tokenInputs.map((token) => generateDeterministicEmbedding(token, dimensions));
  const averaged = new Array(dimensions).fill(0);

  vectors.forEach((vector) => {
    vector.forEach((value, index) => {
      averaged[index] += value;
    });
  });

  return averaged.map((value) => Number((value / vectors.length).toFixed(6)));
}

function findAggregateVector({
  demandKey,
  demandEmbeddings,
  normalizedQuery,
}) {
  const existing = demandEmbeddings.find((row) => row.demand_key === demandKey);
  if (existing) {
    return JSON.parse(existing.embedding_vector_json);
  }

  return generateDemandEmbedding(normalizedQuery);
}

function findBestCluster({
  aggregate,
  clusters,
  similarityThreshold,
}) {
  let bestCluster = null;
  let bestScore = -1;

  clusters.forEach((cluster) => {
    if ((cluster.locality_code || null) !== (aggregate.locality_code || null)) {
      return;
    }

    if ((cluster.city || null) !== (aggregate.city || null)) {
      return;
    }

    const score = cosineSimilarity(cluster.vector, aggregate._vector);
    if (score >= similarityThreshold && score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
    }
  });

  return bestCluster;
}

function buildClusterRow({
  cluster,
  generatedAt,
}) {
  const memberDemandKeys = cluster.members.map((member) => member.demand_key).sort();
  const memberQueries = cluster.members
    .map((member) => member.normalized_query)
    .sort();
  const totalFrequency = cluster.members.reduce((sum, member) => sum + member.frequency, 0);
  const clusterId = crypto.createHash('sha256')
    .update(memberDemandKeys.join('|'))
    .digest('hex');

  return {
    cluster_id: clusterId,
    locality_code: cluster.locality_code,
    city: cluster.city,
    representative_query: cluster.representative.normalized_query,
    cluster_label: cluster.representative.sample_raw_query,
    aggregate_count: cluster.members.length,
    total_frequency: totalFrequency,
    member_demand_keys_json: JSON.stringify(memberDemandKeys),
    member_queries_json: JSON.stringify(memberQueries),
    embedding_model: DEMAND_EMBEDDING_MODEL,
    embedding_vector_json: JSON.stringify(cluster.vector),
    updated_at: generatedAt,
  };
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

module.exports = {
  DEMAND_EMBEDDING_MODEL,
  generateDemandEmbedding,
  rebuildDemandClusters,
  rebuildDemandEmbeddings,
};
