import bun from 'bun';
import cassandra from 'cassandra-driver';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto'; // For generating UUIDs

dotenv.config();

let client: cassandra.Client; // Storing the client globally

// Function to check if dev mode is enabled (replace with your actual logic)
const isDevMode = true

 async function createMessage(sender: string, message: string, latitude: number, longitude: number) {
  try {
    if (isDevMode) {
      console.log('API Request: createMessage', { sender, message, latitude, longitude });
    }
    // Validate input data
    if (!sender || !message || isNaN(latitude) || isNaN(longitude)) {
      return new Response('Invalid message data', { status: 400 }); // Bad Request
    }

    const id = randomUUID(); // Generate a UUID for the message ID
    const timestamp = Date.now(); // Get current timestamp in milliseconds

    const ttlSeconds = 30; // Set TTL to 30 seconds

    const query = `
      INSERT INTO messages (message_id, sender, message_content, timestamp, latitude, longitude)
      VALUES (?, ?, ?, ?, ?, ?)
      USING TTL ${ttlSeconds};
    `;
    
    await client.execute(query, [
      id,
      sender,
      message,
      timestamp,
      latitude,
      longitude,
    ]);
    

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
    if (isDevMode) {
      console.log('API Request: createUser', { pinHash });
    }
    // Validate input data
    if (!pinHash) {
      return new Response('Invalid user data', { status: 400 }); // Bad Request
    }

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
    if (isDevMode) {
      console.log('API Request: loginUser', { deviceId, pinHash });
    }
    // Validate input data
    if (!deviceId || !pinHash) {
      return new Response('Invalid login data', { status: 400 }); // Bad Request
    }

    // Fetch user based on device ID
    const userQuery = 'SELECT * FROM users WHERE device_id = ? ALLOW FILTERING';
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

 async function updateLocalization(deviceId: string, latitude: number, longitude: number) {
  try {
    if (isDevMode) {
      console.log('API Request: updateLocalization', { deviceId, latitude, longitude });
    }
    // Validate input data
    if (!deviceId || isNaN(latitude) || isNaN(longitude)) {
      return new Response('Invalid localization data', { status: 400 }); // Bad Request
    }

    const timestamp = Date.now(); // Get current timestamp in milliseconds

    // Check if a localization for the device already exists
    const existingLocalizationQuery = 'SELECT * FROM current_localizations WHERE device_id = ?';
    const existingLocalizationResult = await client.execute(existingLocalizationQuery, [deviceId]);

    if (existingLocalizationResult.rows.length > 0) {
      // Update existing localization
      const updateQuery = `
        UPDATE current_localizations 
        SET latitude = ?, longitude = ?, timestamp = ?
        WHERE device_id = ?
      `;
      await client.execute(updateQuery, [latitude, longitude, timestamp, deviceId]);
    } else {
      // Insert new localization
      const insertQuery = `
        INSERT INTO current_localizations (device_id, latitude, longitude, timestamp)
        VALUES (?, ?, ?, ?)
      `;
      await client.execute(insertQuery, [deviceId, latitude, longitude, timestamp]);
    }

    return new Response('Localization updated successfully', { status: 200 });
  } catch (error) {
    console.error('Error updating localization:', error);
    return new Response('Failed to update localization', { status: 500 });
  }
}

 async function getMessages(deviceId: string, transactionKey: string): Promise<Response> {
  try {
    if (isDevMode) {
      console.log('API Request: getMessages', { deviceId, transactionKey });
    }
    // Validate input data
    if (!deviceId || !transactionKey) {
      if (isDevMode) {
        console.log('Invalid request data');
      }
      return new Response('Invalid request data', { status: 400 }); // Bad Request
    }

    // 1. Authenticate the device and transaction key
    const deviceQuery = 'SELECT * FROM devices WHERE device_id = ? AND transaction_key = ? ALLOW FILTERING';
    const deviceResult = await client.execute(deviceQuery, [deviceId, transactionKey]);

    if (deviceResult.rows.length === 0) {
      if (isDevMode) {
        console.log('Invalid device ID or transaction key');
      }
      return new Response('Invalid device ID or transaction key', { status: 401 }); // Unauthorized
    }

    // 2. Fetch localization for the device
    const localizationQuery = 'SELECT * FROM current_localizations WHERE device_id = ? ALLOW FILTERING';
    const localizationResult = await client.execute(localizationQuery, [deviceId]);

    if (localizationResult.rows.length === 0) {
      if (isDevMode) {
        console.log('Device localization not found');
      }
      return new Response('Device localization not found', { status: 404 });
    }

    const deviceLocalization = localizationResult.rows[0];
    const deviceLatitude = deviceLocalization.latitude;
    const deviceLongitude = deviceLocalization.longitude;

    // 3. Fetch messages near the device location
    const range = getQueryRange(deviceLatitude, deviceLongitude, 0.5); // 500m radius
    const messagesQuery = `
    SELECT message_id, sender, message_content, timestamp, latitude, longitude // Include timestamp here
    FROM messages 
    WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ? ALLOW FILTERING
    `;

    const messagesResult = await client.execute(messagesQuery, [
      range.minLat,
      range.maxLat,
      range.minLon,
      range.maxLon,
    ]);

    if (isDevMode) {
      console.log('Messages:', messagesResult.rows
        .map((row: any) => ({
          message_id: row.message_id,
          sender: row.sender,
          message_content: row.message_content,
          latitude: row.latitude,
          longitude: row.longitude,
          timestamp: row.timestamp,
        }))
      );
    }

    return new Response(JSON.stringify(messagesResult.rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error fetching messages:', error);
    return new Response('Failed to fetch messages', { status: 500 });
  }
}

// Generate a longtiude and latitude range for the query
 function getQueryRange(latitude: number, longitude: number, radius: number) {
  const R = 6371; // Earth's radius in km
  const latRad = latitude * Math.PI / 180;
  const lonRad = longitude * Math.PI / 180;
  const rad = radius / R;
  
  const minLat = latRad - rad;
  const maxLat = latRad + rad;
  const deltaLon = Math.asin(Math.sin(rad) / Math.cos(latRad));
  
  const minLon = lonRad - deltaLon;
  const maxLon = lonRad + deltaLon;
  
  return {
    minLat: minLat * 180 / Math.PI,
    maxLat: maxLat * 180 / Math.PI,
    minLon: minLon * 180 / Math.PI,
    maxLon: maxLon * 180 / Math.PI
  };
}

bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/send-message') {
      const { sender, message, latitude, longitude } = await req.json();
      return createMessage(sender, message, latitude, longitude);
    }
    if (url.pathname === '/create-user') {
      const { pinHash} = await req.json();
      return createUser(pinHash);
    }
    if (url.pathname === '/login') {
      const { deviceId, pinHash } = await req.json();
      return loginUser(deviceId, pinHash);
    }
    if (url.pathname === '/update-localization') {
      const { deviceId, latitude, longitude } = await req.json();
      return updateLocalization(deviceId, latitude, longitude);
    }
    if (url.pathname === '/get-messages') {
      const { deviceId, transactionKey } = await req.json();
      return getMessages(deviceId, transactionKey);
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
