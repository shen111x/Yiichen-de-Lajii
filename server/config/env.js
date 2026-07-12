function readAllowedOrigins(value) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

module.exports = {
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripeProductTaxCode: process.env.STRIPE_PRODUCT_TAX_CODE || "txcd_30011000",

  googleSheetId: process.env.GOOGLE_SHEET_ID,
  googleSheetTabName: process.env.GOOGLE_SHEET_TAB_NAME || "Orders",
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,

  orderEmailApiKey: process.env.ORDER_EMAIL_API_KEY,
  orderEmailFrom: process.env.ORDER_EMAIL_FROM,
  zohoSmtpUser: process.env.ZOHO_SMTP_USER,
  zohoSmtpPassword: process.env.ZOHO_SMTP_PASSWORD,
  orderEmailTemplateUrl:
    process.env.ORDER_EMAIL_TEMPLATE_URL ||
    "https://yiichendelajii.com/emails/order-success.html",
  shippedEmailTemplateUrl:
    process.env.SHIPPED_EMAIL_TEMPLATE_URL ||
    "https://yiichendelajii.com/emails/order-shipped.html",

  productIndexUrl:
    process.env.PRODUCT_INDEX_URL ||
    "https://yiichendelajii.com/product-data/search-index.json",

  allowedOrigins: readAllowedOrigins(
    process.env.ALLOWED_ORIGIN || "https://yiichendelajii.com"
  ),
};
