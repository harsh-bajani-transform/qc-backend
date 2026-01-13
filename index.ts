import express, { Request, Response } from "express";
import { PORT } from "./config/env";
import cors from "cors";
import userRoutes from "./routes/user.routes";
import trackerRoutes from "./routes/tracker.routes";
import qcPerformanceRoutes from "./routes/qc-performance.routes";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({origin: "*"}));

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
app.use("/api/v1", qcPerformanceRoutes);


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
