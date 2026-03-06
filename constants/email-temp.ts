interface ReworkEmailData {
  status?: string;
  project_name?: string;
  task_name?: string;
  qc_agent_name?: string;
  qc_score?: number | string;
  error_count?: number;
  error_list?: any[] | any;
  message?: string;
}

export const generateReworkEmailHtml = (data: ReworkEmailData): string => {
  const {
    status,
    project_name,
    task_name,
    qc_agent_name,
    qc_score,
    error_count,
    error_list,
    message,
  } = data;

  const isReworkOrCorrection = status === "Rework" || status === "Correction";
  const hasErrors =
    (error_count ?? 0) > 0 ||
    (error_list && Array.isArray(error_list) && error_list.length > 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>QC Notification</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:Arial, Helvetica, sans-serif;">
 
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 15px;">
 
        <!-- Container -->
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
          style="background-color:#ffffff; border-radius:10px; border:1px solid #d1d5db;">
 
          <!-- Header -->
          <tr>
            <td align="center"
              style="background-color:${isReworkOrCorrection ? "#dc2626" : "#2563eb"}; padding:24px; border-radius:10px 10px 0 0;">
              <h2 style="margin:0; color:#ffffff; font-size:20px;">
                QC ${status || "Notification"}
              </h2>
            </td>
          </tr>
 
          <!-- Body -->
          <tr>
            <td style="padding:30px; color:#1f2937; font-size:14px; line-height:1.6;">
 
              <p style="margin:0 0 15px;">
                Hello,
              </p>
 
              <p style="margin:0 0 20px;">
                A Quality Control review has been completed for your submission.
              </p>

              <!-- Basic Info Table -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:25px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 40%;">Project:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${project_name || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Task:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${task_name || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">QC Agent:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${qc_agent_name || "QA Department"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Final QC Score:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #2563eb;">${qc_score !== undefined ? qc_score : "N/A"}%</td>
                </tr>
              </table>
 
              ${
                isReworkOrCorrection || hasErrors
                  ? `
              <!-- Error Summary Box -->
              <div style="background-color:#fff7ed; border:1px solid #f59e0b; border-radius:6px; padding:20px; margin-bottom:25px;">
                <h3 style="margin:0 0 10px; color:#92400e; font-size:15px;">Review Details:</h3>
                <p style="margin:0 0 5px; color:#92400e;"><strong>Status:</strong> ${status}</p>
                ${error_count !== undefined ? `<p style="margin:0 0 5px; color:#92400e;"><strong>Error Count:</strong> ${error_count}</p>` : ""}
                
                ${
                  error_list &&
                  Array.isArray(error_list) &&
                  error_list.length > 0
                    ? `
                <div style="margin-top:15px;">
                  <strong style="color:#92400e; display:block; margin-bottom:8px;">Observations / Error List:</strong>
                  <ul style="margin:0; padding-left:20px; color:#92400e;">
                    ${error_list.map((err: any) => `<li>${typeof err === "object" ? JSON.stringify(err) : err}</li>`).join("")}
                  </ul>
                </div>
                `
                    : ""
                }
              </div>
              `
                  : ""
              }

              ${
                message
                  ? `
              <div style="margin-bottom:25px;">
                <strong style="display:block; margin-bottom:10px;">Message from QA:</strong>
                <div style="padding:15px; background-color:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; color:#374151;">
                  ${message.replace(/\n/g, "<br>")}
                </div>
              </div>
              `
                  : ""
              }
 
              <p style="margin:0 0 15px; color:#374151;">
                ${isReworkOrCorrection ? "Please address the issues mentioned above and resubmit your work for further evaluation." : "Thank you for your submission."}
              </p>
 
              <p style="margin:0; color:#374151;">
                Best regards,<br />
                <strong>Transform Solution Pvt. Ltd.</strong>
              </p>
 
            </td>
          </tr>
 
          <!-- Footer -->
          <tr>
            <td align="center"
              style="background-color:#f3f4f6; padding:15px; border-radius:0 0 10px 10px;
              color:#6b7280; font-size:11px;">
              © 2026 Transform Solution. All rights reserved.
            </td>
          </tr>
 
        </table>
 
      </td>
    </tr>
  </table>
 
</body>
</html>`;
};
