// src/controllers/yourController.ts (Update the path as needed)
import { Request, Response } from "express";
import transporter, { accountEmail, fromName } from "../config/nodemailer";
import { generateReworkEmailHtml } from "../constants/email-temp";

interface QCEmailOptions {
  agent_email: string;
  subject?: string;
  message?: string;
  status?: string;
  [key: string]: any;
}

export const sendQCEmailInternal = async (options: QCEmailOptions) => {
  const { agent_email, subject, message, status, comments, ...templateData } = options;
  const finalMessage = message || comments;
  console.log(`[Email Service] Starting email process for: ${agent_email}`);

  if (!agent_email) {
    console.error(`[Email Service] FAILED: No agent email provided`);
    throw new Error("agent_email is required");
  }

  const mailOptions = {
    from: `"${fromName}" <${accountEmail}>`,
    to: agent_email,
    subject: subject || `QC Notification: ${status || "Update"}`,
    text: finalMessage || `QC review completed with status: ${status}`,
    html: generateReworkEmailHtml({ status, ...templateData, message: finalMessage }),
  };

  try {
    console.log(`[Email Service] Sending mail via SMTP...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Service] SUCCESS: Email sent to ${agent_email}. MessageID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`[Email Service] FAILED to send email to ${agent_email}:`, error);
    throw error;
  }
};

export const sendReworkEmail = async (req: Request, res: Response) => {
  try {
    await sendQCEmailInternal(req.body);

    return res.status(200).json({
      success: true,
      message: "Email sent successfully to agent",
    });
  } catch (error) {
    console.error("Error sending QC email:", error);
    return res.status(error instanceof Error && error.message.includes("required") ? 400 : 500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to send email",
    });
  }
};
