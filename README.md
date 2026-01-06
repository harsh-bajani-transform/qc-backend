# QC Backend

Backend for QC evaluation system built with Node.js and TypeScript.

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Environment Management**: dotenv
- **Development Tools**: 
  - ts-node (for TypeScript execution)
  - nodemon (for auto-restart during development)

## Setup

### Prerequisites

- Node.js installed on your system
- npm or yarn package manager

### Installation

```bash
# Install dependencies
npm install
```

### Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5000
SERVER_URL=http://localhost:5000

# Database
DB_URI=mongodb://localhost:27017/qc-backend

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Arcjet (Security)
ARCJET_ENV=development
ARCJET_KEY=your-arcjet-key

# QStash (Message Queue)
QSTASH_TOKEN=your-qstash-token
QSTASH_URL=https://qstash.upstash.io

# Email Configuration
EMAIL_PASSWORD=your-email-password
```

## Running the Application

### Development Mode

Start the server with auto-restart on file changes:

```bash
npm run dev
```

The server will start at `http://localhost:5000`

### Production Mode

Build and run the production version:

```bash
# Start the server
npm start
```

## API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check endpoint

## Project Structure

```
qc-backend/
├── config/
│   └── env.ts          # Environment configuration
├── index.ts             # Application entry point
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── .env                 # Environment variables
└── README.md            # This file
```

## Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (placeholder)
