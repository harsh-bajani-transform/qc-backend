"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReworkEmail = exports.sendQCEmailInternal = void 0;
const nodemailer_1 = __importStar(require("../config/nodemailer"));
const email_temp_1 = require("../constants/email-temp");
const sendQCEmailInternal = (options) => __awaiter(void 0, void 0, void 0, function* () {
    const { agent_email, subject, message, status, comments } = options, templateData = __rest(options, ["agent_email", "subject", "message", "status", "comments"]);
    const finalMessage = message || comments;
    console.log(`[Email Service] Starting email process for: ${agent_email}`);
    if (!agent_email) {
        console.error(`[Email Service] FAILED: No agent email provided`);
        throw new Error("agent_email is required");
    }
    const mailOptions = {
        from: `"${nodemailer_1.fromName}" <${nodemailer_1.accountEmail}>`,
        to: agent_email,
        subject: subject || `QC Notification: ${status || "Update"}`,
        text: finalMessage || `QC review completed with status: ${status}`,
        html: (0, email_temp_1.generateReworkEmailHtml)(Object.assign(Object.assign({ status }, templateData), { message: finalMessage })),
    };
    try {
        console.log(`[Email Service] Sending mail via SMTP...`);
        const info = yield nodemailer_1.default.sendMail(mailOptions);
        console.log(`[Email Service] SUCCESS: Email sent to ${agent_email}. MessageID: ${info.messageId}`);
        return info;
    }
    catch (error) {
        console.error(`[Email Service] FAILED to send email to ${agent_email}:`, error);
        throw error;
    }
});
exports.sendQCEmailInternal = sendQCEmailInternal;
const sendReworkEmail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, exports.sendQCEmailInternal)(req.body);
        return res.status(200).json({
            success: true,
            message: "Email sent successfully to agent",
        });
    }
    catch (error) {
        console.error("Error sending QC email:", error);
        return res.status(error instanceof Error && error.message.includes("required") ? 400 : 500).json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to send email",
        });
    }
});
exports.sendReworkEmail = sendReworkEmail;
