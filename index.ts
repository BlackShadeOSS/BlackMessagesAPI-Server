import bun from 'bun';
import cassandra from 'cassandra-driver';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto'; // For generating UUIDs

dotenv.config();

let client: cassandra.Client; // Storing the client globally

async function createMessage(sender: string, message: string, timestamp: number, latitude: number, longitude: number) {
  try {
    const query = `
    INSERT INTO messages (sender, message_content, timestamp, latitude, longitude)
    VALUES (?, ?, ?, ?, ?);
  `;

    await client.execute(query, [sender, message, timestamp, latitude, longitude]);
    return new Response('Message sent successfully', { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return new Response('Failed to send message', { status: 500 });
  }
}

function generateRandomUsername(): string {
  const chars = '0123456789!@#$%&';
  let randomString = '';
  for (let i = 0; i < 10; i++) {
    randomString += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'user-' + randomString;
}


async function createUser(pinHash: string) {
  try {
    const username = generateRandomUsername();
    const deviceId = randomUUID(); // Generate a UUID for deviceId

    // Insert the new user
      const userQuery = `
      INSERT INTO users (username, pin_hash, device_id)
      VALUES (?, ?, ?);
    `;
    await client.execute(userQuery, [username, pinHash, deviceId]);

    // Generate and store the initial transaction key
    const transactionKey = randomUUID(); 
    const deviceQuery = `
      INSERT INTO devices (device_id, transaction_key)
      VALUES (?, ?);
    `;
    await client.execute(deviceQuery, [deviceId, transactionKey]);

    return new Response(JSON.stringify({ username, deviceId, transactionKey }), { 
      status: 201,
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return new Response('Failed to create user', { status: 500 });
  }
}


async function loginUser(deviceId: string, pinHash: string) {
  try {
    // Fetch user based on device ID
    const userQuery = 'SELECT * FROM users WHERE device_id = ?';
    const userResult = await client.execute(userQuery, [deviceId]);

    if (userResult.rows.length === 0) {
      return new Response('Invalid device ID or PIN', { status: 401 }); // Unauthorized
    }

    const user = userResult.rows[0];

    // Check if the provided pinHash matches the stored one
    if (user.pin_hash !== pinHash) {
      return new Response('Invalid device ID or PIN', { status: 401 }); // Unauthorized
    }

    // Generate a new transaction key
    const newTransactionKey = randomUUID();

    // Update the transaction key for the device
    const updateQuery = 'UPDATE devices SET transaction_key = ? WHERE device_id = ?';
    await client.execute(updateQuery, [newTransactionKey, deviceId]);

    return new Response(JSON.stringify({ username: user.username, transactionKey: newTransactionKey }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error during login:', error);
    return new Response('Failed to log in', { status: 500 });
  }
}

bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/send-message') {
      const { sender, message, timestamp, latitude, longitude } = await req.json();
      return createMessage(sender, message, timestamp, latitude, longitude);
    }
    if (url.pathname === '/create-user') {
      const { pinHash} = await req.json();
      return createUser(pinHash);
    }
    if (url.pathname === '/login') {
      const { deviceId, pinHash } = await req.json();
      return loginUser(deviceId, pinHash);
    }
    return new Response(null, { status: 404 });
  },
});

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
      keyspace: 'blackmessagesds'
    });
    await client.connect();
    console.log('Connected to ScyllaDB');
  } catch (error) {
    console.error('Failed to connect to ScyllaDB:', error);
    // Handle connection error, e.g., retry or exit
  }
}

connectToScylla(); // Connect on start

console.log('Server running on http://localhost:3000');
