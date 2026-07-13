const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getPaymentDetailsFromPaymentIntent,
  getDiscountDetailsFromPaymentIntent,
  getTaxRateFromCalculation,
} = require("./payment-intent-details");

test("extracts wallet, card, charge, and promotion details", () => {
  const paymentIntent = {
    latest_charge: {
      id: "ch_test_123",
      payment_method_details: {
        type: "card",
        card: {
          brand: "Visa",
          last4: "0123",
          wallet: { type: "apple_pay" },
        },
      },
    },
    metadata: {
      discount_amount: "37.50",
      promotion_description: "40% off",
      promotion_code: "IIII0001",
      promotion_code_id: "promo_test_123",
    },
  };

  assert.deepEqual(getPaymentDetailsFromPaymentIntent(paymentIntent), {
    method: "applepay",
    cardBrand: "visa",
    cardLast4: "0123",
    chargeId: "ch_test_123",
  });
  assert.deepEqual(getDiscountDetailsFromPaymentIntent(paymentIntent), {
    amount: 37.5,
    rate: "40%off",
    code: "IIII0001",
    id: "promo_test_123",
  });
});

test("returns card with empty promotion details when no discount was applied", () => {
  const paymentIntent = {
    latest_charge: {
      id: "ch_test_456",
      payment_method_details: {
        type: "card",
        card: { brand: "mastercard", last4: "4242" },
      },
    },
    metadata: {},
  };

  assert.deepEqual(getPaymentDetailsFromPaymentIntent(paymentIntent), {
    method: "card",
    cardBrand: "mastercard",
    cardLast4: "4242",
    chargeId: "ch_test_456",
  });
  assert.deepEqual(getDiscountDetailsFromPaymentIntent(paymentIntent), {
    amount: 0,
    rate: "",
    code: "",
    id: "",
  });
});

test("combines unique Stripe Tax breakdown rates", () => {
  const calculation = {
    tax_breakdown: [
      { tax_rate_details: { country: "US", state: "CA", tax_type: "sales_tax", percentage_decimal: "7.25" } },
      { tax_rate_details: { country: "US", state: "CA", tax_type: "sales_tax", percentage_decimal: "3.75" } },
      { tax_rate_details: { country: "US", state: "CA", tax_type: "sales_tax", percentage_decimal: "7.25" } },
    ],
  };

  assert.equal(getTaxRateFromCalculation(calculation), "11");
});
