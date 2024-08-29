import bun from 'bun';
import cassandra from 'cassandra-driver';
import dotenv from 'dotenv';

dotenv.config();

bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/connect') {
      return connectToScylla();
    }
    return new Response(null, { status: 404 });
  },
});

let client: cassandra.Client; // Store the client globally

async function connectToScylla() {
  try {
    client = new cassandra.Client({
      contactPoints: [
        "node-0.gce-europe-central-2.383d799e0c48fa30107e.clusters.scylla.cloud",
        "node-1.gce-europe-central-2.383d799e0c48fa30107e.clusters.scylla.cloud",
        "node-2.gce-europe-central-2.383d799e0c48fa30107e.clusters.scylla.cloud"
      ],
      localDataCenter: 'GCE_EUROPE_CENTRAL_2',
      credentials: {
        username: process.env.SCYLLA_USERNAME as string,
        password: process.env.SCYLLA_PASSWORD as string,
      },
      keyspace: 'blackmessagesDS' // Specify your keyspace
    });
    await client.connect();
    return new Response('Connected to ScyllaDB', { status: 200 });
  } catch (error) {
    return new Response('Failed to connect', { status: 500 });
  }
}

console.log('Server running on http://localhost:3000');
