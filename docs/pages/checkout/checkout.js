(function() {
  var cartStorageKey = 'yiichen-cart';
  var checkoutStorageKey = 'yiichen-checkout-session';
  var taxEndpoint = 'https://ydl-api-436365230181.us-central1.run.app/update-payment-intent-tax';
  var stripePublishableKey = 'pk_test_51TpisICZ9f6B7AFUzBiftI8cq8GNNy1JXTK6I724gNc5nR3bTyFYxTpDHP2yq4n1cPi8xLiDjxlYOLh8FZC9rWyu0046QGVfVF';
  var expressMethodOrder = ['applePay', 'googlePay', 'link', 'amazonPay', 'paypal', 'klarna'];
  var expressMethodLabels = {
    applePay: 'ApplePay',
    googlePay: 'GooglePay',
    link: 'Link',
    amazonPay: 'AmazonPay',
    paypal: 'Paypal',
    cashApp: 'CashApp',
    afterpayClearpay: 'AfterPay',
    affirm: 'Affirm',
    klarna: 'Klarna'
  };

  var statusNode = document.getElementById('checkout-status');
  var paymentForm = document.getElementById('payment-form');
  var submitButton = document.getElementById('payment-submit');
  var paymentMessageNode = document.getElementById('payment-message');
  var cardElementNode = document.getElementById('card-element');
  var expressWrapper = document.getElementById('express-checkout-wrapper');
  var expressNode = document.getElementById('express-checkout-element');
  var billingSameCheckbox = document.getElementById('billing-same-as-shipping');
  var billingAddressFields = document.getElementById('billing-address-fields');
  var subtotalNode = document.getElementById('checkout-subtotal');
  var taxNode = document.getElementById('checkout-tax');
  var totalNode = document.getElementById('checkout-total');
  var currencyNode = document.getElementById('checkout-currency');
  var expressSelector = document.getElementById('express-selector');

  var stripe = null;
  var cardElements = null;
  var cardElement = null;
  var expressCheckoutElement = null;
  var selectedExpressMethod = '';
  var availableExpressMethods = {};
  var expressAvailabilityResolved = false;
  var confirmingStatusTimer = null;
  var activeCart = [];
  var activeCheckoutSession = null;
  var taxRequestTimer = null;
  var taxAddressRevision = 0;
  var lastTaxRequestKey = '';
  var lastTaxResult = null;
  var pendingTaxRequest = null;
  var pendingTaxRequestKey = '';
  var pendingTaxRequestRevision = -1;

  initCheckout();

  function initCheckout() {
    var cart = readCart();
    var checkoutSession = readCheckoutSession();

    activeCart = cart;
    activeCheckoutSession = checkoutSession;
    renderUntaxedTotals();
    initBillingToggle();
    renderExpressSelector();

    if (!cart.length) {
      setStatus('Cart is empty.');
      if (submitButton) submitButton.disabled = true;
      return;
    }

    if (!checkoutSession || !checkoutSession.client_secret) {
      setStatus('Checkout session missing. Go back to cart and click Check Out.');
      if (submitButton) submitButton.disabled = true;
      return;
    }

    if (checkoutSession.cart_hash !== getCartHash(cart)) {
      setStatus('Cart changed. Go back to cart and click Check Out again.');
      if (submitButton) submitButton.disabled = true;
      return;
    }

    if (!window.Stripe) {
      setStatus('Stripe.js did not load.');
      return;
    }

    stripe = Stripe(stripePublishableKey);

    mountCardElement();
    initTaxCalculation();
    initExpressSelector(checkoutSession.client_secret);
    detectExpressAvailability(checkoutSession.client_secret);

    if (paymentForm) {
      paymentForm.addEventListener('submit', function(event) {
        event.preventDefault();
        confirmCardPayment(checkoutSession.client_secret);
      });
    }

    setStatus('');
  }

  function initBillingToggle() {
    if (!billingSameCheckbox || !billingAddressFields) return;

    billingSameCheckbox.addEventListener('change', renderBillingAddressFields);
    renderBillingAddressFields();
  }

  function renderBillingAddressFields() {
    var isOpen = billingSameCheckbox && !billingSameCheckbox.checked;

    if (!billingAddressFields) return;

    billingAddressFields.classList.toggle('is-open', !!isOpen);
    billingAddressFields.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }

  function mountCardElement() {
    if (!stripe || !cardElementNode) return;

    cardElements = stripe.elements();

    cardElement = cardElements.create('card', {
      hidePostalCode: true,
      style: {
        base: {
          color: '#000000',
          fontFamily: 'delajiisans, Helvetica, sans-serif',
          fontSize: getCheckoutFontSize(),
          '::placeholder': {
            color: 'rgba(0, 0, 0, 0.32)'
          },
          iconColor: 'rgba(0, 0, 0, 0.18)'
        },
        invalid: {
          color: '#000000',
          iconColor: '#000000'
        }
      }
    });

    cardElement.mount('#card-element');
  }

  function initExpressSelector(clientSecret) {
    if (!expressSelector) return;

    expressSelector.addEventListener('click', function(event) {
      var button = event.target.closest('.checkout-express-button');
      var method;

      if (!button || !expressSelector.contains(button)) return;

      method = button.dataset.expressMethod || '';

      if (method && !isExpressMethodAvailable(method)) return;

      setPaymentMessage('');
      selectedExpressMethod = method;
      renderExpressSelector();
      mountSelectedExpressCheckout(clientSecret);
    });
  }

  function detectExpressAvailability(clientSecret) {
    var detectorNode = document.getElementById('express-checkout-detector');
    var detectorElements;
    var detector;

    if (!stripe || !detectorNode) return;

    detectorElements = stripe.elements({
      clientSecret: clientSecret,
      appearance: getStripeElementAppearance()
    });
    detector = detectorElements.create('expressCheckout', {
      paymentMethods: getDetectorPaymentMethods(),
      paymentMethodOrder: expressMethodOrder
    });

    detector.on('availablepaymentmethodschange', function(event) {
      availableExpressMethods = event.paymentMethods || {};
      expressAvailabilityResolved = true;
      if (selectedExpressMethod && !isExpressMethodAvailable(selectedExpressMethod)) selectedExpressMethod = '';
      renderExpressSelector();
      detector.unmount();
    });

    detector.mount('#express-checkout-detector');
  }

  function mountSelectedExpressCheckout(clientSecret) {
    var expressElements;
    var paymentMethods = getDefaultPaymentMethods();

    if (!stripe || !expressNode || !expressWrapper) return;

    if (expressCheckoutElement) {
      expressCheckoutElement.unmount();
      expressCheckoutElement = null;
    }

    expressNode.innerHTML = '';

    if (!selectedExpressMethod) {
      expressWrapper.classList.remove('is-open');
      revealSubmitButton();
      return;
    }

    paymentMethods[selectedExpressMethod] = getSelectedExpressMode(selectedExpressMethod);
    hideSubmitButton();

    expressElements = stripe.elements({
      clientSecret: clientSecret,
      appearance: getStripeElementAppearance()
    });

    expressCheckoutElement = expressElements.create('expressCheckout', {
      paymentMethods: paymentMethods,
      paymentMethodOrder: [selectedExpressMethod],
      buttonHeight: 40
    });

    expressCheckoutElement.on('confirm', function() {
      var shipping = getShippingDetails();
      var billing = getBillingDetails(shipping);

      scheduleConfirmingStatus();

      ensureTaxCalculated().then(function() {
        return expressElements.submit();
      }).then(function(result) {
        if (result.error) {
          handleStripeResult(result);
          return;
        }

        return stripe.confirmPayment({
          elements: expressElements,
          confirmParams: {
            return_url: getReturnUrl(),
            shipping: {
              name: shipping.name || billing.name || '',
              phone: shipping.phone || '',
              address: shipping.address
            },
            receipt_email: shipping.email || billing.email || ''
          },
          redirect: 'if_required'
        });
      }).then(handleStripeResult).catch(handleTaxError);
    });

    expressCheckoutElement.mount('#express-checkout-element');
    expressWrapper.classList.add('is-open');
  }

  function hideSubmitButton() {
    if (!submitButton) return;

    submitButton.classList.remove('is-revealing');
    submitButton.style.display = 'none';
  }

  function revealSubmitButton() {
    if (!submitButton) return;

    submitButton.style.display = '';
    submitButton.classList.remove('is-revealing');
    void submitButton.offsetWidth;
    submitButton.classList.add('is-revealing');
  }

  function getDefaultPaymentMethods() {
    return getExpressMethodKeys().reduce(function(methods, method) {
      methods[method] = 'never';
      return methods;
    }, {});
  }

  function getDetectorPaymentMethods() {
    return expressMethodOrder.reduce(function(methods, method) {
      methods[method] = 'auto';
      return methods;
    }, {});
  }

  function getSelectedExpressMode(method) {
    return method === 'applePay' || method === 'googlePay' ? 'always' : 'auto';
  }

  function getStripeElementAppearance() {
    return {
      variables: {
        borderRadius: '0px',
        buttonBorderRadius: '0px'
      }
    };
  }

  function renderExpressSelector() {
    var methods = getAvailableExpressMethodKeys();

    if (!expressSelector) return;

    expressSelector.innerHTML = '';
    expressSelector.appendChild(createExpressSelectorButton('', 'Cards'));

    methods.forEach(function(method) {
      expressSelector.appendChild(createExpressSelectorButton(method, getExpressMethodLabel(method)));
    });
  }

  function createExpressSelectorButton(method, label) {
    var button = document.createElement('button');

    button.className = 'checkout-express-button';
    button.type = 'button';
    button.dataset.expressMethod = method;
    button.textContent = label;
    button.classList.toggle('is-selected', selectedExpressMethod === method);
    button.disabled = !!method && !isExpressMethodAvailable(method);

    return button;
  }

  function getAvailableExpressMethodKeys() {
    if (!expressAvailabilityResolved) return [];

    return getExpressMethodKeys().filter(function(method) {
      return isExpressMethodAvailable(method);
    });
  }

  function getExpressMethodKeys() {
    var detectedMethods = Object.keys(availableExpressMethods || {});
    var methods = expressMethodOrder.slice();

    detectedMethods.forEach(function(method) {
      if (methods.indexOf(method) === -1) methods.push(method);
    });

    return methods;
  }

  function getExpressMethodLabel(method) {
    return expressMethodLabels[method] || method.replace(/([A-Z])/g, ' $1').replace(/^./, function(letter) {
      return letter.toUpperCase();
    });
  }

  function isExpressMethodAvailable(method) {
    if (!method) return true;
    if (!expressAvailabilityResolved) return false;

    return !!availableExpressMethods[method];
  }

  function confirmCardPayment(clientSecret) {
    var shipping = getShippingDetails();
    var billing = getBillingDetails(shipping);

    if (!stripe || !cardElement) return;

    if (submitButton) submitButton.disabled = true;
    scheduleConfirmingStatus();

    ensureTaxCalculated().then(function() {
      return stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: billing
        },
        shipping: {
          name: shipping.name || billing.name || '',
          phone: shipping.phone || '',
          address: shipping.address
        },
        return_url: getReturnUrl(),
        receipt_email: shipping.email || billing.email || ''
      });
    }).then(function(result) {
      if (submitButton) submitButton.disabled = false;
      handleStripeResult(result);
    }).catch(function(error) {
      if (submitButton) submitButton.disabled = false;
      handleTaxError(error);
    });
  }

  function handleStripeResult(result) {
    var paymentIntent = result && result.paymentIntent;
    var status = paymentIntent && paymentIntent.status ? paymentIntent.status : '';

    clearConfirmingStatusTimer();

    if (result && result.error) {
      setStatus('');
      setPaymentMessage(result.error.message || 'Payment failed. Please try again.');
      return;
    }

    if (status === 'succeeded' || status === 'processing') {
      setPaymentMessage('');
      setStatus(status === 'succeeded' ? 'Payment submitted.' : 'Payment processing.');
      window.location.href = getReturnUrl();
      return;
    }

    if (status) {
      setStatus('');
      setPaymentMessage('Payment is not complete yet. Status: ' + status + '.');
      return;
    }

    setStatus('');
    setPaymentMessage('Payment confirmation did not return a completed payment. Please try again.');
    console.warn('Unexpected Stripe confirmation result:', result);
  }

  function getShippingDetails() {
    return {
      name: getInputValue('shipping-name'),
      email: getInputValue('shipping-email'),
      phone: getInputValue('shipping-phone'),
      address: {
        line1: getInputValue('shipping-address-1'),
        line2: getInputValue('shipping-address-2'),
        city: getInputValue('shipping-city'),
        state: getInputValue('shipping-state'),
        postal_code: getInputValue('shipping-postal-code'),
        country: normalizeCountry(getInputValue('shipping-country'))
      }
    };
  }

  function getBillingDetails(shipping) {
    if (billingSameCheckbox && billingSameCheckbox.checked) {
      return {
        name: shipping.name,
        email: shipping.email,
        phone: shipping.phone,
        address: shipping.address
      };
    }

    return {
      name: getInputValue('billing-name'),
      email: shipping.email,
      phone: shipping.phone,
      address: {
        line1: getInputValue('billing-address-1'),
        line2: getInputValue('billing-address-2'),
        city: getInputValue('billing-city'),
        state: getInputValue('billing-state'),
        postal_code: getInputValue('billing-postal-code'),
        country: normalizeCountry(getInputValue('billing-country'))
      }
    };
  }

  function getInputValue(id) {
    var node = document.getElementById(id);
    return node ? node.value.trim() : '';
  }

  function normalizeCountry(value) {
    var country = String(value || '').trim();

    if (!country) return 'US';
    if (country.length === 2) return country.toUpperCase();

    return country;
  }

  function initTaxCalculation() {
    var postalCodeNode = document.getElementById('shipping-postal-code');

    if (postalCodeNode) postalCodeNode.addEventListener('input', scheduleTaxCalculation);
  }

  function scheduleTaxCalculation() {
    var shipping;

    window.clearTimeout(taxRequestTimer);
    taxAddressRevision += 1;
    lastTaxRequestKey = '';
    lastTaxResult = null;
    renderUntaxedTotals();

    shipping = getShippingDetails();
    if (!isTaxAddressReady(shipping.address)) return;

    taxRequestTimer = window.setTimeout(function() {
      requestTaxCalculation(false).catch(function(error) {
        if (error && error.isStaleTaxRequest) return;
        setStatus('');
        setPaymentMessage(error.message || 'Unable to calculate tax for this address.');
      });
    }, 500);
  }

  function ensureTaxCalculated() {
    var shipping = getShippingDetails();

    window.clearTimeout(taxRequestTimer);

    if (!isTaxAddressReady(shipping.address)) {
      return Promise.reject(new Error('Enter a valid shipping ZIP or postal code before paying.'));
    }

    return requestTaxCalculation(true, true);
  }

  function requestTaxCalculation(showStatus, forceRefresh) {
    var shipping = getShippingDetails();
    var requestKey = JSON.stringify({
      cart_hash: getCartHash(activeCart),
      shipping: shipping
    });
    var requestRevision;

    if (!forceRefresh && lastTaxRequestKey === requestKey && lastTaxResult) {
      return Promise.resolve(lastTaxResult);
    }
    if (
      pendingTaxRequestKey === requestKey &&
      pendingTaxRequestRevision === taxAddressRevision &&
      pendingTaxRequest
    ) {
      return pendingTaxRequest;
    }
    if (pendingTaxRequest) {
      return pendingTaxRequest.catch(function() {}).then(function() {
        return requestTaxCalculation(showStatus, forceRefresh);
      });
    }

    requestRevision = taxAddressRevision;
    lastTaxRequestKey = requestKey;
    pendingTaxRequestKey = requestKey;
    pendingTaxRequestRevision = requestRevision;
    if (showStatus) setStatus('Calculating tax...');
    setPaymentMessage('');

    pendingTaxRequest = fetch(taxEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        stripe_payment_intent_id: activeCheckoutSession.stripe_payment_intent_id,
        items: activeCart.map(function(item) {
          return {
            product_id: item.product_id,
            variant: item.variant || '',
            size: item.size || '',
            qty: item.quantity || 1
          };
        }),
        shipping: shipping
      })
    }).then(function(response) {
      return response.json().then(function(payload) {
        if (!response.ok) {
          throw new Error(payload && payload.error ? payload.error : 'Unable to calculate tax.');
        }
        return payload;
      });
    }).then(function(payload) {
      if (requestRevision !== taxAddressRevision) {
        var staleError = new Error('Stale tax response.');
        staleError.isStaleTaxRequest = true;
        throw staleError;
      }

      lastTaxResult = payload;
      pendingTaxRequest = null;
      pendingTaxRequestKey = '';
      pendingTaxRequestRevision = -1;
      updateStoredTotals(payload);
      renderTotals(payload);
      setStatus('');
      return payload;
    }).catch(function(error) {
      pendingTaxRequest = null;
      pendingTaxRequestKey = '';
      pendingTaxRequestRevision = -1;
      if (requestRevision === taxAddressRevision) lastTaxRequestKey = '';
      throw error;
    });

    return pendingTaxRequest;
  }

  function isTaxAddressReady(address) {
    var country = String(address.country || '').toUpperCase();
    var postalCode = String(address.postal_code || '').toUpperCase();

    if (!/^[A-Z]{2}$/.test(country)) return false;
    if (country === 'US') return /^\d{5}(-\d{4})?$/.test(postalCode);
    return /^[A-Z0-9][A-Z0-9 -]{1,10}[A-Z0-9]$/.test(postalCode);
  }

  function renderUntaxedTotals() {
    renderTotals({
      subtotal: activeCheckoutSession && activeCheckoutSession.listed_subtotal,
      tax: '0.00',
      total: activeCheckoutSession && activeCheckoutSession.listed_total,
      currency: activeCheckoutSession && activeCheckoutSession.currency
    });
  }

  function renderTotals(totals) {
    if (subtotalNode) subtotalNode.textContent = formatPrice(totals.subtotal || 0);
    if (taxNode) taxNode.textContent = formatPrice(totals.tax || 0);
    if (totalNode) totalNode.textContent = formatPrice(totals.total || 0);
    if (currencyNode) currencyNode.textContent = String(totals.currency || 'usd').toLowerCase();
  }

  function updateStoredTotals(totals) {
    if (!activeCheckoutSession) return;

    activeCheckoutSession.subtotal = totals.subtotal;
    activeCheckoutSession.shipping_fee = totals.shipping_fee;
    activeCheckoutSession.tax = totals.tax;
    activeCheckoutSession.total = totals.total;
    activeCheckoutSession.currency = totals.currency || 'usd';
    sessionStorage.setItem(checkoutStorageKey, JSON.stringify(activeCheckoutSession));
  }

  function handleTaxError(error) {
    clearConfirmingStatusTimer();
    setStatus('');
    setPaymentMessage(error && error.message ? error.message : 'Unable to calculate tax.');
  }

  function formatPrice(value) {
    return (Math.round(value * 100) / 100).toFixed(2);
  }

  function getCheckoutFontSize() {
    var probe = document.createElement('span');
    var fontSize;

    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.fontSize = 'var(--product-info-font-size)';
    probe.textContent = '0';
    document.body.appendChild(probe);
    fontSize = window.getComputedStyle(probe).fontSize;
    document.body.removeChild(probe);

    return /^[0-9.]+px$/.test(fontSize) ? fontSize : '14px';
  }

  function getReturnUrl() {
    return window.location.origin + window.location.pathname.replace(/[^/]*$/, 'checkout-success.html');
  }

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(cartStorageKey)) || [];
    } catch (error) {
      return [];
    }
  }

  function readCheckoutSession() {
    try {
      return JSON.parse(sessionStorage.getItem(checkoutStorageKey)) || null;
    } catch (error) {
      return null;
    }
  }

  function getCartHash(cart) {
    return JSON.stringify(cart.map(function(item) {
      return {
        product_id: item.product_id,
        variant: item.variant || '',
        size: item.size || '',
        qty: item.quantity || 1
      };
    }));
  }

  function setStatus(message) {
    if (statusNode) statusNode.textContent = message || '';
  }

  function scheduleConfirmingStatus() {
    clearConfirmingStatusTimer();
    confirmingStatusTimer = window.setTimeout(function() {
      confirmingStatusTimer = null;
      setStatus('Confirming payment...');
    }, 350);
  }

  function clearConfirmingStatusTimer() {
    if (!confirmingStatusTimer) return;

    window.clearTimeout(confirmingStatusTimer);
    confirmingStatusTimer = null;
  }

  function setPaymentMessage(message) {
    if (!paymentMessageNode) return;

    paymentMessageNode.textContent = message || '';
    paymentMessageNode.classList.toggle('is-open', !!message);
  }
})();
