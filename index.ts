import express, { Request, Response } from "express";
import { PORT } from "./config/env";
import cors from "cors";
import userRoutes from "./routes/user.routes";
import trackerRoutes from "./routes/tracker.routes";
import qcEvaluationRoutes from "./routes/qc-evaluation.routes";
import qcScoringRoutes from "./routes/qc-scoring.routes";
import aiEvaluationRoutes from "./routes/ai-evaluation.routes";
import geminiKeyRoutes from "./routes/gemini-key.routes";
import qcRecordsRoutes from "./routes/qc-records.routes";
import mailRoutes from "./routes/mail.routes";
import path from "path";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors({ origin: "*" }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api/v1", (req: Request, res: Response) => {
  res.send("Hello, TFS QC Eval Backend!");
});

app.get("/api/v1/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use("/api/v1", userRoutes);
app.use("/api/v1", trackerRoutes);
app.use("/api/v1", qcEvaluationRoutes);
app.use("/api/v1", qcScoringRoutes);
app.use("/api/v1", aiEvaluationRoutes);
app.use("/api/v1", geminiKeyRoutes);
app.use("/api/v1", qcRecordsRoutes);
app.use("/api/v1", mailRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
