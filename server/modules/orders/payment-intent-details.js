const { cleanText, parseMoney } = require("../../shared/utils");

function getLatestCharge(paymentIntent) {
  return paymentIntent.latest_charge && typeof paymentIntent.latest_charge === "object"
    ? paymentIntent.latest_charge
    : {};
}

function getPaymentDetailsFromPaymentIntent(paymentIntent) {
  const charge = getLatestCharge(paymentIntent);
  const methodDetails = charge.payment_method_details || {};
  const card = methodDetails.card || methodDetails.card_present || methodDetails.interac_present || {};
  const wallet = card.wallet || {};

  return {
    method: cleanText(wallet.type || methodDetails.type, 80).replace(/_/g, ""),
    cardBrand: cleanText(card.brand, 40).toLowerCase(),
    cardLast4: cleanText(card.last4, 4),
    chargeId: cleanText(charge.id || paymentIntent.latest_charge, 120),
  };
}

function getDiscountDetailsFromPaymentIntent(paymentIntent) {
  const metadata = paymentIntent.metadata || {};
  const amount = Math.max(0, parseMoney(metadata.discount_amount));

  return {
    amount,
    rate: amount > 0
      ? cleanText(metadata.promotion_description, 120).replace(/\s+/g, "")
      : "",
    code: amount > 0 ? cleanText(metadata.promotion_code, 80) : "",
    id: amount > 0 ? cleanText(metadata.promotion_code_id, 120) : "",
  };
}

module.exports = {
  getLatestCharge,
  getPaymentDetailsFromPaymentIntent,
  getDiscountDetailsFromPaymentIntent,
};
