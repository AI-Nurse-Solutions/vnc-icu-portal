import nodemailer from "nodemailer";

function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!user || !pass) {
    console.warn("[Email] SMTP credentials not configured. Emails will be logged only.");
    return null;
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "vnc.icu.portal@gmail.com";

  if (!transporter) {
    console.log(`[Email MOCK] To: ${to} | Subject: ${subject}`);
    console.log(`[Email MOCK] Body: ${html.replace(/<[^>]*>/g, "")}`);
    return true;
  }

  try {
    await transporter.sendMail({ from: `"VNC ICU Portal" <${from}>`, to, subject, html });
    console.log(`[Email] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err);
    return false;
  }
}

const baseStyle = `
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #0F172A;
  color: #F1F5F9;
  padding: 32px;
  max-width: 600px;
  margin: 0 auto;
  border-radius: 12px;
`;

const accentStyle = `color: #06B6D4; font-weight: 600;`;
const mutedStyle = `color: #94A3B8; font-size: 14px;`;
const badgeBase = `display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;`;

function wrapEmail(content: string): string {
  return `
    <div style="background: #0F172A; padding: 24px;">
      <div style="${baseStyle}">
        <div style="border-bottom: 1px solid rgba(71,85,105,0.4); padding-bottom: 16px; margin-bottom: 24px;">
          <span style="${accentStyle}; font-size: 18px;">VNC ICU Vacation Request Portal</span>
        </div>
        ${content}
        <div style="${mutedStyle}; border-top: 1px solid rgba(71,85,105,0.4); margin-top: 24px; padding-top: 16px;">
          This is an automated message from the VNC ICU Vacation Request Portal.<br>
          Excellence Support Committee · Unit-Based Council
        </div>
      </div>
    </div>`;
}

export async function sendOtpEmail(to: string, name: string, otp: string): Promise<boolean> {
  return sendEmail(
    to,
    "Your VNC ICU Portal Login Code",
    wrapEmail(`
      <p>Hello <strong style="${accentStyle}">${name}</strong>,</p>
      <p>Your one-time login code is:</p>
      <div style="background: #1E293B; border: 1px solid rgba(6,182,212,0.3); border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #06B6D4; font-family: 'JetBrains Mono', monospace;">${otp}</span>
      </div>
      <p style="${mutedStyle}">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
    `)
  );
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<boolean> {
  return sendEmail(
    to,
    "Reset Your VNC ICU Portal Password",
    wrapEmail(`
      <p>Hello <strong style="${accentStyle}">${name}</strong>,</p>
      <p>We received a request to reset your password. Click the button below to set a new password:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background: #06B6D4; color: #0F172A; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block;">Reset Password</a>
      </div>
      <p style="${mutedStyle}">This link expires in 1 hour. If you did not request a password reset, ignore this email.</p>
    `)
  );
}

export async function sendInviteEmail(to: string, name: string, inviteUrl: string, role: string): Promise<boolean> {
  return sendEmail(
    to,
    "You're Invited to the VNC ICU Vacation Request Portal",
    wrapEmail(`
      <p>Hello <strong style="${accentStyle}">${name}</strong>,</p>
      <p>You have been invited to join the VNC ICU Vacation Request Portal as a <strong>${role}</strong>.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${inviteUrl}" style="background: #06B6D4; color: #0F172A; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block;">Accept Invitation & Set Password</a>
      </div>
      <p style="${mutedStyle}">This invitation expires in 48 hours.</p>
    `)
  );
}

export async function sendSubmissionConfirmation(
  to: string, name: string, requestType: string, dates: string[], status: string
): Promise<boolean> {
  const badge = requestType === "vacation"
    ? `<span style="${badgeBase} background: rgba(6,182,212,0.2); color: #06B6D4;">Vacation</span>`
    : `<span style="${badgeBase} background: rgba(167,139,250,0.2); color: #A78BFA;">Education</span>`;

  return sendEmail(
    to,
    `Request Submitted — ${requestType.charAt(0).toUpperCase() + requestType.slice(1)}`,
    wrapEmail(`
      <p>Hello <strong style="${accentStyle}">${name}</strong>,</p>
      <p>Your ${badge} request has been submitted successfully.</p>
      <div style="background: #1E293B; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Dates requested:</strong></p>
        <p style="margin: 0; color: #06B6D4;">${dates.join(", ")}</p>
      </div>
      <p style="${mutedStyle}">Status: <strong>Pending</strong> — Your manager will review your request and you will be notified of the decision.</p>
    `)
  );
}

export async function sendStatusChangeEmail(
  to: string, name: string, requestType: string, dates: string[], newStatus: string, note?: string
): Promise<boolean> {
  const statusColors: Record<string, string> = {
    approved: "#10B981",
    denied: "#EF4444",
    withdrawn: "#94A3B8",
  };
  const color = statusColors[newStatus] || "#94A3B8";
  const statusLabel = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);

  return sendEmail(
    to,
    `Request ${statusLabel} — ${requestType.charAt(0).toUpperCase() + requestType.slice(1)}`,
    wrapEmail(`
      <p>Hello <strong style="${accentStyle}">${name}</strong>,</p>
      <p>Your ${requestType} request status has been updated:</p>
      <div style="background: #1E293B; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Dates:</strong> ${dates.join(", ")}</p>
        <p style="margin: 0;"><strong>Status:</strong> <span style="color: ${color}; font-weight: 700;">${statusLabel}</span></p>
        ${note ? `<p style="margin: 8px 0 0; ${mutedStyle}">Note: ${note}</p>` : ""}
      </div>
    `)
  );
}

export async function sendWithdrawalManagerNotification(
  managerEmail: string, managerName: string, employeeName: string,
  requestType: string, dates: string[]
): Promise<boolean> {
  return sendEmail(
    managerEmail,
    `Approved Request Withdrawn — ${employeeName}`,
    wrapEmail(`
      <p>Hello <strong style="${accentStyle}">${managerName}</strong>,</p>
      <p><strong>${employeeName}</strong> has withdrawn an <strong>approved</strong> ${requestType} request. This may affect staffing.</p>
      <div style="background: #1E293B; border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Employee:</strong> ${employeeName}</p>
        <p style="margin: 0 0 8px;"><strong>Request type:</strong> ${requestType}</p>
        <p style="margin: 0;"><strong>Dates:</strong> ${dates.join(", ")}</p>
      </div>
      <p style="${mutedStyle}">Please review your staffing schedule accordingly.</p>
    `)
  );
}

export async function sendNewSubmissionManagerNotification(
  managerEmail: string, managerName: string, employeeName: string,
  requestType: string, dates: string[]
): Promise<boolean> {
  return sendEmail(
    managerEmail,
    `New ${requestType.charAt(0).toUpperCase() + requestType.slice(1)} Request — ${employeeName}`,
    wrapEmail(`
      <p>Hello <strong style="${accentStyle}">${managerName}</strong>,</p>
      <p>A new ${requestType} request has been submitted and is awaiting your review.</p>
      <div style="background: #1E293B; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Employee:</strong> ${employeeName}</p>
        <p style="margin: 0;"><strong>Dates:</strong> ${dates.join(", ")}</p>
      </div>
    `)
  );
}

export async function sendDeadlineReminder(
  to: string, name: string, deadlineDate: string, coverageStart: string, coverageEnd: string
): Promise<boolean> {
  return sendEmail(
    to,
    `Reminder: Vacation Request Deadline Approaching — ${deadlineDate}`,
    wrapEmail(`
      <p>Hello <strong style="${accentStyle}">${name}</strong>,</p>
      <p>This is a reminder that the vacation request submission deadline is approaching.</p>
      <div style="background: #1E293B; border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Deadline:</strong> <span style="color: #F59E0B;">${deadlineDate}</span></p>
        <p style="margin: 0;"><strong>Coverage period:</strong> ${coverageStart} – ${coverageEnd}</p>
      </div>
      <p style="${mutedStyle}">Please submit your vacation requests before the deadline. Log in to the portal to submit.</p>
    `)
  );
}
