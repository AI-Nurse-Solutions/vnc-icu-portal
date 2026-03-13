const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('SMTP credentials not configured. Emails will be logged to console.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL] Body: ${html}`);
    return;
  }
  await t.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
}

async function sendOTP(email, code) {
  await sendEmail({
    to: email,
    subject: 'Your VNC ICU Portal Login Code',
    html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
  });
}

async function sendRequestNotification({ to, employeeName, requestType, dates, status }) {
  const subject = `Vacation Request ${status.charAt(0).toUpperCase() + status.slice(1)} - ${employeeName}`;
  await sendEmail({
    to,
    subject,
    html: `<p>The ${requestType} request for <strong>${employeeName}</strong> covering ${dates} has been <strong>${status}</strong>.</p>`,
  });
}

module.exports = { sendEmail, sendOTP, sendRequestNotification };
