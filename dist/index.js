"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const env_1 = require("./config/env");
const cors_1 = __importDefault(require("cors"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const tracker_routes_1 = __importDefault(require("./routes/tracker.routes"));
const qc_performance_routes_1 = __importDefault(require("./routes/qc-performance.routes"));
const qc_evaluation_routes_1 = __importDefault(require("./routes/qc-evaluation.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const qc_scoring_routes_1 = __importDefault(require("./routes/qc-scoring.routes"));
const qc_evaluation_updated_routes_1 = __importDefault(require("./routes/qc-evaluation-updated.routes"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cors_1.default)({ origin: "*" }));
app.get("/api/v1", (req, res) => {
    res.send("Hello, TFS QC Eval Backend!");
});
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
app.use("/api/v1", user_routes_1.default);
app.use("/api/v1", tracker_routes_1.default);
app.use("/api/v1", qc_performance_routes_1.default);
app.use("/api/v1", qc_evaluation_routes_1.default);
app.use("/api/v1", category_routes_1.default);
app.use("/api/v1", qc_scoring_routes_1.default);
app.use("/api/v1", qc_evaluation_updated_routes_1.default);
app.listen(env_1.PORT, () => {
    console.log(`Server running at http://localhost:${env_1.PORT}`);
});
