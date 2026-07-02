(function() {
  var categoryIndexPath = '../../product-data/index.json';
  var fallbackCategoryPath = 'c-01';
  var fallbackProductFolder = '01';

  var nameNode = document.getElementById('product-name');
  var priceNode = document.getElementById('product-price');
  var imageNode = document.getElementById('product-image');
  var dropdownSection = document.getElementById('product-dropdown-section');
  var addButton = document.getElementById('product-add-button');
  var currentProductState = null;

  if (!nameNode || !priceNode || !imageNode || !dropdownSection) return;

  initProductPage();
  initAddToCartDropdown();

  function initProductPage() {
    resolveProductLocation()
      .then(function(location) {
        return loadProduct(location.categoryPath, location.productFolder);
      })
      .then(function(productState) {
        renderProduct(productState);
        initProductDropdowns();
        finishPageLoading();
      })
      .catch(function(error) {
        console.error('加载 product page 数据失败：', error);
        initProductDropdowns();
        finishPageLoading();
      });
  }

  function resolveProductLocation() {
    var currentUrl = new URL(window.location.href);
    var requestedCategory = currentUrl.searchParams.get('c') ||
      currentUrl.searchParams.get('category') ||
      currentUrl.searchParams.get('categoryId') ||
      currentUrl.searchParams.get('categoryPath') ||
      '';
    var requestedProduct = currentUrl.searchParams.get('p') ||
      currentUrl.searchParams.get('item') ||
      currentUrl.searchParams.get('productFolder') ||
      '';

    return loadJson(categoryIndexPath)
      .catch(function() {
        return [];
      })
      .then(function(categories) {
        var categoryPath = getCategoryPath(categories, requestedCategory) || fallbackCategoryPath;

        return {
          categoryPath: categoryPath,
          productFolder: normalizeProductFolderId(requestedProduct || fallbackProductFolder)
        };
      });
  }

  function getCategoryPath(categories, requestedCategory) {
    if (!requestedCategory) return '';

    if (/^c-\d+/i.test(requestedCategory)) return requestedCategory;
    if (!Array.isArray(categories)) return '';

    var category = categories.find(function(item) {
      var categoryId = item.category_id || item.id || '';
      var categoryPath = item.category_path || item.path || '';

      return normalizeCategoryToken(categoryId) === normalizeCategoryToken(requestedCategory) ||
        categoryPath === requestedCategory;
    });

    return category ? category.category_path || category.path || '' : '';
  }

  function loadProduct(categoryPath, productFolder) {
    var productBasePath = '../../product-data/' + categoryPath + '/' + productFolder + '/';

    return loadJson(productBasePath + 'index.json')
      .then(function(rawProduct) {
        var product = Array.isArray(rawProduct) ? rawProduct[0] : rawProduct;

        if (!product) throw new Error('Empty product data');

        return {
          categoryPath: categoryPath,
          productFolder: productFolder,
          productBasePath: productBasePath,
          product: product
        };
      });
  }

  function renderProduct(productState) {
    var product = productState.product;
    var price = parsePrice(product.price, product.currency);

    currentProductState = productState;
    nameNode.textContent = product.name || '';
    priceNode.textContent = price.label;
    document.title = (product.name ? product.name + ' - ' : '') + 'Yiichen de Lajii';

    imageNode.alt = product.name || 'product-img';
    setImageWithFallbacks(imageNode, getImageCandidates(productState.productBasePath, product));
    renderDropdowns(product.dropdowns || []);
    renderSizeOptions(getProductSizes(product));
  }

  function initAddToCartDropdown() {
    if (!addButton) return;

    addButton.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();

      if (addButton.classList.contains('is-open')) {
        closeSizeDropdown();
      } else {
        addButton.classList.add('is-active');
        window.setTimeout(openSizeDropdown, isTouchView() ? 120 : 0);
      }
    });

    document.addEventListener('click', function(event) {
      if (
        addButton.classList.contains('is-open') &&
        !addButton.contains(event.target)
      ) {
        closeSizeDropdown();
      }
    });
  }

  function renderSizeOptions(sizes) {
    if (!addButton) return;

    addButton.innerHTML = '';
    addButton.appendChild(createAddLabel('Add'));

    sizes.forEach(function(size) {
      var item = document.createElement('button');

      item.className = 'product-body-size-item';
      item.type = 'button';
      item.textContent = size;
      item.hidden = true;
      item.addEventListener('click', function() {
        item.classList.add('is-active');
        window.setTimeout(function() {
          addProductToCart(size);
          item.classList.remove('is-active');
          closeSizeDropdown(showAddedState);
        }, isTouchView() ? 120 : 0);
      });
      addButton.appendChild(item);
    });

    addButton.hidden = !sizes.length;
  }

  function openSizeDropdown() {
    if (!addButton) return;

    setAddLabel('', true);
    addButton.classList.remove('is-closing', 'is-open-ready');
    addButton.classList.add('is-active', 'is-open');
    Array.prototype.slice.call(addButton.querySelectorAll('.product-body-size-item')).forEach(function(item) {
      item.hidden = false;
    });
    addButton.addEventListener('transitionend', function handleOpenEnd(event) {
      if (event.target !== addButton || event.propertyName !== 'height') return;
      addButton.removeEventListener('transitionend', handleOpenEnd);
      if (addButton.classList.contains('is-open')) addButton.classList.add('is-open-ready');
    });
  }

  function closeSizeDropdown(done) {
    if (!addButton) return;

    addButton.classList.remove('is-open-ready');
    addButton.classList.add('is-closing');
    addButton.offsetHeight;
    addButton.classList.remove('is-active', 'is-open');
    addButton.addEventListener('transitionend', function handleCloseEnd(event) {
      if (event.target !== addButton || event.propertyName !== 'height') return;
      addButton.removeEventListener('transitionend', handleCloseEnd);
      addButton.classList.remove('is-closing');
      Array.prototype.slice.call(addButton.querySelectorAll('.product-body-size-item')).forEach(function(item) {
        item.hidden = true;
      });
      setAddLabel('Add', false);
      if (done) done();
    });
  }

  function addProductToCart(size) {
    if (!currentProductState) return;

    var product = currentProductState.product;
    var price = parsePrice(product.price, product.currency);
    var item = {
      key: [
        product.product_id || product.id || product.name || currentProductState.productFolder,
        currentProductState.productFolder,
        size
      ].join('|'),
      name: (product.name || 'Product').trim(),
      price: price.label.trim(),
      size: size,
      href: window.location.href,
      quantity: 1
    };

    if (window.CartFunction && window.CartFunction.addItem) {
      window.CartFunction.addItem(item);
    } else if (typeof loadCartFunctionScript === 'function') {
      loadCartFunctionScript().then(function(cart) {
        if (cart && cart.addItem) cart.addItem(item);
      });
    }
  }

  function showAddedState() {
    if (!addButton) return;

    setAddLabel('Added', false);
    window.setTimeout(function() {
      fadeAddLabel(function() {
        setAddLabel('Add', false);
      });
    }, 1500);
  }

  function fadeAddLabel(update) {
    var label = addButton && addButton.querySelector('.product-body-add-label');

    if (!label) return;
    label.classList.add('is-text-fading');
    window.setTimeout(function() {
      update();
      label.classList.remove('is-text-fading');
    }, 120);
  }

  function createAddLabel(text) {
    var label = document.createElement('span');

    label.className = 'product-body-add-label';
    label.textContent = text;

    return label;
  }

  function setAddLabel(text, isX) {
    var label = addButton && addButton.querySelector('.product-body-add-label');

    if (!label) return;
    label.textContent = text;
    label.classList.toggle('is-x', !!isX);
  }

  function getProductSizes(product) {
    var size = product.size || product.sizes || [];

    if (Array.isArray(size)) {
      return size.map(cleanSize).filter(Boolean);
    }

    return String(size).split(/[,/|\n]+/).map(cleanSize).filter(Boolean);
  }

  function cleanSize(size) {
    return String(size || '').trim();
  }

  function isTouchView() {
    return window.matchMedia && window.matchMedia('(hover: none)').matches;
  }

  function finishPageLoading() {
    document.documentElement.classList.remove('is-data-loading');
  }

  function renderDropdowns(dropdowns) {
    if (!Array.isArray(dropdowns) || !dropdowns.length) return;

    dropdownSection.innerHTML = '';

    dropdowns.forEach(function(item) {
      var dropdown = document.createElement('details');
      var summary = document.createElement('summary');
      var title = document.createElement('span');
      var icon = document.createElement('span');
      var content = document.createElement('div');
      var inner = document.createElement('div');
      var text = document.createElement('p');

      dropdown.className = 'product-body-dropdown';
      summary.className = 'product-body-dropdown-summary';
      icon.className = 'product-body-dropdown-icon';
      content.className = 'product-body-dropdown-content';
      inner.className = 'product-body-dropdown-content-inner';

      title.textContent = item.title || '';
      text.textContent = item.text || '';

      summary.appendChild(title);
      summary.appendChild(icon);
      inner.appendChild(text);
      content.appendChild(inner);
      dropdown.appendChild(summary);
      dropdown.appendChild(content);
      dropdownSection.appendChild(dropdown);
    });
  }

  function initProductDropdowns() {
    var productDropdowns = Array.prototype.slice.call(
      document.querySelectorAll('.product-body-dropdown')
    ).map(function(dropdown) {
      return {
        dropdown: dropdown,
        summary: dropdown.querySelector('.product-body-dropdown-summary'),
        content: dropdown.querySelector('.product-body-dropdown-content'),
        inner: dropdown.querySelector('.product-body-dropdown-content-inner')
      };
    }).filter(function(item) {
      return item.summary && item.content && item.inner;
    });

    productDropdowns.forEach(function(item) {
      item.dropdown.removeAttribute('open');
      item.content.style.height = '0px';

      item.summary.addEventListener('click', function(event) {
        event.preventDefault();

        if (item.dropdown.hasAttribute('open')) {
          closeProductDropdown(item);
          return;
        }

        productDropdowns.forEach(function(otherItem) {
          if (otherItem !== item && otherItem.dropdown.hasAttribute('open')) {
            closeProductDropdown(otherItem);
          }
        });

        openProductDropdown(item);
      });

      item.content.addEventListener('transitionend', function(event) {
        if (event.propertyName !== 'height') return;

        if (item.content.style.height === '0px') {
          item.dropdown.removeAttribute('open');
        } else {
          item.content.style.height = 'auto';
        }
      });
    });
  }

  function openProductDropdown(item) {
    item.dropdown.setAttribute('open', '');
    item.content.style.height = '0px';

    requestAnimationFrame(function() {
      item.content.style.height = item.inner.scrollHeight + 'px';
    });
  }

  function closeProductDropdown(item) {
    item.content.style.height = item.inner.scrollHeight + 'px';

    requestAnimationFrame(function() {
      item.content.style.height = '0px';
    });
  }

  function getImageCandidates(productBasePath, product) {
    var candidates = [];

    if (Array.isArray(product.images)) {
      product.images.forEach(function(imagePath) {
        if (imagePath) candidates.push(productBasePath + imagePath.replace(/^\/+/, ''));
      });
    }

    for (var index = 1; index <= 8; index += 1) {
      ['webp', 'jpg', 'jpeg', 'png'].forEach(function(extension) {
        candidates.push(productBasePath + 'img/' + index + '.' + extension);
      });
    }

    return unique(candidates);
  }

  function setImageWithFallbacks(image, candidates) {
    var index = 0;

    function next() {
      if (index >= candidates.length) return;

      image.src = candidates[index];
      index += 1;
    }

    image.addEventListener('error', next);
    next();
  }

  function parsePrice(value, currency) {
    var text = String(value || '').trim();
    var numeric = parseFloat(text.replace(/[^0-9.-]/g, ''));
    var currencyMatch = text.match(/[a-zA-Z]+/g);
    var currencyLabel = currencyMatch ? currencyMatch.join(' ') : String(currency || '').trim();
    var label = text;

    if (label && currencyLabel && !currencyMatch) {
      label += ' ' + currencyLabel.toLowerCase();
    }

    return {
      value: Number.isFinite(numeric) ? numeric : 0,
      label: label
    };
  }

  function loadJson(path) {
    return fetch(path)
      .then(function(response) {
        if (!response.ok) {
          throw new Error(response.status + ' ' + response.statusText);
        }

        return response.json();
      });
  }

  function normalizeCategoryToken(value) {
    var text = String(value || '').trim();

    if (/^[0-9]+$/.test(text)) {
      return String(parseInt(text, 10)).padStart(2, '0');
    }

    return text;
  }

  function normalizeProductFolderId(value) {
    var text = String(value || '').trim();

    if (/^[0-9]+$/.test(text)) {
      return String(parseInt(text, 10)).padStart(2, '0');
    }

    return text;
  }

  function unique(values) {
    return values.filter(function(value, index, array) {
      return value && array.indexOf(value) === index;
    });
  }
})();
