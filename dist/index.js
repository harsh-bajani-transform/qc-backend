"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const env_1 = require("./config/env");
const app = (0, express_1.default)();
app.get("/api/v1", (req, res) => {
    res.send("Hello, TFS QC Eval Backend!");
});
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});
app.listen(env_1.PORT, () => {
    console.log(`Server running at http://localhost:${env_1.PORT}`);
});
