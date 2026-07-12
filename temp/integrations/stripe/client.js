const Stripe = require("stripe");
const env = require("../../config/env");
const constants = require("../../config/constants");

let stripeClient = null;

function assertStripeConfig() {
  if (!env.stripeSecretKey) {
    throw new Error("Missing required env var: STRIPE_SECRET_KEY");
  }
}

function assertStripeWebhookConfig() {
  if (!env.stripeWebhookSecret) {
    throw new Error("Missing required env var: STRIPE_WEBHOOK_SECRET");
  }
}

function getStripeClient() {
  assertStripeConfig();

  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey, {
      apiVersion: constants.stripeApiVersion,
    });
  }

  return stripeClient;
}

module.exports = {
  assertStripeConfig,
  assertStripeWebhookConfig,
  getStripeClient,
};
