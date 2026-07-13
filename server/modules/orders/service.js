const crypto = require("crypto");
const env = require("../../config/env");
const constants = require("../../config/constants");
const { PublicError } = require("../../shared/errors");
const {
  cleanText,
  formatSheetDate,
  roundMoney,
  parseMoney,
  formatMoney,
  toStripeAmount,
  fromStripeAmount,
} = require("../../shared/utils");
const {
  assertStripeConfig,
  assertStripeWebhookConfig,
  getStripeClient,
} = require("../../integrations/stripe/client");
const {
  appendFirstStepOrder,
  updatePaidOrder,
  getShippedOrderEmailDetails,
} = require("./repository");
const {
  sendOrderSuccessEmail,
  sendOrderShippedEmail,
} = require("./email-service");
const {
  getLatestCharge,
  getPaymentDetailsFromPaymentIntent,
  getDiscountDetailsFromPaymentIntent,
} = require("./payment-intent-details");

let cachedProductIndex = null;
let cachedProductAt = 0;

async function processStripeWebhook(payload, signature) {
  assertStripeConfig();
  assertStripeWebhookConfig();

  if (!payload) throw new Error("Stripe webhook raw body is unavailable.");

  const event = getStripeClient().webhooks.constructEvent(
    payload,
    signature,
    env.stripeWebhookSecret
  );
  console.log("Stripe webhook received:", event.type, event.id);

  if (event.type !== "payment_intent.succeeded") {
    return { ok: true, ignored: true };
  }

  const paidOrder = await updatePaidOrderFromPaymentIntentId(event.data.object.id);
  await sendOrderSuccessEmail(paidOrder);
  console.log("Stripe webhook order update + email completed:", event.data.object.id);

  return { ok: true, sheet_updated: true, email_sent: true };
}

async function createPaymentIntent({ items = [], notes = "" }) {
  assertStripeConfig();

  if (!Array.isArray(items) || items.length === 0) {
    throw createCartRequestError("Cart is empty.");
  }
  if (items.length > 50) {
    throw createCartRequestError("Cart has too many items.");
  }

  const productIndex = await getProductIndex();
  const normalizedItems = normalizeCartItems(items, productIndex.productById);
  const shippingFee = productIndex.shippingFee;
  const subtotal = roundMoney(
    normalizedItems.reduce((sum, item) => sum + item.unit_price * item.qty, 0)
  );
  const tax = 0;
  const total = roundMoney(subtotal + shippingFee);
  const orderId = createOrderId();
  const paymentIntent = await getStripeClient().paymentIntents.create(
    {
      amount: toStripeAmount(total),
      currency: constants.currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        order_id: orderId,
        order_status: constants.firstStepOrderStatus,
        subtotal: formatMoney(subtotal),
        shipping_fee: formatMoney(shippingFee),
        tax: formatMoney(tax),
        total: formatMoney(total),
        currency: constants.currency,
        cart_signature: createCartSignature(normalizedItems),
      },
    },
    { idempotencyKey: `create-intent-${orderId}` }
  );

  appendFirstStepOrder({
    orderId,
    timeOrdered: formatSheetDate(new Date()),
    notes: cleanText(notes, 500),
    orderStatus: constants.firstStepOrderStatus,
    stripePaymentIntentId: paymentIntent.id,
    items: normalizedItems,
  }).catch((error) => {
    console.error("Background Google Sheet write failed:", error);
  });

  return {
    ok: true,
    order_id: orderId,
    client_secret: paymentIntent.client_secret,
    stripe_payment_intent_id: paymentIntent.id,
    subtotal: formatMoney(subtotal),
    shipping_fee: formatMoney(shippingFee),
    tax: formatMoney(tax),
    total: formatMoney(total),
    listed_subtotal: formatMoney(subtotal),
    listed_total: formatMoney(total),
    currency: constants.currency,
  };
}

