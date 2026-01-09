import express, { Request, Response } from "express";
import { PORT } from "./config/env";

const app = express();

app.get("/api/v1", (req: Request, res: Response) => {
  res.send("Hello, TFS QC Eval Backend!");
});

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
