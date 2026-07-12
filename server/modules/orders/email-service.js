const crypto = require("crypto");
const env = require("../../config/env");
const {
  assertOrderEmailConfig,
  sendOrderEmail,
} = require("../../integrations/email/client");
const { escapeHtml, formatMoney } = require("../../shared/utils");

async function sendOrderSuccessEmail(order) {
  assertOrderEmailConfig();

  if (!order.orderId) throw new Error("Paid order has no order number.");
  if (!order.customer.email) {
    throw new Error(`Paid order ${order.orderId} has no customer email.`);
  }
  if (!order.items.length) {
    throw new Error(`Paid order ${order.orderId} has no Sheet item rows.`);
  }

  const template = await loadTemplate(env.orderEmailTemplateUrl, "order");
  await sendOrderEmail({
    to: order.customer.email,
    subject: `Order Confirmation - ${order.orderId}`,
    html: renderOrderSuccessEmail(template, order),
    messageId: `order-success.${order.orderId}`,
  });
}

async function sendOrderShippedEmail(order) {
  assertOrderEmailConfig();

  const template = await loadTemplate(env.shippedEmailTemplateUrl, "shipped");
  const values = {
    ORDER_NUMBER: escapeHtml(order.orderId),
    CARRIER: escapeHtml(order.carrier),
    TRACKING_NUMBER: escapeHtml(order.trackingNumber),
  };
  const html = replaceTemplateValues(template, values);
  const trackingKey = crypto
    .createHash("sha256")
    .update(order.trackingNumber)
    .digest("hex")
    .slice(0, 16);

  await sendOrderEmail({
    to: order.email,
    subject: `Order Shipped - ${order.orderId}`,
    html,
    messageId: `order-shipped.${order.orderId}.${trackingKey}`,
  });
}

function renderOrderSuccessEmail(template, order) {
  return replaceTemplateValues(template, {
    ORDER_NUMBER: escapeHtml(order.orderId),
    ITEM_ROWS: order.items.map(renderOrderItemRow).join(""),
    SUBTOTAL: formatMoney(order.totals.subtotal),
    TAX: formatMoney(order.totals.tax),
    SHIPPING_FEE: formatMoney(order.totals.shippingFee),
    GRAND_TOTAL: formatMoney(order.totals.total),
  });
}

function renderOrderItemRow(item) {
  const details = [item.variant, item.size]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" / ");
  const lineTotal = formatMoney(item.unit_price * item.qty);

  return `<tr>
    <td style="padding:0 8px 18px 0;vertical-align:top;">${escapeHtml(item.product_name)}${details ? `<br>${details}` : ""}</td>
    <td style="padding:0 8px 18px;text-align:center;vertical-align:top;white-space:nowrap;">x${item.qty}</td>
    <td style="padding:0 0 18px 8px;text-align:right;vertical-align:top;white-space:nowrap;">${lineTotal}</td>
  </tr>`;
}

function replaceTemplateValues(template, values) {
  return Object.entries(values).reduce((html, [name, value]) => {
    return html.replaceAll(`{{${name}}}`, value);
  }, template);
}

async function loadTemplate(url, templateName) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load ${templateName} email template: ${response.status}`);
  }
  return response.text();
}

module.exports = { sendOrderSuccessEmail, sendOrderShippedEmail };