async function updatePaymentIntentTax({ stripe_payment_intent_id, items = [], shipping = {} }) {
  assertStripeConfig();

  const paymentIntentId = cleanText(stripe_payment_intent_id, 120);
  const normalizedShipping = normalizeShippingDetails(shipping);

  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    throw new PublicError(400, "Invalid payment intent.");
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new PublicError(400, "Invalid cart.");
  }

  const productIndex = await getProductIndex();
  const normalizedItems = normalizeCartItems(items, productIndex.productById);
  const shippingFee = productIndex.shippingFee;
  const subtotal = roundMoney(
    normalizedItems.reduce((sum, item) => sum + item.unit_price * item.qty, 0)
  );
  const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId);
  assertPaymentIntentCanBeUpdated(paymentIntent, normalizedItems);
  const promotion = getStoredPromotion(paymentIntent.metadata);
  const discount = calculatePromotionDiscount(subtotal, promotion);
  const discountedAmounts = allocateDiscountAcrossItems(normalizedItems, discount);

  const calculationParams = {
    currency: constants.currency,
    line_items: normalizedItems.map((item, index) => ({
      amount: discountedAmounts[index],
      reference: `${index + 1}-${item.product_id}`.slice(0, 200),
      tax_behavior: "inclusive",
      tax_code: item.tax_code,
    })),
    customer_details: {
      address: compactTaxAddress(normalizedShipping.address),
      address_source: "shipping",
    },
  };
  if (shippingFee > 0) {
    calculationParams.shipping_cost = {
      amount: toStripeAmount(shippingFee),
      tax_behavior: "inclusive",
    };
  }

  const requestFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      paymentIntentId,
      normalizedItems,
      shipping: normalizedShipping.address,
      promotionCodeId: promotion.id,
      discount,
    }))
    .digest("hex");
  const calculation = await getStripeClient().tax.calculations.create(
    calculationParams,
    { idempotencyKey: `tax-${requestFingerprint}` }
  );
  const tax = fromStripeAmount(
    Number(calculation.tax_amount_exclusive || 0) +
    Number(calculation.tax_amount_inclusive || 0)
  );
  const total = fromStripeAmount(calculation.amount_total);
  const shippingTax = fromStripeAmount(
    calculation.shipping_cost && calculation.shipping_cost.amount_tax
  );
  const productTax = roundMoney(tax - shippingTax);
  const netSubtotal = roundMoney(subtotal - discount - productTax);
  const netShippingFee = roundMoney(shippingFee - shippingTax);

  await getStripeClient().paymentIntents.update(paymentIntentId, {
    amount: calculation.amount_total,
    hooks: { inputs: { tax: { calculation: calculation.id } } },
    metadata: {
      subtotal: formatMoney(netSubtotal),
      listed_subtotal: formatMoney(subtotal),
      shipping_fee: formatMoney(netShippingFee),
      tax: formatMoney(tax),
      total: formatMoney(total),
      currency: constants.currency,
      tax_calculation_id: calculation.id,
      discount_amount: formatMoney(discount),
    },
  });

  return {
    ok: true,
    subtotal: formatMoney(netSubtotal),
    listed_subtotal: formatMoney(subtotal),
    listed_total: formatMoney(subtotal - discount + shippingFee),
    shipping_fee: formatMoney(netShippingFee),
    tax: formatMoney(tax),
    total: formatMoney(total),
    discount: formatMoney(discount),
    promotion_code: promotion.code,
    promotion_description: promotion.description,
    currency: constants.currency,
  };
}

async function applyPromotionCode({ stripe_payment_intent_id, items = [], promotion_code = "" }) {
  assertStripeConfig();

  const paymentIntentId = cleanText(stripe_payment_intent_id, 120);
  const enteredCode = cleanText(promotion_code, 80);

  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    throw new PublicError(400, "Invalid payment intent.");
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new PublicError(400, "Invalid cart.");
  }

  const productIndex = await getProductIndex();
  const normalizedItems = normalizeCartItems(items, productIndex.productById);
  const subtotal = roundMoney(
    normalizedItems.reduce((sum, item) => sum + item.unit_price * item.qty, 0)
  );
  const shippingFee = productIndex.shippingFee;
  const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId);
  assertPaymentIntentCanBeUpdated(paymentIntent, normalizedItems);

  const promotion = enteredCode
    ? await retrievePromotionCode(enteredCode, paymentIntent, subtotal + shippingFee)
    : emptyPromotion();
  const discount = calculatePromotionDiscount(subtotal, promotion);
  const total = roundMoney(subtotal - discount + shippingFee);

  if (constants.currency === "usd" && toStripeAmount(total) < 50) {
    throw new PublicError(400, "This promo code makes the order total lower than Stripe's 0.50 USD minimum.");
  }

  await getStripeClient().paymentIntents.update(paymentIntentId, {
    amount: toStripeAmount(total),
    metadata: {
      subtotal: formatMoney(subtotal - discount),
      listed_subtotal: formatMoney(subtotal),
      shipping_fee: formatMoney(shippingFee),
      tax: formatMoney(0),
      total: formatMoney(total),
      currency: constants.currency,
      tax_calculation_id: "",
      promotion_code: promotion.code,
      promotion_code_id: promotion.id,
      promotion_description: promotion.description,
      discount_type: promotion.type,
      discount_value: promotion.value,
      discount_amount: formatMoney(discount),
    },
  });

  return {
    ok: true,
    subtotal: formatMoney(subtotal - discount),
    listed_subtotal: formatMoney(subtotal),
    listed_total: formatMoney(total),
    shipping_fee: formatMoney(shippingFee),
    tax: formatMoney(0),
    total: formatMoney(total),
    discount: formatMoney(discount),
    promotion_code: promotion.code,
    promotion_description: promotion.description,
    currency: constants.currency,
  };
}

