const functions = require("@google-cloud/functions-framework");
const express = require("express");
const Stripe = require("stripe");
const { google } = require("googleapis");
const crypto = require("crypto");

const app = express();

// ============================================================
// HANDLE: VARIABLES YOU NEED TO CHANGE
// ============================================================

const HANDLE = {
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  googleSheetId: process.env.GOOGLE_SHEET_ID,
  googleSheetTabName: process.env.GOOGLE_SHEET_TAB_NAME || "Orders",
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,

  productIndexUrl:
    process.env.PRODUCT_INDEX_URL ||
    "https://yiichendelajii.com/product-data/search-index.json",

  orderIdBrandPrefix: "YDL",
  orderIdCountryCode: "01",
  firstStepOrderStatus: "abandon",
  paidOrderStatus: "ordered",
  paidShippingStatus: "waiting",
  currency: "usd",

  allowedOrigins: (process.env.ALLOWED_ORIGIN || "https://yiichendelajii.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

// ============================================================
// HANDLE: STRIPE + EXPRESS SETUP
// ============================================================

let stripeClient = null;

app.use((req, res, next) => {
  const origin = req.get("Origin") || "";
  const allowedOrigin = getAllowedOrigin(origin);

  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (allowedOrigin) {
    res.set("Access-Control-Allow-Origin", allowedOrigin);
  }

  if (req.method === "OPTIONS") {
    res.status(allowedOrigin ? 204 : 403).send("");
    return;
  }

  if (origin && !allowedOrigin) {
    res.status(403).json({ ok: false, error: "Origin is not allowed." });
    return;
  }

  next();
});

// ============================================================
// WEBHOOK PROCESSING: STRIPE PAYMENT SUCCESS -> GOOGLE SHEET
// ============================================================
// Stripe webhook must receive the raw request body, so this route stays
// above express.json(). It fills the blue + green sheet areas after a
// PaymentIntent succeeds.

app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    assertStripeConfig();
    assertStripeWebhookConfig();

    const signature = req.get("Stripe-Signature") || "";
    const webhookPayload = req.rawBody || req.body;
    const event = getStripeClient().webhooks.constructEvent(
      webhookPayload,
      signature,
      HANDLE.stripeWebhookSecret
    );

    console.log("Stripe webhook received:", event.type, event.id);

    if (event.type !== "payment_intent.succeeded") {
      res.json({ ok: true, ignored: true });
      return;
    }

    await updatePaidOrderInSheetFromPaymentIntentId(event.data.object.id);

    console.log("Stripe webhook sheet update completed:", event.data.object.id);

    res.json({ ok: true, sheet_updated: true });
  } catch (error) {
    console.error("Stripe webhook failed:", error);
    res.status(error.statusCode || 400).json({
      ok: false,
      error: error.isPublic ? error.message : "Webhook processing failed.",
    });
  }
});

app.use(express.json({ limit: "20kb" }));

app.use((error, req, res, next) => {
  if (error && error.type === "entity.parse.failed") {
    res.status(400).json({ ok: false, error: "Invalid JSON body." });
    return;
  }

  if (error && error.type === "entity.too.large") {
    res.status(400).json({ ok: false, error: "Request body is too large." });
    return;
  }

  next(error);
});

// ============================================================
// INTENT PROCESSING
// ============================================================

