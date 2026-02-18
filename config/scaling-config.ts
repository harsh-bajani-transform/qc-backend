// Scaling configuration for AI Evaluation API

export const SCALING_CONFIG = {
  // Connection pooling for database
  database: {
    maxConnections: 50, // Handle 40 concurrent + buffer
    minConnections: 5,
    acquireTimeout: 30000, // 30 seconds
    timeout: 60000, // 60 seconds
    reconnect: true,
    idleTimeout: 300000, // 5 minutes
  },
  
  // AI service rate limiting
  aiService: {
    maxConcurrent: 10, // Limit AI calls to prevent API limits
    queueTimeout: 120000, // 2 minutes max wait time
    retryAttempts: 2,
    retryDelay: 1000, // 1 second between retries
  },
  
  // File processing limits
  fileProcessing: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxRows: 5000, // Limit rows to prevent memory issues
    timeout: 300000, // 5 minutes per file
  },
  
  // Request queuing
  queue: {
    maxSize: 100, // Max requests in queue
    processInterval: 100, // Process queue every 100ms
    batchSize: 5, // Process 5 requests at a time
  }
};