async function sendShippedOrderEmail({ order_id, carrier, tracking_number }) {
  const orderId = cleanText(order_id, 120);
  const cleanCarrier = cleanText(carrier, 80);
  const trackingNumber = cleanText(tracking_number, 160);

  if (!orderId || !cleanCarrier || !trackingNumber) {
    throw new PublicError(400, "order_id, carrier, and tracking_number are required.");
  }

  const order = await getShippedOrderEmailDetails(orderId);
  await sendOrderShippedEmail({ ...order, carrier: cleanCarrier, trackingNumber });
  return { ok: true, email_sent: true };
}

async function updatePaidOrderFromPaymentIntentId(paymentIntentId) {
  const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
  const order = {
    orderId: cleanText(paymentIntent.metadata.order_id, 120),
    stripePaymentIntentId: paymentIntent.id,
    orderStatus: constants.paidOrderStatus,
    customer: getCustomerDetailsFromPaymentIntent(paymentIntent),
    payment: getPaymentDetailsFromPaymentIntent(paymentIntent),
    discount: getDiscountDetailsFromPaymentIntent(paymentIntent),
    totals: getTotalsFromPaymentIntent(paymentIntent),
  };
  const storedOrder = await updatePaidOrder(order);
  order.items = storedOrder.items;
  if (!order.orderId) order.orderId = storedOrder.orderId;
  return order;
}

function getCustomerDetailsFromPaymentIntent(paymentIntent) {
  const charge = getLatestCharge(paymentIntent);
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
    currency: cleanText(metadata.currency || paymentIntent.currency || constants.currency, 20).toLowerCase(),
  };
}

function getStripeAmountDetail(paymentIntent, detailName) {
  const detail = (paymentIntent.amount_details || {})[detailName];
  if (!detail) return 0;
  if (typeof detail === "number") return fromStripeAmount(detail);
  if (typeof detail.amount === "number") return fromStripeAmount(detail.amount);
  if (typeof detail.total_tax_amount === "number") return fromStripeAmount(detail.total_tax_amount);
  return 0;
}

