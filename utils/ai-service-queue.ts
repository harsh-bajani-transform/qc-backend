// AI Service Queue for rate limiting and concurrent request handling
import { SCALING_CONFIG } from '../config/scaling-config';
import AIService from '../config/ai';

interface QueuedRequest {
  id: string;
  prompt: string;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

class AIServiceQueue {
  private queue: QueuedRequest[] = [];
  private processing: Set<string> = new Set();
  private processingInterval: NodeJS.Timeout | null = null;
  private static instance: AIServiceQueue;

  private constructor() {
    this.startProcessing();
  }

  public static getInstance(): AIServiceQueue {
    if (!AIServiceQueue.instance) {
      AIServiceQueue.instance = new AIServiceQueue();
    }
    return AIServiceQueue.instance;
  }

  public async evaluateData(prompt: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const request: QueuedRequest = {
        id: requestId,
        prompt,
        resolve,
        reject,
        timestamp: Date.now()
      };

      // Check queue size limit
      if (this.queue.length >= SCALING_CONFIG.queue.maxSize) {
        reject(new Error('AI service queue is full'));
        return;
      }

      this.queue.push(request);

      // Set timeout for queue wait
      setTimeout(() => {
        const index = this.queue.findIndex(req => req.id === requestId);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error('Request timed out in queue'));
        }
      }, SCALING_CONFIG.aiService.queueTimeout);
    });
  }

  private startProcessing() {
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, SCALING_CONFIG.queue.processInterval);
  }

  private async processQueue() {
    // Check if we can process more requests
    if (this.processing.size >= SCALING_CONFIG.aiService.maxConcurrent) {
      return;
    }

    // Get batch of requests to process
    const batchSize = Math.min(
      SCALING_CONFIG.queue.batchSize,
      SCALING_CONFIG.aiService.maxConcurrent - this.processing.size
    );

    const requestsToProcess = this.queue.splice(0, batchSize);

    for (const request of requestsToProcess) {
      this.processRequest(request);
    }
  }

  private async processRequest(request: QueuedRequest) {
    this.processing.add(request.id);

    try {
      const result = await this.callAIServiceWithRetry(request.prompt);
      request.resolve(result);
    } catch (error) {
      request.reject(error as Error);
    } finally {
      this.processing.delete(request.id);
    }
  }

  private async callAIServiceWithRetry(prompt: string): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= SCALING_CONFIG.aiService.retryAttempts; attempt++) {
      try {
        return await AIService.evaluateData(prompt);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < SCALING_CONFIG.aiService.retryAttempts) {
          // Wait before retry
          await new Promise(resolve => 
            setTimeout(resolve, SCALING_CONFIG.aiService.retryDelay * (attempt + 1))
          );
        }
      }
    }

    throw lastError || new Error('AI service call failed');
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getStats() {
    return {
      queueLength: this.queue.length,
      processingCount: this.processing.size,
      oldestRequest: this.queue.length > 0 ? Date.now() - this.queue[0].timestamp : 0
    };
  }

  public stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
  }
}

export const getAIServiceQueue = () => AIServiceQueue.getInstance();