app.post("/create-payment-intent", async (req, res) => {
  try {
    assertStripeConfig();

    const { items = [], notes = "" } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Cart is empty." });
      return;
    }

    if (items.length > 50) {
      res.status(400).json({ error: "Cart has too many items." });
      return;
    }

    const productIndex = await getProductIndex();
    const productById = productIndex.productById;
    const shippingFee = productIndex.shippingFee;

    const orderId = createOrderId();
    const timeOrdered = formatSheetDate(new Date());

    const normalizedItems = items.map((cartItem) => {
      const productId = cleanText(cartItem.product_id, 120);
      const product = productById.get(productId);

      if (!product) {
        throw new PublicError(400, `Unknown product_id: ${productId}`);
      }

      const qty = Number(cartItem.qty || 1);
      const unitPrice = Number(product.price);

      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        throw new PublicError(400, `Invalid qty for product_id: ${productId}`);
      }

      if (!Number.isFinite(unitPrice)) {
        throw new Error(`Invalid price for product_id: ${productId}`);
      }

      return {
        product_id: product.product_id,
        product_name: product.name,
        variant: cleanText(cartItem.variant || product.variant || "Default", 80),
        size: cleanText(cartItem.size, 40),
        qty,
        unit_price: unitPrice,
      };
    });

    const subtotal = roundMoney(
      normalizedItems.reduce((sum, item) => {
        return sum + item.unit_price * item.qty;
      }, 0)
    );
    const tax = 0;
    const total = roundMoney(subtotal + shippingFee);

    const paymentIntent = await getStripeClient().paymentIntents.create(
      {
        amount: toStripeAmount(total),
        currency: HANDLE.currency,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          order_id: orderId,
          order_status: HANDLE.firstStepOrderStatus,
          subtotal: formatMoney(subtotal),
          shipping_fee: formatMoney(shippingFee),
          tax: formatMoney(tax),
          total: formatMoney(total),
          currency: HANDLE.currency,
        },
      },
      {
        idempotencyKey: `create-intent-${orderId}`,
      }
    );

    writeFirstStepOrderInBackground({
      orderId,
      timeOrdered,
      notes: cleanText(notes, 500),
      orderStatus: HANDLE.firstStepOrderStatus,
      stripePaymentIntentId: paymentIntent.id,
      items: normalizedItems,
    });

    res.json({
      ok: true,
      order_id: orderId,
      client_secret: paymentIntent.client_secret,
      stripe_payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    console.error(error);

    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.isPublic ? error.message : "Unable to create payment intent.",
    });
  }
});

// ============================================================
// GOOGLE SHEET WRITE HELPERS
// ============================================================

function writeFirstStepOrderInBackground(order) {
  appendFirstStepOrderToSheet(order).catch((error) => {
    console.error("Background Google Sheet write failed:", error);
  });
}