function hasAddressValue(address) {
  return [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
    .some((value) => String(value || "").trim() !== "");
}

function normalizeCartItems(items, productById) {
  return items.map((cartItem) => {
    const productId = cleanText(cartItem.product_id, 120);
    const product = productById.get(productId);
    const qty = Number(cartItem.qty || 1);

    if (!product) throw new PublicError(400, `Unknown product_id: ${productId}`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new PublicError(400, `Invalid qty for product_id: ${productId}`);
    }
    if (!Number.isFinite(Number(product.price))) {
      throw new Error(`Invalid price for product_id: ${productId}`);
    }

    return {
      product_id: product.product_id,
      product_name: product.name,
      variant: cleanText(cartItem.variant || product.variant || "Default", 80),
      size: cleanText(cartItem.size, 40),
      qty,
      unit_price: Number(product.price),
      tax_code: cleanText(product.tax_code || env.stripeProductTaxCode, 40),
    };
  });
}

function createCartSignature(items) {
  return crypto.createHash("sha256").update(JSON.stringify(items.map((item) => ({
    product_id: item.product_id,
    variant: item.variant,
    size: item.size,
    qty: item.qty,
    unit_price: item.unit_price,
    tax_code: item.tax_code,
  })))).digest("hex");
}

function assertPaymentIntentCanBeUpdated(paymentIntent, normalizedItems) {
  if (!["requires_payment_method", "requires_confirmation"].includes(paymentIntent.status)) {
    throw new PublicError(409, "This payment can no longer be updated.");
  }
  if (
    !paymentIntent.metadata.cart_signature ||
    paymentIntent.metadata.cart_signature !== createCartSignature(normalizedItems)
  ) {
    throw new PublicError(409, "Checkout session expired. Please return to cart and try again.");
  }
}

async function retrievePromotionCode(code, paymentIntent, orderAmount) {
  const stripe = getStripeClient();
  const result = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 10,
    expand: ["data.promotion.coupon"],
  });
  const promotionCode = (result.data || []).find((candidate) => (
    String(candidate.code || "").toLowerCase() === code.toLowerCase()
  ));

  if (!promotionCode) throw new PublicError(400, "Promo code is invalid or inactive.");
  if (promotionCode.customer && promotionCode.customer !== paymentIntent.customer) {
    throw new PublicError(400, "This promo code is not available for this checkout.");
  }

  const restrictions = promotionCode.restrictions || {};
  const hasMinimumAmount = restrictions.minimum_amount !== null &&
    restrictions.minimum_amount !== undefined &&
    Number.isFinite(Number(restrictions.minimum_amount));
  if (restrictions.first_time_transaction) {
    throw new PublicError(400, "This first-order promo code is not supported in guest checkout.");
  }
  if (
    hasMinimumAmount &&
    String(restrictions.minimum_amount_currency || "").toLowerCase() !== constants.currency
  ) {
    throw new PublicError(400, "This promo code currency is not supported.");
  }
  if (
    hasMinimumAmount &&
    String(restrictions.minimum_amount_currency || "").toLowerCase() === constants.currency &&
    toStripeAmount(orderAmount) < Number(restrictions.minimum_amount)
  ) {
    throw new PublicError(
      400,
      `This promo code requires a minimum order of ${formatMoney(fromStripeAmount(restrictions.minimum_amount))} ${constants.currency.toUpperCase()}.`
    );
  }

  const promotion = promotionCode.promotion || {};
  if (promotion.type && promotion.type !== "coupon") {
    throw new PublicError(400, "This promo code type is not supported.");
  }
  let coupon = promotion.coupon || promotionCode.coupon;
  if (typeof coupon === "string") coupon = await stripe.coupons.retrieve(coupon);
  if (!coupon || coupon.valid === false) {
    throw new PublicError(400, "Promo code is invalid or inactive.");
  }
  if (coupon.applies_to && Array.isArray(coupon.applies_to.products) && coupon.applies_to.products.length) {
    throw new PublicError(400, "Product-specific promo codes are not supported in this checkout.");
  }

  const currencyOption = coupon.currency_options && coupon.currency_options[constants.currency];
  const amountOff = Number(currencyOption ? currencyOption.amount_off : coupon.amount_off);
  const amountCurrency = currencyOption
    ? constants.currency
    : String(coupon.currency || "").toLowerCase();
  const percentOff = Number(coupon.percent_off);
  let type;
  let value;
  let description;

  if (Number.isFinite(percentOff) && percentOff > 0) {
    type = "percent";
    value = String(percentOff);
    description = `${formatPercent(percentOff)}% off`;
  } else if (
    Number.isFinite(amountOff) &&
    amountOff > 0 &&
    amountCurrency === constants.currency
  ) {
    type = "amount";
    value = formatMoney(fromStripeAmount(amountOff));
    description = `${value} ${constants.currency.toUpperCase()} off`;
  } else {
    throw new PublicError(400, "This promo code currency is not supported.");
  }

  return {
    id: cleanText(promotionCode.id, 120),
    code: cleanText(promotionCode.code, 80),
    description,
    type,
    value,
  };
}

