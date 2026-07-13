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
  const discountAmount = Math.max(0, Number(order.discount && order.discount.amount) || 0);
  const subtotal = order.totals.listedSubtotal || order.totals.subtotal;

  return replaceTemplateValues(template, {
    ORDER_NUMBER: escapeHtml(order.orderId),
    ITEM_ROWS: order.items.map(renderOrderItemRow).join(""),
    SUBTOTAL: formatMoney(subtotal),
    DISCOUNT: discountAmount > 0 ? `-${formatMoney(discountAmount)}` : formatMoney(0),
    TAX_RATE: escapeHtml(getDisplayedTaxRate(order)),
    TAX: formatMoney(order.totals.tax),
    SHIPPING_FEE: formatMoney(order.totals.shippingFee),
    PAYMENT_DETAILS: renderPaymentDetails(order.payment),
    GRAND_TOTAL: formatMoney(order.totals.total),
    SHIPPING_ADDRESS: renderShippingAddress(order.customer),
  });
}

function getDisplayedTaxRate(order) {
  const storedRate = Number(order.totals.taxRate);
  if (Number.isFinite(storedRate) && storedRate > 0) {
    return formatPercentage(storedRate);
  }

  const taxableAmount = Number(order.totals.subtotal) + Number(order.totals.shippingFee);
  const tax = Number(order.totals.tax);
  if (!Number.isFinite(taxableAmount) || taxableAmount <= 0 || !Number.isFinite(tax) || tax <= 0) {
    return "0";
  }
  return formatPercentage(tax / taxableAmount * 100);
}

function renderPaymentDetails(payment = {}) {
  return [payment.method, payment.cardBrand, payment.cardLast4]
    .filter(Boolean)
    .map((value) => escapeHtml(capitalize(value)))
    .join(" ");
}

function renderShippingAddress(customer = {}) {
  const lines = [
    customer.shippingName,
    joinAddressParts(customer.address1, customer.address2),
    joinAddressParts(customer.city, customer.state),
    joinAddressParts(customer.postalCode, formatCountry(customer.country)),
  ];

  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

function joinAddressParts(...parts) {
  return parts.filter(Boolean).join(", ");
}

function formatCountry(value) {
  const country = String(value || "").toUpperCase();
  return country === "US" ? "USA" : country;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : "";
}

function formatPercentage(value) {
  return String(Number(Number(value).toFixed(2)));
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

module.exports = {
  sendOrderSuccessEmail,
  sendOrderShippedEmail,
  renderOrderSuccessEmail,
};
