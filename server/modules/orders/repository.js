const env = require("../../config/env");
const constants = require("../../config/constants");
const { getSheetsClient } = require("../../integrations/sheets/client");
const { PublicError } = require("../../shared/errors");
const {
  cleanText,
  formatMoney,
  parseMoney,
  wait,
} = require("../../shared/utils");

const FIRST_DATA_ROW = 5;

async function appendFirstStepOrder(order) {
  const sheets = await getSheetsClient();
  const startRow = await getNextOrderRow(sheets);
  const rows = order.items.map((item, index) => {
    const isFirstItemRow = index === 0;

    return [
      isFirstItemRow ? order.orderId : "",
      isFirstItemRow ? order.timeOrdered : "",
      isFirstItemRow ? order.notes || "" : "",
      "",
      isFirstItemRow ? order.orderStatus : "",
      item.product_name,
      item.product_id,
      item.variant,
      item.size,
      item.qty,
      formatMoney(item.unit_price),
      "",
      "", "", "", "",
      "",
      "", "", "", "", "", "", "", "", "",
      "",
      isFirstItemRow ? order.stripePaymentIntentId : "",
      "", "", "", "", "",
    ];
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `'${env.googleSheetTabName}'!A${startRow}:AG${startRow + rows.length - 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

async function updatePaidOrder(order) {
  const sheets = await getSheetsClient();
  const rowNumber = await findOrderRowByPaymentIntentIdWithRetry(
    sheets,
    order.stripePaymentIntentId
  );

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `'${env.googleSheetTabName}'!E${rowNumber}`,
          values: [[order.orderStatus]],
        },
        {
          range: `'${env.googleSheetTabName}'!M${rowNumber}`,
          values: [[constants.paidShippingStatus]],
        },
        {
          range: `'${env.googleSheetTabName}'!P${rowNumber}`,
          values: [["no"]],
        },
        {
          range: `'${env.googleSheetTabName}'!R${rowNumber}:Z${rowNumber}`,
          values: [[
            order.customer.email,
            order.customer.phone,
            order.customer.shippingName,
            order.customer.address1,
            order.customer.address2,
            order.customer.city,
            order.customer.state,
            order.customer.postalCode,
            order.customer.country,
          ]],
        },
        {
          range: `'${env.googleSheetTabName}'!AC${rowNumber}:AG${rowNumber}`,
          values: [[
            formatMoney(order.totals.subtotal),
            formatMoney(order.totals.shippingFee),
            formatMoney(order.totals.tax),
            formatMoney(order.totals.total),
            order.totals.currency,
          ]],
        },
      ],
    },
  });

  return {
    orderId: await getOrderId(sheets, rowNumber),
    items: await getOrderItems(sheets, rowNumber),
  };
}

async function getShippedOrderEmailDetails(orderId) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${env.googleSheetTabName}'!A${FIRST_DATA_ROW}:A`,
  });
  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => cleanText(row[0], 120) === orderId);

  if (rowIndex < 0) throw new PublicError(404, "Order was not found.");

  const rowNumber = rowIndex + FIRST_DATA_ROW;
  const emailResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${env.googleSheetTabName}'!R${rowNumber}`,
  });
  const email = cleanText(emailResponse.data.values?.[0]?.[0], 160);
  if (!email) throw new Error(`Order ${orderId} has no customer email in Sheet.`);

  return { orderId, email };
}

async function getOrderId(sheets, rowNumber) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${env.googleSheetTabName}'!A${rowNumber}`,
  });

  return cleanText(response.data.values?.[0]?.[0], 120);
}

async function getOrderItems(sheets, rowNumber) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${env.googleSheetTabName}'!A${rowNumber}:K${rowNumber + 49}`,
  });
  const rows = response.data.values || [];
  const items = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (index > 0 && cleanText(row[0], 120)) break;
    if (!cleanText(row[5], 160)) continue;

    items.push({
      product_name: cleanText(row[5], 160),
      variant: cleanText(row[7], 80),
      size: cleanText(row[8], 40),
      qty: Number(row[9]) || 1,
      unit_price: parseMoney(row[10]),
    });
  }

  return items;
}

async function findOrderRowByPaymentIntentIdWithRetry(sheets, paymentIntentId) {
  const retryCount = 6;

  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    const rowNumber = await findOrderRowByPaymentIntentId(sheets, paymentIntentId);
    if (rowNumber) return rowNumber;
    await wait(500 * (attempt + 1));
  }

  throw new Error(`Cannot find order row for payment intent: ${paymentIntentId}`);
}

async function findOrderRowByPaymentIntentId(sheets, paymentIntentId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${env.googleSheetTabName}'!AB${FIRST_DATA_ROW}:AB`,
  });
  const values = response.data.values || [];

  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0] || "").trim() === paymentIntentId) {
      return FIRST_DATA_ROW + index;
    }
  }

  return 0;
}

async function getNextOrderRow(sheets) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${env.googleSheetTabName}'!A:AG`,
  });
  const values = response.data.values || [];
  let lastDataRow = FIRST_DATA_ROW - 1;

  values.forEach((row, index) => {
    const rowNumber = index + 1;
    const hasValue = row.some((cell) => String(cell || "").trim() !== "");
    if (rowNumber >= FIRST_DATA_ROW && hasValue) lastDataRow = rowNumber;
  });

  return lastDataRow + 1;
}

module.exports = {
  appendFirstStepOrder,
  updatePaidOrder,
  getShippedOrderEmailDetails,
};
