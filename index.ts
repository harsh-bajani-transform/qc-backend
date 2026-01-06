import express, { Request, Response } from 'express';
import { PORT } from './config/env';

const app = express();

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, QC Backend!');
});

app.get('/health', (req: Request, res: Response) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});