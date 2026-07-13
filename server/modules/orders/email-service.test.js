const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderOrderSuccessEmail } = require("./email-service");

test("renders discount, payment details, and four-line shipping address", () => {
  const template = fs.readFileSync(
    path.join(__dirname, "../../../docs/emails/order-success.html"),
    "utf8"
  );
  const html = renderOrderSuccessEmail(template, {
    orderId: "YDL-TEST-1",
    items: [{
      product_name: "Centered Logo Tee",
      variant: "Default",
      size: "XXL",
      qty: 1,
      unit_price: 107.43,
    }],
    totals: {
      subtotal: 211.42,
      listedSubtotal: 322.29,
      shippingFee: 0,
      tax: 33.54,
      taxRate: "11",
      total: 278.5,
    },
    discount: { amount: 77.33 },
    payment: { method: "applepay", cardBrand: "visa", cardLast4: "0967" },
    customer: {
      shippingName: "Nancy Wang",
      address1: "1837 Tommy Ave",
      address2: "Fl-32 Room-5",
      city: "Los Angeles",
      state: "CA",
      postalCode: "90037",
      country: "US",
    },
  });

  assert.match(html, /Sub Total: 322\.29/);
  assert.match(html, /Discount: -77\.33/);
  assert.match(html, /Tax \(11%\): 33\.54/);
  assert.match(html, /Shipping Fee: 0\.00/);
  assert.match(html, /Applepay Visa 0967/);
  assert.match(html, /<div>Nancy Wang<\/div><div>1837 Tommy Ave, Fl-32 Room-5<\/div>/);
  assert.match(html, /<div>Los Angeles, CA<\/div><div>90037, USA<\/div>/);
  assert.doesNotMatch(html, /{{[A-Z_]+}}/);
});
