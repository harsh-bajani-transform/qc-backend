import nodemailer from "nodemailer";

import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM_NAME,
} from "./env";

export const accountEmail = SMTP_USER;
export const fromName = SMTP_FROM_NAME || "Transform Solutions";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export default transporter;
