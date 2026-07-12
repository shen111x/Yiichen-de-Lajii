const { google } = require("googleapis");
const env = require("../../config/env");

function assertGoogleSheetConfig() {
  [
    ["GOOGLE_SHEET_ID", env.googleSheetId],
    ["GOOGLE_SERVICE_ACCOUNT_JSON", env.googleServiceAccountJson],
  ].forEach(([name, value]) => {
    if (!value) throw new Error(`Missing required env var: ${name}`);
  });
}

async function getSheetsClient() {
  assertGoogleSheetConfig();

  const credentials = JSON.parse(env.googleServiceAccountJson);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

module.exports = { assertGoogleSheetConfig, getSheetsClient };
