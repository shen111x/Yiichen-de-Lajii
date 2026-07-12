const functions = require("@google-cloud/functions-framework");
const { createApp } = require("./app");

const app = createApp();

functions.http("api", app);

module.exports = { app };
