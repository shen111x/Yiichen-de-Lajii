const express = require("express");
const controller = require("./controller");

const webhookRouter = express.Router();
const orderRouter = express.Router();

webhookRouter.post(
  "/stripe-webhook",
  express.raw({
    type: "application/json",
    verify: (req, res, buffer) => {
      req.stripeRawBody = buffer;
    },
  }),
  controller.stripeWebhook
);

orderRouter.post("/create-payment-intent", controller.createPaymentIntent);
orderRouter.post("/update-payment-intent-tax", controller.updatePaymentIntentTax);
orderRouter.post("/order-shipped-email", controller.sendShippedOrderEmail);

module.exports = { webhookRouter, orderRouter };
