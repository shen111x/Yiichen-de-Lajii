const express = require("express");
const { cors, jsonParserError } = require("./shared/middleware");
const { webhookRouter, orderRouter } = require("./modules/orders/routes");

function createApp() {
  const app = express();

  app.use(cors);
  // Stripe signature verification requires this router before express.json().
  app.use(webhookRouter);
  app.use(express.json({ limit: "20kb" }));
  app.use(jsonParserError);
  app.use(orderRouter);

  return app;
}

module.exports = { createApp };
