// Database connection pool for scaling
import mysql, { type Pool } from 'mysql2/promise';
import { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } from '../config/env';
import { SCALING_CONFIG } from '../config/scaling-config';

class ConnectionPool {
  private pool: Pool;
  private static instance: ConnectionPool;

  private constructor() {
    this.pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USERNAME,
      password: DB_PASSWORD,
      database: DB_DATABASE,
      port: Number(DB_PORT),
      connectionLimit: SCALING_CONFIG.database.maxConnections,
    });
  }

  public static getInstance(): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool();
    }
    return ConnectionPool.instance;
  }

  public async getConnection() {
    try {
      const connection = await this.pool.getConnection();
      return connection;
    } catch (error) {
      console.error('Error getting connection from pool:', error);
      throw error;
    }
  }

  public async close() {
    await this.pool.end();
  }

  public getPoolStats() {
    // Use type assertion to access internal properties safely
    const poolWithInternals = this.pool as any;
    return {
      totalConnections: poolWithInternals.pool?._allConnections?.length || 0,
      freeConnections: poolWithInternals.pool?._freeConnections?.length || 0,
      acquiringConnections: poolWithInternals.pool?._acquiringConnections?.length || 0,
    };
  }
}

export const getPoolConnection = () => ConnectionPool.getInstance().getConnection();
export const closePool = () => ConnectionPool.getInstance().close();
export const getPoolStats = () => ConnectionPool.getInstance().getPoolStats();
