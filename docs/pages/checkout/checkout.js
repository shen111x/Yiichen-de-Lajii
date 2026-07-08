(function() {
  var cartStorageKey = 'yiichen-cart';
  var backendUrl = 'https://ydl-api-436365230181.us-central1.run.app/create-payment-intent';
  var stripePublishableKey = 'pk_test_51TpisRE9FD00WisxNzPQrGJ3qUfRCluI6RIZIsxFX9tiRF55IotUzL7WTMREaXC52uN111odOAt1TIHIpWPoVizK00C9caDSey';

  var statusNode = document.getElementById('checkout-status');
  var paymentForm = document.getElementById('payment-form');
  var submitButton = document.getElementById('payment-submit');

  initCheckout();

  function initCheckout() {
    var cart = readCart();

    if (!cart.length) {
      setStatus('Cart is empty.');
      if (submitButton) submitButton.disabled = true;
      return;
    }

    setStatus('Creating payment intent...');

    createPaymentIntent(cart)
      .then(function(payload) {
        if (!payload || !payload.client_secret) {
          throw new Error('Missing client_secret from backend.');
        }

        setStatus('Backend connected. Order: ' + (payload.order_id || 'created'));

        if (!window.Stripe) {
          throw new Error('Stripe.js did not load.');
        }

        return mountStripeCheckout(payload.client_secret);
      })
      .then(function() {
        setStatus('Ready.');
      })
      .catch(function(error) {
        console.error(error);
        setStatus(error.message || 'Checkout failed.');
      });
  }

  function createPaymentIntent(cart) {
    return fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: cart.map(function(item) {
          return {
            product_id: item.product_id,
            variant: item.variant || '',
            size: item.size || '',
            qty: item.quantity || 1
          };
        }),
        notes: ''
      })
    }).then(function(response) {
      return response.json().then(function(payload) {
        if (!response.ok) {
          throw new Error(payload && payload.error ? payload.error : 'Backend request failed.');
        }

        return payload;
      });
    });
  }

  function mountStripeCheckout(clientSecret) {
    var stripe = Stripe(stripePublishableKey);
    var elements = stripe.elements({
      clientSecret: clientSecret
    });

    mountExpressCheckout(stripe, elements);

    elements.create('address', {
      mode: 'shipping',
      defaultValues: {
        name: 'Test Customer',
        address: {
          country: 'US'
        }
      }
    }).mount('#shipping-address-element');

    elements.create('address', {
      mode: 'billing',
      defaultValues: {
        name: 'Test Customer',
        address: {
          country: 'US'
        }
      }
    }).mount('#billing-address-element');

    elements.create('payment', {
      defaultValues: {
        billingDetails: {
          name: 'Test Customer',
          email: 'test@example.com',
          address: {
            country: 'US'
          }
        }
      }
    }).mount('#payment-element');

    if (paymentForm) {
      paymentForm.addEventListener('submit', function(event) {
        event.preventDefault();
        confirmPayment(stripe, elements);
      });
    }
  }

  function mountExpressCheckout(stripe, elements) {
    var expressCheckoutElement = elements.create('expressCheckout');

    expressCheckoutElement.on('confirm', function() {
      elements.submit().then(function(result) {
        if (result.error) {
          setStatus(result.error.message);
          return;
        }

        stripe.confirmPayment({
          elements: elements,
          confirmParams: {
            return_url: getReturnUrl()
          }
        }).then(handleStripeResult);
      });
    });

    expressCheckoutElement.mount('#express-checkout-element');
  }

  function confirmPayment(stripe, elements) {
    if (submitButton) submitButton.disabled = true;
    setStatus('Confirming payment...');

    stripe.confirmPayment({
      elements: elements,
      confirmParams: {
        return_url: getReturnUrl()
      }
    }).then(function(result) {
      if (submitButton) submitButton.disabled = false;
      handleStripeResult(result);
    });
  }

  function handleStripeResult(result) {
    if (result && result.error) {
      setStatus(result.error.message || 'Payment failed.');
      return;
    }

    setStatus('Payment submitted.');
  }

  function getReturnUrl() {
    return window.location.origin + window.location.pathname + '?checkout=return';
  }

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(cartStorageKey)) || [];
    } catch (error) {
      return [];
    }
  }

  function setStatus(message) {
    if (statusNode) statusNode.textContent = message || '';
  }
})();
