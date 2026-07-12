const nodemailer = require("nodemailer");
const env = require("../../config/env");
const constants = require("../../config/constants");

let emailTransport = null;

function assertOrderEmailConfig() {
  [
    ["ORDER_EMAIL_FROM", env.orderEmailFrom],
    ["ZOHO_SMTP_USER", env.zohoSmtpUser],
    ["ZOHO_SMTP_PASSWORD", env.zohoSmtpPassword],
  ].forEach(([name, value]) => {
    if (!value) throw new Error(`Missing required env var: ${name}`);
  });
}

async function sendOrderEmail({ to, subject, html, messageId }) {
  assertOrderEmailConfig();

  if (!emailTransport) {
    emailTransport = nodemailer.createTransport({
      host: constants.zohoSmtpHost,
      port: constants.zohoSmtpPort,
      secure: constants.zohoSmtpPort === 465,
      auth: {
        user: env.zohoSmtpUser,
        pass: env.zohoSmtpPassword,
      },
    });
  }

  await emailTransport.sendMail({
    from: env.orderEmailFrom,
    to,
    subject,
    html,
    messageId: `<${messageId}@yiichendelajii.com>`,
  });
}

module.exports = { assertOrderEmailConfig, sendOrderEmail };
