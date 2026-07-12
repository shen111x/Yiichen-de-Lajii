(function() {
  var storageKey = 'yiichen-cart';
  var checkoutStorageKey = 'yiichen-checkout-session';
  var backendUrl = 'https://ydl-api-436365230181.us-central1.run.app/create-payment-intent';
  var initialized = false;
  var checkoutIsLoading = false;

  function init() {
    if (initialized) return;
    initialized = true;
    renderCart();
    document.addEventListener('click', handleCartClick);
  }

  function handleCartClick(event) {
    var addButton = event.target.closest('[data-cart-add], .category-product-add, .product-body-topbar-right-add-to-cart');
    var deleteButton = event.target.closest('.panel-cart-item-delete');
    var checkoutButton = event.target.closest('.panel-cart-checkout-button');

    if (addButton) {
      event.preventDefault();
      addItem(readProductFromTrigger(addButton));
      return;
    }

    if (deleteButton) {
      var cartItem = deleteButton.closest('.panel-cart-item');
      removeItem(cartItem && cartItem.dataset ? cartItem.dataset.cartKey : '');
      return;
    }

    if (checkoutButton) {
      event.preventDefault();
      startCheckout(checkoutButton);
    }
  }

  function startCheckout(button) {
    var cart = readCart();
    var cartHash = getCartHash(cart);
    var savedCheckout = readCheckoutSession();

    if (!cart.length) return;

    if (
      savedCheckout &&
      savedCheckout.cart_hash === cartHash &&
      savedCheckout.client_secret &&
      savedCheckout.subtotal != null &&
      savedCheckout.total != null &&
      savedCheckout.listed_total != null
    ) {
      window.location.href = getCheckoutHref();
      return;
    }

    if (checkoutIsLoading) return;

    checkoutIsLoading = true;
    setCheckoutButtonLoading(button, true);

    createPaymentIntent(cart)
      .then(function(payload) {
        if (!payload || !payload.client_secret) {
          throw new Error('Missing client_secret from backend.');
        }

        writeCheckoutSession({
          cart_hash: cartHash,
          order_id: payload.order_id || '',
          client_secret: payload.client_secret,
          stripe_payment_intent_id: payload.stripe_payment_intent_id || '',
          subtotal: payload.subtotal,
          shipping_fee: payload.shipping_fee,
          tax: payload.tax,
          total: payload.total,
          listed_subtotal: payload.listed_subtotal,
          listed_total: payload.listed_total,
          currency: payload.currency || 'usd',
          created_at: Date.now()
        });

        window.location.href = getCheckoutHref();
      })
      .catch(function(error) {
        console.error(error);
        window.alert(error.message || 'Unable to start checkout.');
      })
      .finally(function() {
        checkoutIsLoading = false;
        setCheckoutButtonLoading(button, false);
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

  function readProductFromTrigger(trigger) {
    var wrapper = trigger.closest('[data-product-id], .category-product-item, .product-body-main, body');
    var nameNode = wrapper ? wrapper.querySelector('.category-product-name, #product-name') : null;
    var priceNode = wrapper ? wrapper.querySelector('.category-product-price, #product-price') : null;
    var name = trigger.dataset.cartName ||
      (nameNode ? nameNode.textContent : '') ||
      'Product';
    var price = trigger.dataset.cartPrice ||
      (priceNode ? priceNode.textContent : '') ||
      '0';
    var size = trigger.dataset.cartSize || '';
    var variant = trigger.dataset.cartVariant ||
      (wrapper && wrapper.dataset ? wrapper.dataset.productVariant || '' : '');
    var href = trigger.dataset.cartHref ||
      (wrapper && wrapper.href ? wrapper.href : '') ||
      window.location.href;
    var key = [
      wrapper && wrapper.dataset ? wrapper.dataset.productId || trigger.dataset.productId || name : trigger.dataset.productId || name,
      variant,
      wrapper && wrapper.dataset ? wrapper.dataset.productFolder || trigger.dataset.productFolder || '' : trigger.dataset.productFolder || '',
      size
    ].join('|');

    return {
      key: key,
      product_id: wrapper && wrapper.dataset ? wrapper.dataset.productId || trigger.dataset.productId || '' : trigger.dataset.productId || '',
      variant: variant.trim(),
      product_folder: wrapper && wrapper.dataset ? wrapper.dataset.productFolder || trigger.dataset.productFolder || '' : trigger.dataset.productFolder || '',
      category_path: wrapper && wrapper.dataset ? wrapper.dataset.categoryPath || trigger.dataset.categoryPath || '' : trigger.dataset.categoryPath || '',
      name: name.trim(),
      price: price.trim(),
      size: size.trim(),
      href: href,
      quantity: 1
    };
  }

  function addItem(item) {
    var cart = readCart();
    var existing = cart.find(function(cartItem) {
      return cartItem.key === item.key;
    });

    if (existing) {
      existing.quantity += 1;
      hydrateCartItem(existing, item);
    } else {
      cart.push(item);
    }

    writeCart(cart);
    renderCart();
  }

  function removeItem(key) {
    if (!key) return;
    var node = findCartItemNode(key);

    if (node && !node.classList.contains('is-removing')) {
      animateRemoveItem(node, function() {
        removeItemFromStorage(key);
        renderCart();
      });
      return;
    }

    removeItemFromStorage(key);
    renderCart();
  }

  function removeItemFromStorage(key) {
    writeCart(readCart().filter(function(item) {
      return item.key !== key;
    }));
  }

  function hydrateCartItem(target, source) {
    [
      'product_id',
      'variant',
      'product_folder',
      'category_path',
      'currency',
      'href',
      'name',
      'price',
      'size'
    ].forEach(function(field) {
      if (!target[field] && source[field]) target[field] = source[field];
    });
  }

  function findCartItemNode(key) {
    var items = Array.prototype.slice.call(document.querySelectorAll('.panel-cart-item[data-cart-key]'));

    return items.find(function(item) {
      return item.dataset.cartKey === key;
    }) || null;
  }

  function animateRemoveItem(node, done) {
    var deleteButton = node.querySelector('.panel-cart-item-delete');

    if (deleteButton) deleteButton.disabled = true;
    node.style.height = node.offsetHeight + 'px';
    node.style.marginBottom = getComputedStyle(node).marginBottom;
    node.classList.add('is-removing');

    window.setTimeout(function() {
      node.style.height = node.offsetHeight + 'px';
      requestAnimationFrame(function() {
        node.style.height = '0px';
        node.style.marginBottom = '0px';
      });
    }, 160);

    node.addEventListener('transitionend', function handleTransitionEnd(event) {
      if (event.target !== node || event.propertyName !== 'height') return;
      node.removeEventListener('transitionend', handleTransitionEnd);
      done();
    });
  }

  function renderCart() {
    var list = document.querySelector('.panel-cart-list');
    var unit = document.getElementById('panel-cart-item-unit');
    var total = document.querySelector('.panel-cart-checkout-total');

    if (!list || !unit) return;

    list.innerHTML = '';
    list.appendChild(unit);

    readCart().forEach(function(item) {
      list.appendChild(createCartItem(unit, item));
    });

    if (total) total.textContent = 'Cart Total: ' + formatPrice(getCartTotal()) + ' usd';
  }

  function createCartItem(unit, item) {
    var node = unit.cloneNode(true);

    node.removeAttribute('id');
    node.removeAttribute('hidden');
    node.dataset.cartKey = item.key;
    setText(node, '.panel-cart-item-title', item.name);
    setHref(node, '.panel-cart-item-title', item.href);
    setSize(node, item.size);
    setText(node, '.panel-cart-item-qty', item.quantity);
    setText(node, '.panel-cart-item-price', formatPrice(parsePriceValue(item.price)));
    showNode(node, '.panel-cart-item-delete');

    return node;
  }

  function setSize(root, size) {
    var node = root.querySelector('.panel-cart-item-size');
    if (!node) return;

    node.textContent = size ? 'Size: ' + size : '';
    node.hidden = !size;
  }

  function setText(root, selector, text) {
    var node = root.querySelector(selector);
    if (node) node.textContent = text || '';
  }

  function setHref(root, selector, href) {
    var node = root.querySelector(selector);
    if (node) node.href = href || '#';
  }

  function showNode(root, selector) {
    var node = root.querySelector(selector);
    if (node) node.hidden = false;
  }

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || [];
    } catch (error) {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(storageKey, JSON.stringify(cart));
    clearCheckoutSession();
  }

  function getCartTotal() {
    return readCart().reduce(function(sum, item) {
      return sum + parsePriceValue(item.price) * item.quantity;
    }, 0);
  }

  function parsePriceValue(price) {
    return parseFloat(String(price).replace(/[^0-9.-]/g, '')) || 0;
  }

  function formatPrice(value) {
    return (Math.round(value * 100) / 100).toFixed(2);
  }

  function getCheckoutHref() {
    var root = window.siteRoot || getFallbackSiteRoot();
    return root + 'pages/checkout/index.html';
  }

  function readCheckoutSession() {
    try {
      return JSON.parse(sessionStorage.getItem(checkoutStorageKey)) || null;
    } catch (error) {
      return null;
    }
  }

  function writeCheckoutSession(checkoutSession) {
    sessionStorage.setItem(checkoutStorageKey, JSON.stringify(checkoutSession));
  }

  function clearCheckoutSession() {
    sessionStorage.removeItem(checkoutStorageKey);
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

  function setCheckoutButtonLoading(button, isLoading) {
    if (!button) return;

    button.disabled = isLoading;
    button.textContent = isLoading ? 'Loading...' : 'Check Out';
  }

  function getFallbackSiteRoot() {
    var script = document.querySelector('script[src$="js/cart-function.js"]');
    var scriptPath = script ? script.getAttribute('src') : '';

    if (scriptPath) return scriptPath.replace(/js\/cart-function\.js(\?.*)?$/, '');

    return '../../';
  }

  window.CartFunction = {
    init: init,
    addItem: addItem,
    removeItem: removeItem,
    readCart: readCart,
    renderCart: renderCart
  };
})();
