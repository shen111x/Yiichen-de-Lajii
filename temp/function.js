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

  googleSheetId: process.env.GOOGLE_SHEET_ID,
  googleSheetTabName: process.env.GOOGLE_SHEET_TAB_NAME || "Orders",
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,

  productIndexUrl:
    process.env.PRODUCT_INDEX_URL ||
    "https://yiichendelajii.com/product-data/search-index.json",

  orderIdBrandPrefix: "YDL",
  orderIdCountryCode: "01",
  firstStepOrderStatus: "abandon",
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
    assertRequiredConfig();

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
        },
      },
      {
        idempotencyKey: `create-intent-${orderId}`,
      }
    );

    // ============================================================
    // GOOGLE SHEET WRITE
    // ============================================================

    await appendFirstStepOrderToSheet({
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

async function appendFirstStepOrderToSheet(order) {
  const sheets = await getSheetsClient();

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

  await sheets.spreadsheets.values.append({
    spreadsheetId: HANDLE.googleSheetId,
    range: `'${HANDLE.googleSheetTabName}'!A:AG`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows,
    },
  });
}

async function getSheetsClient() {
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

function assertRequiredConfig() {
  [
    ["STRIPE_SECRET_KEY", HANDLE.stripeSecretKey],
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

// ============================================================
// CLOUD RUN FUNCTION ENTRYPOINT
// ============================================================

functions.http("api", app);
