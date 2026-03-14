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

async function sendInvite(email, firstName, token) {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const link = `${baseUrl}/signup?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Welcome to VNC ICU Portal — Set Your Password',
    html: `
      <p>Hi ${firstName},</p>
      <p>Your account has been created on the VNC ICU Vacation Request Portal.</p>
      <p>Click the link below to set your password:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 48 hours.</p>
    `,
  });
}

async function sendPasswordResetOTP(email, code) {
  await sendEmail({
    to: email,
    subject: 'VNC ICU Portal — Password Reset Code',
    html: `
      <p>Your password reset code is: <strong>${code}</strong></p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}

module.exports = { sendEmail, sendOTP, sendRequestNotification, sendInvite, sendPasswordResetOTP };