function getStoredPromotion(metadata = {}) {
  const id = cleanText(metadata.promotion_code_id, 120);
  const code = cleanText(metadata.promotion_code, 80);
  const type = cleanText(metadata.discount_type, 20);
  const value = cleanText(metadata.discount_value, 40);

  if (!id || !code || !["percent", "amount"].includes(type) || !Number.isFinite(Number(value))) {
    return emptyPromotion();
  }
  return {
    id,
    code,
    type,
    value,
    description: cleanText(metadata.promotion_description, 120),
  };
}

function emptyPromotion() {
  return { id: "", code: "", description: "", type: "", value: "" };
}

function calculatePromotionDiscount(subtotal, promotion) {
  if (!promotion.id) return 0;
  const value = Number(promotion.value);
  const discount = promotion.type === "percent"
    ? roundMoney(subtotal * value / 100)
    : roundMoney(value);
  return Math.min(subtotal, Math.max(0, discount));
}

function allocateDiscountAcrossItems(items, discount) {
  const originalAmounts = items.map((item) => toStripeAmount(item.unit_price * item.qty));
  const originalTotal = originalAmounts.reduce((sum, amount) => sum + amount, 0);
  const discountedTotal = originalTotal - Math.min(toStripeAmount(discount), originalTotal);
  let remainingTotal = discountedTotal;

  return originalAmounts.map((amount, index) => {
    const discountedAmount = index === originalAmounts.length - 1
      ? remainingTotal
      : Math.min(amount, Math.round(discountedTotal * amount / originalTotal));
    remainingTotal -= discountedAmount;
    return Math.max(0, discountedAmount);
  });
}

function formatPercent(value) {
  return String(Number(Number(value).toFixed(2)));
}

function normalizeShippingDetails(value) {
  const sourceAddress = value.address || {};
  const country = cleanText(sourceAddress.country, 2).toUpperCase();
  const postalCode = cleanText(sourceAddress.postal_code, 12).toUpperCase();

  if (!/^[A-Z]{2}$/.test(country)) {
    throw new PublicError(400, "Enter a two-letter shipping country code.");
  }
  if (!/^[A-Z0-9][A-Z0-9 -]{1,10}[A-Z0-9]$/.test(postalCode)) {
    throw new PublicError(400, "Enter a valid shipping ZIP or postal code.");
  }
  if (country === "US" && !/^\d{5}(-\d{4})?$/.test(postalCode)) {
    throw new PublicError(400, "Enter a valid US ZIP code.");
  }

  return {
    name: cleanText(value.name, 160),
    email: cleanText(value.email, 160),
    phone: cleanText(value.phone, 60),
    address: {
      line1: cleanText(sourceAddress.line1, 180),
      line2: cleanText(sourceAddress.line2, 180),
      city: cleanText(sourceAddress.city, 100),
      state: cleanText(sourceAddress.state, 100),
      postal_code: postalCode,
      country,
    },
  };
}

function compactTaxAddress(address) {
  const compactAddress = { country: address.country, postal_code: address.postal_code };
  ["line1", "line2", "city", "state"].forEach((field) => {
    if (address[field]) compactAddress[field] = address[field];
  });
  return compactAddress;
}

async function getProductIndex() {
  const fiveMinutes = 5 * 60 * 1000;
  const now = Date.now();
  if (cachedProductIndex && now - cachedProductAt < fiveMinutes) return cachedProductIndex;

  const response = await fetch(env.productIndexUrl);
  if (!response.ok) throw new Error(`Cannot load product index: ${response.status}`);

  const index = await response.json();
  const products = Array.isArray(index) ? index : Array.isArray(index.products) ? index.products : [];
  cachedProductIndex = {
    productById: new Map(products.map((product) => [product.product_id, product])),
    shippingFee: Array.isArray(index) ? 0 : parseMoney(index.shippingfee),
  };
  cachedProductAt = now;
  return cachedProductIndex;
}

function createOrderId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let random = "";
  for (let index = 0; index < 6; index += 1) {
    random += characters[crypto.randomInt(characters.length)];
  }
  return `${constants.orderIdBrandPrefix}-${constants.orderIdCountryCode}${yy}${mm}${random}`;
}

function createCartRequestError(message) {
  const error = new PublicError(400, message);
  error.cartRequestError = true;
  return error;
}

module.exports = {
  processStripeWebhook,
  createPaymentIntent,
  updatePaymentIntentTax,
  applyPromotionCode,
  sendShippedOrderEmail,
};
