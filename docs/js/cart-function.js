(function() {
  var storageKey = 'yiichen-cart';
  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    renderCart();
    document.addEventListener('click', handleCartClick);
  }

  function handleCartClick(event) {
    var addButton = event.target.closest('[data-cart-add], .category-product-add, .product-body-topbar-right-add-to-cart');
    var deleteButton = event.target.closest('.panel-cart-item-delete');

    if (addButton) {
      event.preventDefault();
      addItem(readProductFromTrigger(addButton));
      return;
    }

    if (deleteButton) {
      removeItem(deleteButton.closest('.panel-cart-item')?.dataset.cartKey || '');
    }
  }

  function readProductFromTrigger(trigger) {
    var wrapper = trigger.closest('[data-product-id], .category-product-item, .product-body-main, body');
    var name = trigger.dataset.cartName ||
      wrapper?.querySelector('.category-product-name, #product-name')?.textContent ||
      'Product';
    var price = trigger.dataset.cartPrice ||
      wrapper?.querySelector('.category-product-price, #product-price')?.textContent ||
      '0';
    var size = trigger.dataset.cartSize || '';
    var href = trigger.dataset.cartHref ||
      wrapper?.href ||
      window.location.href;
    var key = [
      wrapper?.dataset.productId || trigger.dataset.productId || name,
      wrapper?.dataset.productFolder || trigger.dataset.productFolder || '',
      size
    ].join('|');

    return { key: key, name: name.trim(), price: price.trim(), size: size.trim(), href: href, quantity: 1 };
  }

  function addItem(item) {
    var cart = readCart();
    var existing = cart.find(function(cartItem) {
      return cartItem.key === item.key;
    });

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push(item);
    }

    writeCart(cart);
    renderCart();
  }

  function removeItem(key) {
    if (!key) return;
    writeCart(readCart().filter(function(item) {
      return item.key !== key;
    }));
    renderCart();
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

  window.CartFunction = {
    init: init,
    addItem: addItem,
    removeItem: removeItem,
    readCart: readCart,
    renderCart: renderCart
  };
})();
