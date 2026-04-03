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
const ai_evaluation_routes_1 = __importDefault(require("./routes/ai-evaluation.routes"));
const gemini_key_routes_1 = __importDefault(require("./routes/gemini-key.routes"));
const qc_records_routes_1 = __importDefault(require("./routes/qc-records.routes"));
const qc_regular_routes_1 = __importDefault(require("./routes/qc-regular.routes"));
const qc_correction_routes_1 = __importDefault(require("./routes/qc-correction.routes"));
const qc_rework_routes_1 = __importDefault(require("./routes/qc-rework.routes"));
const mail_routes_1 = __importDefault(require("./routes/mail.routes"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: "50mb" }));
app.use(express_1.default.urlencoded({ limit: "50mb", extended: true }));
app.use((0, cors_1.default)({ origin: "*" }));
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
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
app.use("/api/v1", ai_evaluation_routes_1.default);
app.use("/api/v1", gemini_key_routes_1.default);
app.use("/api/v1", qc_records_routes_1.default);
app.use("/api/v1", qc_regular_routes_1.default);
app.use("/api/v1", qc_correction_routes_1.default);
app.use("/api/v1", qc_rework_routes_1.default);
app.use("/api/v1", mail_routes_1.default);
app.listen(env_1.PORT, () => {
    console.log(`Server running at http://localhost:${env_1.PORT}`);
});
