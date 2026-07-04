(function() {
  var categoryIndexPath = '../../product-data/index.json';
  var productPagePath = '../product/index.html';

  var state = {
    category: null,
    products: [],
    sort: 'default',
    touchRaf: 0,
    touchX: 0,
    touchY: 0,
    touchImageItem: null
  };

  var title = document.getElementById('category-title');
  var sortSelect = document.getElementById('category-sort');
  var productContainer = document.getElementById('category-products');
  var productUnit = document.getElementById('category-product-unit');

  if (!title || !sortSelect || !productContainer || !productUnit) return;

  sortSelect.addEventListener('change', function() {
    state.sort = sortSelect.value;
    renderProducts();
  });

  productContainer.addEventListener('pointerover', function(event) {
    if (event.pointerType === 'mouse') setProductImageVariant(event.target, true);
  });

  productContainer.addEventListener('pointerout', function(event) {
    var item = getProductItem(event.target);

    if (event.pointerType === 'mouse' && (!item || !item.contains(event.relatedTarget))) {
      setProductImageVariant(item, false);
    }
  });

  productContainer.addEventListener('touchmove', handleProductTouchMove, { passive: true });
  productContainer.addEventListener('touchend', resetTouchProductImageVariant, { passive: true });
  productContainer.addEventListener('touchcancel', resetTouchProductImageVariant, { passive: true });

  initCategoryPage();

  function initCategoryPage() {
    loadJson(categoryIndexPath)
      .then(function(categories) {
        state.category = getCurrentCategory(categories);

        if (!state.category) {
          renderEmpty('Category unavailable');
          return;
        }

        title.textContent = state.category.label || '';
        document.title = (state.category.label ? state.category.label + ' - ' : '') + 'Yiichen de Lajii';

        return loadCategoryProducts(state.category);
      })
      .then(function(products) {
        if (!products) return;

        state.products = products;
        renderProducts();
      })
      .catch(function(error) {
        console.error('加载 category page 数据失败：', error);
        renderEmpty('Products unavailable');
      });
  }

  function getCurrentCategory(categories) {
    var currentUrl = new URL(window.location.href);
    var currentCategory = currentUrl.searchParams.get('c') ||
      currentUrl.searchParams.get('category') ||
      currentUrl.searchParams.get('categoryId') ||
      '';

    if (!Array.isArray(categories) || !categories.length) return null;

    if (!currentCategory) return categories[0];

    return categories.find(function(category) {
      var categoryId = category.category_id || category.id || '';
      var categoryPath = category.category_path || category.path || '';

      return normalizeCategoryToken(categoryId) === normalizeCategoryToken(currentCategory) ||
        categoryPath === currentCategory;
    }) || null;
  }

  function loadCategoryProducts(category) {
    var categoryPath = category.category_path || category.path || '';

    if (!categoryPath) return Promise.resolve([]);

    return loadJson('../../product-data/' + categoryPath + '/index.json')
      .catch(function() {
        return [];
      })
      .then(function(manifest) {
        if (!Array.isArray(manifest)) return [];

        return manifest.map(function(product, index) {
          return normalizeCategoryProduct(category, categoryPath, product, index);
        }).filter(Boolean);
      });
  }

  function normalizeCategoryProduct(category, categoryPath, product, index) {
    if (!product || typeof product !== 'object') return null;

    var folderId = normalizeProductFolderId(product.product_folder || product.folder || product.folder_id || product.item || product.id || index + 1);
    var thumbnail = product.thumbnail || '';
    var thumbnail2 = product.thumbnail2 || '';

    return {
      category: category,
      categoryPath: categoryPath,
      folderId: folderId,
      defaultIndex: index,
      id: product.product_id || product.id || folderId,
      name: product.name || '',
      subtitle: product.subtitle || product.sub_title || product.description || '',
      price: parsePrice(product.price, product.currency),
      currency: product.currency || '',
      sizes: getProductSizes(product),
      oddness: parseOddness(product, index),
      thumbnailSrc: getCategoryImageSrc(categoryPath, thumbnail),
      thumbnail2Src: getCategoryImageSrc(categoryPath, thumbnail2),
      href: getProductHref(category, folderId, product)
    };
  }

  function getCategoryImageSrc(categoryPath, imagePath) {
    return imagePath ? '../../product-data/' + categoryPath + '/' + imagePath.replace(/^\/+/, '') : '';
  }

  function getProductHref(category, folderId, product) {
    var categoryId = category.category_id || category.id || '';
    var categoryPath = category.category_path || category.path || '';
    var productId = product.product_id || product.id || folderId;
    var params = new URLSearchParams();

    params.set('c', categoryId || categoryPath);
    params.set('p', folderId);
    params.set('product', productId);
    params.set('item', folderId);

    return productPagePath + '?' + params.toString();
  }

  function renderProducts() {
    var products = getSortedProducts();

    productContainer.innerHTML = '';

    if (!products.length) {
      renderEmpty('No products');
      return;
    }

    products.forEach(function(product) {
      productContainer.appendChild(createProductItem(product));
    });
    finishPageLoading();
  }

  function getSortedProducts() {
    var products = state.products.slice();

    if (state.sort === 'default') {
      products.sort(function(a, b) {
        return a.defaultIndex - b.defaultIndex;
      });
    } else if (state.sort === 'price-asc') {
      products.sort(function(a, b) {
        return a.price.value - b.price.value || a.defaultIndex - b.defaultIndex;
      });
    } else if (state.sort === 'price-desc') {
      products.sort(function(a, b) {
        return b.price.value - a.price.value || a.defaultIndex - b.defaultIndex;
      });
    } else if (state.sort === 'oddness-asc') {
      products.sort(function(a, b) {
        return a.oddness - b.oddness || a.defaultIndex - b.defaultIndex;
      });
    } else if (state.sort === 'oddness-desc') {
      products.sort(function(a, b) {
        return b.oddness - a.oddness || a.defaultIndex - b.defaultIndex;
      });
    }

    return products;
  }

  function createProductItem(product) {
    var item = productUnit.cloneNode(true);
    var links = item.querySelectorAll('.category-product-link, .category-product-text-link');
    var image = item.querySelector('.category-product-image');
    var name = item.querySelector('.category-product-name');
    var subtitle = item.querySelector('.category-product-subtitle');
    var price = item.querySelector('.category-product-price');
    var add = item.querySelector('.category-product-add');
    var buttonBox = item.querySelector('.category-product-button-box');

    item.removeAttribute('id');
    item.removeAttribute('hidden');
    item.dataset.categoryPath = product.categoryPath;
    item.dataset.productFolder = product.folderId;
    item.dataset.productId = product.id;

    links.forEach(function(link) {
      link.href = product.href;
    });

    if (image) {
      image.classList.remove('is-missing');
      image.alt = product.name;
      image.src = product.thumbnailSrc;
      image.dataset.thumbnailSrc = product.thumbnailSrc;
      image.dataset.thumbnail2Src = product.thumbnail2Src;
      preloadImage(product.thumbnail2Src);
    }

    if (name) name.textContent = product.name;
    if (subtitle) {
      subtitle.textContent = product.subtitle;
      subtitle.hidden = !product.subtitle;
    }
    if (price) price.textContent = product.price.label;
    initProductAdd(product, buttonBox, add);

    return item;
  }

  function initProductAdd(product, buttonBox, add) {
    var sizeBox = buttonBox ? buttonBox.querySelector('.category-product-size-box') : null;
    var sizeBottom = buttonBox ? buttonBox.querySelector('.category-product-size-bottom') : null;

    if (!buttonBox || !add || !sizeBox || !sizeBottom) return;

    add.textContent = 'Add +';
    buttonBox.hidden = !product.sizes.length;
    buttonBox.dataset.productId = product.id;
    buttonBox.dataset.productFolder = product.folderId;
    buttonBox.dataset.categoryPath = product.categoryPath;

    sizeBox.setAttribute('aria-hidden', 'true');
    sizeBottom.innerHTML = '';

    product.sizes.forEach(function(size) {
      var sizeItem = document.createElement('button');

      sizeItem.className = 'category-product-size-item';
      sizeItem.type = 'button';
      sizeItem.textContent = size;
      sizeItem.dataset.size = size;
      sizeBottom.appendChild(sizeItem);
    });
  }

  document.addEventListener('click', function(event) {
    var add = event.target.closest('.category-product-add');
    var size = event.target.closest('.category-product-size-item');
    var close = event.target.closest('.category-product-size-close');
    var inside = event.target.closest('.category-product-size-box');

    if (add) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeAllSizeBoxes();
      openSizeBox(add.closest('.category-product-button-box'));
      return;
    }

    if (size) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectProductSize(size);
      return;
    }

    if (close) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resetSizeBox(close.closest('.category-product-button-box'));
      return;
    }

    if (!inside) {
      closeAllSizeBoxes();
    }
  });

  function openSizeBox(buttonBox) {
    var add = buttonBox ? buttonBox.querySelector('.category-product-add') : null;
    var sizeBox = buttonBox ? buttonBox.querySelector('.category-product-size-box') : null;
    var item = buttonBox ? buttonBox.closest('.category-product-item') : null;

    if (!add || !sizeBox) return;

    productContainer.classList.add('is-sizebox-open');
    if (item) item.classList.add('is-sizebox-active');
    add.classList.add('is-hidden');
    sizeBox.classList.add('is-open');
    sizeBox.setAttribute('aria-hidden', 'false');
  }

  function selectProductSize(sizeItem) {
    var buttonBox = sizeItem.closest('.category-product-button-box');
    var product = getProductFromButtonBox(buttonBox);

    if (product) {
      addProductToCart(product, sizeItem.dataset.size || sizeItem.textContent);
    }

    resetSizeBox(buttonBox, 'Added');
  }

  function closeAllSizeBoxes() {
    Array.prototype.slice.call(document.querySelectorAll('.category-product-button-box')).forEach(function(buttonBox) {
      resetSizeBox(buttonBox);
    });
  }

  function resetSizeBox(buttonBox, message) {
    var add = buttonBox ? buttonBox.querySelector('.category-product-add') : null;
    var sizeBox = buttonBox ? buttonBox.querySelector('.category-product-size-box') : null;
    var item = buttonBox ? buttonBox.closest('.category-product-item') : null;

    if (!add || !sizeBox) return;

    sizeBox.classList.remove('is-open');
    sizeBox.setAttribute('aria-hidden', 'true');
    if (item) item.classList.remove('is-sizebox-active');
    syncProductLinkLock();
    add.classList.remove('is-hidden');
    add.textContent = message || 'Add +';

    window.clearTimeout(add.categoryAddedTimer);
    if (message) {
      add.categoryAddedTimer = window.setTimeout(function() {
        add.textContent = 'Add +';
      }, 1500);
    }
  }

  function syncProductLinkLock() {
    var hasOpenSizeBox = !!productContainer.querySelector('.category-product-size-box.is-open');

    productContainer.classList.toggle('is-sizebox-open', hasOpenSizeBox);
  }

  function getProductFromButtonBox(buttonBox) {
    var item = buttonBox ? buttonBox.closest('.category-product-item') : null;
    var productId = item && item.dataset ? item.dataset.productId : '';
    var productFolder = item && item.dataset ? item.dataset.productFolder : '';

    return state.products.find(function(product) {
      return product.id === productId && product.folderId === productFolder;
    }) || state.products.find(function(product) {
      return product.id === productId || product.folderId === productFolder;
    }) || null;
  }

  function addProductToCart(product, size) {
    var item = {
      key: [product.id || product.name, product.folderId, size].join('|'),
      name: product.name.trim(),
      price: product.price.label.trim(),
      size: size,
      href: product.href,
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

  function setProductImageVariant(target, useThumbnail2) {
    var item = getProductItem(target);
    var image = item ? item.querySelector('.category-product-image') : null;
    var src = image ? (useThumbnail2 ? image.dataset.thumbnail2Src : image.dataset.thumbnailSrc) : '';

    if (src) image.src = src;
  }

  function handleProductTouchMove(event) {
    var touch = event.touches && event.touches[0];

    if (!touch) return;
    state.touchX = touch.clientX;
    state.touchY = touch.clientY;
    if (state.touchRaf) return;

    state.touchRaf = window.requestAnimationFrame(function() {
      state.touchRaf = 0;
      setTouchProductImageVariant(document.elementFromPoint(state.touchX, state.touchY));
    });
  }

  function setTouchProductImageVariant(target) {
    var item = getProductItem(target);
    var image = item ? item.querySelector('.category-product-image') : null;

    if (!item || !image || !image.dataset.thumbnail2Src) return;
    if (state.touchImageItem === item) return;
    resetTouchProductImageVariant();
    state.touchImageItem = item;
    setProductImageVariant(item, true);
  }

  function resetTouchProductImageVariant() {
    if (state.touchRaf) {
      window.cancelAnimationFrame(state.touchRaf);
      state.touchRaf = 0;
    }

    if (!state.touchImageItem) return;

    setProductImageVariant(state.touchImageItem, false);
    state.touchImageItem = null;
  }

  function getProductItem(target) {
    return target ? target.closest('.category-product-item') : null;
  }

  function preloadImage(src) {
    if (!src) return;

    var image = new Image();
    image.src = src;
  }

  function renderEmpty(message) {
    productContainer.innerHTML = '';

    var empty = document.createElement('div');
    empty.className = 'category-empty';
    empty.textContent = message;
    productContainer.appendChild(empty);
    finishPageLoading();
  }

  function finishPageLoading() {
    document.documentElement.classList.remove('is-data-loading');
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

  function parseOddness(product, fallback) {
    var value = product.oddness ??
      product.oddness_score ??
      product.oddnessScore ??
      product.weirdness ??
      product.weirdness_score ??
      product.weirdnessScore;
    var number = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));

    return Number.isFinite(number) ? number : fallback;
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

})();
