import mysql, {type Connection } from 'mysql2/promise';
import { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } from '../config/env';

export const get_db_connection = async (): Promise<Connection> => {
  try {
    const connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USERNAME,
      password: DB_PASSWORD,
      database: DB_DATABASE,
      port: Number(DB_PORT)
    });
    
    console.log('Connected to MySQL database successfully');
    return connection;
  } catch (error) {
    console.error('Error connecting to MySQL database:', error);
    throw error;
  }
};

export default get_db_connection;