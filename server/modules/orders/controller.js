const crypto = require("crypto");
const env = require("../../config/env");
const { PublicError } = require("../../shared/errors");
const { cleanText } = require("../../shared/utils");
const orderService = require("./service");

async function stripeWebhook(req, res) {
  try {
    const payload = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.isBuffer(req.stripeRawBody)
        ? req.stripeRawBody
        : Buffer.isBuffer(req.body)
          ? req.body
          : null;
    const result = await orderService.processStripeWebhook(
      payload,
      req.get("Stripe-Signature") || ""
    );
    res.json(result);
  } catch (error) {
    console.error("Stripe webhook failed:", error);
    res.status(error.statusCode || 400).json({
      ok: false,
      error: error.isPublic ? error.message : "Webhook processing failed.",
    });
  }
}

async function createPaymentIntent(req, res) {
  try {
    res.json(await orderService.createPaymentIntent(req.body));
  } catch (error) {
    console.error(error);
    if (error.cartRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.isPublic ? error.message : "Unable to create payment intent.",
    });
  }
}

async function updatePaymentIntentTax(req, res) {
  try {
    res.json(await orderService.updatePaymentIntentTax(req.body));
  } catch (error) {
    console.error("Tax calculation failed:", error);
    const stripeCode = cleanText(error && error.code, 100);
    const isLocationError = stripeCode === "customer_tax_location_invalid";
    const isTaxSettingsError = [
      "tax_settings_invalid",
      "tax_settings_status_invalid",
    ].includes(stripeCode);

    res.status(error.statusCode || (isLocationError ? 400 : 500)).json({
      ok: false,
      code: stripeCode || "tax_calculation_failed",
      error: error.isPublic
        ? error.message
        : isLocationError
          ? "Stripe could not match this ZIP code to a tax location."
          : isTaxSettingsError
            ? "Stripe Tax settings are not ready."
            : "Unable to calculate tax.",
    });
  }
}

async function sendShippedOrderEmail(req, res) {
  try {
    assertOrderEmailRequestAuthorized(req);
    res.json(await orderService.sendShippedOrderEmail(req.body));
  } catch (error) {
    console.error("Order shipped email failed:", error);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.isPublic ? error.message : "Unable to send order shipped email.",
    });
  }
}

function assertOrderEmailRequestAuthorized(req) {
  if (!env.orderEmailApiKey) {
    throw new Error("Missing required env var: ORDER_EMAIL_API_KEY");
  }

  const authorization = req.get("Authorization") || "";
  const suppliedKey = req.get("X-API-Key") || authorization.replace(/^Bearer\s+/i, "");
  const supplied = Buffer.from(suppliedKey);
  const expected = Buffer.from(env.orderEmailApiKey);

  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new PublicError(401, "Unauthorized.");
  }
}

module.exports = {
  stripeWebhook,
  createPaymentIntent,
  updatePaymentIntentTax,
  sendShippedOrderEmail,
};
