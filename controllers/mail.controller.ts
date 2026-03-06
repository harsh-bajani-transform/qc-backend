// src/controllers/yourController.ts (Update the path as needed)
import { Request, Response } from "express";
import transporter, { accountEmail, fromName } from "../config/nodemailer";
import { generateReworkEmailHtml } from "../constants/email-temp";

export const sendReworkEmail = async (req: Request, res: Response) => {
  const { agent_email, subject, message, status, ...templateData } = req.body;

  if (!agent_email) {
    return res.status(400).json({
      success: false,
      message: "agent_email is required",
    });
  }

  try {
    const mailOptions = {
      from: `"${fromName}" <${accountEmail}>`,
      to: agent_email,
      subject: subject || `QC Notification: ${status || "Update"}`,
      text: message || `QC review completed with status: ${status}`,
      // Use the extracted template function
      html: generateReworkEmailHtml(templateData),
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message: "Email sent successfully to agent",
    });
  } catch (error) {
    console.error("Error sending rework email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send email. Please check server configuration.",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};
