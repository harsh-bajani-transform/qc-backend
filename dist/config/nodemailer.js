"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromName = exports.accountEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("./env");
exports.accountEmail = env_1.SMTP_USER;
exports.fromName = env_1.SMTP_FROM_NAME || "Transform Solutions";
const transporter = nodemailer_1.default.createTransport({
    host: env_1.SMTP_HOST,
    port: Number(env_1.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: env_1.SMTP_USER,
        pass: env_1.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false,
    },
});
exports.default = transporter;