async function appendFirstStepOrderToSheet(order) {
  const sheets = await getSheetsClient();
  const startRow = await getNextOrderRow(sheets);

  const rows = order.items.map((item, index) => {
    const isFirstItemRow = index === 0;

    return [
      // A-C: purple area
      isFirstItemRow ? order.orderId : "",
      isFirstItemRow ? order.timeOrdered : "",
      isFirstItemRow ? order.notes || "" : "",

      // D: spacer
      "",

      // E-K: yellow area
      isFirstItemRow ? order.orderStatus : "",
      item.product_name,
      item.product_id,
      item.variant,
      item.size,
      item.qty,
      formatMoney(item.unit_price),

      // L: spacer
      "",

      // M-P: red area, second step or manual
      "",
      "",
      "",
      "",

      // Q: spacer
      "",

      // R-Z: blue area, second step webhook
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",

      // AA: spacer
      "",

      // AB-AG: green area, second step webhook
      isFirstItemRow ? order.stripePaymentIntentId : "",
      "",
      "",
      "",
      "",
      "",
    ];
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: HANDLE.googleSheetId,
    range: `'${HANDLE.googleSheetTabName}'!A${startRow}:AG${startRow + rows.length - 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: rows,
    },
  });
}

// ============================================================
// WEBHOOK SHEET UPDATE HELPERS: FILL BLUE + GREEN AREAS
// ============================================================
// On payment success, update only the first row of the order:
// E       order_status
// R-Z     customer + shipping details (blue area)
// AC-AG   totals after stripe_payment_intent_id (green area)

async function updatePaidOrderInSheetFromPaymentIntentId(stripePaymentIntentId) {
  const paymentIntent = await getHydratedPaymentIntent(stripePaymentIntentId);

  await updatePaidOrderInSheet({
    stripePaymentIntentId: paymentIntent.id,
    orderStatus: HANDLE.paidOrderStatus,
    customer: getCustomerDetailsFromPaymentIntent(paymentIntent),
    totals: getTotalsFromPaymentIntent(paymentIntent),
  });
}

async function updatePaidOrderInSheet(order) {
  const sheets = await getSheetsClient();
  const rowNumber = await findOrderRowByPaymentIntentIdWithRetry(
    sheets,
    order.stripePaymentIntentId
  );

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: HANDLE.googleSheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `'${HANDLE.googleSheetTabName}'!E${rowNumber}`,
          values: [[order.orderStatus]],
        },
        {
          range: `'${HANDLE.googleSheetTabName}'!M${rowNumber}`,
          values: [[HANDLE.paidShippingStatus]],
        },
        {
          range: `'${HANDLE.googleSheetTabName}'!R${rowNumber}:Z${rowNumber}`,
          values: [
            [
              order.customer.email,
              order.customer.phone,
              order.customer.shippingName,
              order.customer.address1,
              order.customer.address2,
              order.customer.city,
              order.customer.state,
              order.customer.postalCode,
              order.customer.country,
            ],
          ],
        },
        {
          range: `'${HANDLE.googleSheetTabName}'!AC${rowNumber}:AG${rowNumber}`,
          values: [
            [
              formatMoney(order.totals.subtotal),
              formatMoney(order.totals.shippingFee),
              formatMoney(order.totals.tax),
              formatMoney(order.totals.total),
              order.totals.currency,
            ],
          ],
        },
      ],
    },
  });
}

async function findOrderRowByPaymentIntentIdWithRetry(sheets, stripePaymentIntentId) {
  const retryCount = 6;

  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    const rowNumber = await findOrderRowByPaymentIntentId(sheets, stripePaymentIntentId);

    if (rowNumber) return rowNumber;
    await wait(500 * (attempt + 1));
  }

  throw new Error(`Cannot find order row for payment intent: ${stripePaymentIntentId}`);
}

async function findOrderRowByPaymentIntentId(sheets, stripePaymentIntentId) {
  const firstDataRow = 5;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: HANDLE.googleSheetId,
    range: `'${HANDLE.googleSheetTabName}'!AB${firstDataRow}:AB`,
  });
  const values = response.data.values || [];

  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0] || "").trim() === stripePaymentIntentId) {
      return firstDataRow + index;
    }
  }

  return 0;
}

async function getNextOrderRow(sheets) {
  const firstDataRow = 5;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: HANDLE.googleSheetId,
    range: `'${HANDLE.googleSheetTabName}'!A:AG`,
  });
  const values = response.data.values || [];
  let lastDataRow = firstDataRow - 1;

  values.forEach((row, index) => {
    const rowNumber = index + 1;
    const hasValue = row.some((cell) => String(cell || "").trim() !== "");

    if (rowNumber >= firstDataRow && hasValue) {
      lastDataRow = rowNumber;
    }
  });

  return lastDataRow + 1;
}

async function getSheetsClient() {
  assertGoogleSheetConfig();

  const credentials = JSON.parse(HANDLE.googleServiceAccountJson);

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({
    version: "v4",
    auth,
  });
}

// ============================================================
// WEBHOOK STRIPE DATA HELPERS: NORMALIZE PAYMENT INTENT DATA
// ============================================================

async function getHydratedPaymentIntent(paymentIntentId) {
  return getStripeClient().paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
}

function getCustomerDetailsFromPaymentIntent(paymentIntent) {
  const charge = paymentIntent.latest_charge && typeof paymentIntent.latest_charge === "object"
    ? paymentIntent.latest_charge
    : {};
  const billing = charge.billing_details || {};
  const shipping = paymentIntent.shipping || {};
  const shippingAddress = shipping.address || {};
  const billingAddress = billing.address || {};
  const address = hasAddressValue(shippingAddress) ? shippingAddress : billingAddress;

  return {
    email: cleanText(paymentIntent.receipt_email || billing.email, 160),
    phone: cleanText(shipping.phone || billing.phone, 60),
    shippingName: cleanText(shipping.name || billing.name, 160),
    address1: cleanText(address.line1, 180),
    address2: cleanText(address.line2, 180),
    city: cleanText(address.city, 100),
    state: cleanText(address.state, 100),
    postalCode: cleanText(address.postal_code, 40),
    country: cleanText(address.country, 80),
  };
}

function getTotalsFromPaymentIntent(paymentIntent) {
  const metadata = paymentIntent.metadata || {};
  const total = parseMoney(metadata.total) || fromStripeAmount(paymentIntent.amount_received || paymentIntent.amount);
  const shippingFee = parseMoney(metadata.shipping_fee) || getStripeAmountDetail(paymentIntent, "shipping");
  const tax = parseMoney(metadata.tax) || getStripeAmountDetail(paymentIntent, "tax");
  const subtotal = roundMoney(total - shippingFee - tax);

  return {
    subtotal: parseMoney(metadata.subtotal) || subtotal,
    shippingFee,
    tax,
    total,
    currency: cleanText(metadata.currency || paymentIntent.currency || HANDLE.currency, 20).toLowerCase(),
  };
}

function getStripeAmountDetail(paymentIntent, detailName) {
  const amountDetails = paymentIntent.amount_details || {};
  const detail = amountDetails[detailName];

  if (!detail) return 0;
  if (typeof detail === "number") return fromStripeAmount(detail);
  if (typeof detail.amount === "number") return fromStripeAmount(detail.amount);

  return 0;
}

function hasAddressValue(address) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].some((value) => String(value || "").trim() !== "");
}

// ============================================================
// PRODUCT DATA HELPERS
// ============================================================

let cachedProductIndex = null;
let cachedProductAt = 0;

async function getProductIndex() {
  const fiveMinutes = 5 * 60 * 1000;
  const now = Date.now();

  if (cachedProductIndex && now - cachedProductAt < fiveMinutes) {
    return cachedProductIndex;
  }

  const response = await fetch(HANDLE.productIndexUrl);

  if (!response.ok) {
    throw new Error(`Cannot load product index: ${response.status}`);
  }

  const index = await response.json();
  const products = Array.isArray(index) ? index : Array.isArray(index.products) ? index.products : [];
  const shippingFee = Array.isArray(index) ? 0 : parseMoney(index.shippingfee);

  cachedProductIndex = {
    productById: new Map(products.map((product) => [product.product_id, product])),
    shippingFee,
  };
  cachedProductAt = now;

  return cachedProductIndex;
}

// ============================================================
// SMALL HELPERS
// ============================================================

function createOrderId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const random = createRandomBase36(6);

  return `${HANDLE.orderIdBrandPrefix}-${HANDLE.orderIdCountryCode}${yy}${mm}${random}`;
}

function createRandomBase36(length) {
  const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let value = "";

  for (let index = 0; index < length; index += 1) {
    const randomIndex = crypto.randomInt(characters.length);
    value += characters[randomIndex];
  }

  return value;
}

function getAllowedOrigin(origin) {
  if (!origin) return "";
  if (HANDLE.allowedOrigins.includes("*")) return origin;
  return HANDLE.allowedOrigins.includes(origin) ? origin : "";
}

function assertStripeConfig() {
  if (!HANDLE.stripeSecretKey) {
    throw new Error("Missing required env var: STRIPE_SECRET_KEY");
  }
}

function assertStripeWebhookConfig() {
  if (!HANDLE.stripeWebhookSecret) {
    throw new Error("Missing required env var: STRIPE_WEBHOOK_SECRET");
  }
}

function assertGoogleSheetConfig() {
  [
    ["GOOGLE_SHEET_ID", HANDLE.googleSheetId],
    ["GOOGLE_SERVICE_ACCOUNT_JSON", HANDLE.googleServiceAccountJson],
  ].forEach(([name, value]) => {
    if (!value) throw new Error(`Missing required env var: ${name}`);
  });
}

function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(HANDLE.stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
    });
  }

  return stripeClient;
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

class PublicError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.isPublic = true;
  }
}

function formatSheetDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? roundMoney(amount) : 0;
}

function formatMoney(value) {
  return roundMoney(value).toFixed(2);
}

function toStripeAmount(value) {
  return Math.round(roundMoney(value) * 100);
}

function fromStripeAmount(value) {
  return roundMoney((Number(value) || 0) / 100);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================
// CLOUD RUN FUNCTION ENTRYPOINT
// ============================================================

functions.http("api", app);
