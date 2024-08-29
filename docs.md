# Black Messages API Server

## Endpoints

### POST /send-message
Send a message

Request Body:
- sender: String
- message: String
- latitude: Number
- longitude: Number

Response: 
- Message sent successfully

### POST /create-user
Create a new user

Request Body:
- pinHash: String

Response:
- User details including username, deviceId, transactionKey

### POST /login
Login to the system

Request Body:
- deviceId: String
- pinHash: String

Response:
- Login successful with new transactionKey

### POST /update-localization
Update device localization

Request Body:
- deviceId: String
- latitude: Number
- longitude: Number

Response:
- Localization updated successfully

### POST /get-messages
Fetch messages near device location

Request Parameters:
- deviceId: String
- transactionKey: String

Response:
- Array of messages