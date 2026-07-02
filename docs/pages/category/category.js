(function() {
  var categoryIndexPath = '../../product-data/index.json';
  var productPagePath = '../product/index.html';
  var productProbeLimit = 99;
  var maxEmptyProbeStreak = 2;

  var state = {
    category: null,
    products: [],
    sort: 'default'
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

    return loadProductFolderIds(categoryPath)
      .then(function(folderIds) {
        return Promise.all(folderIds.map(function(folderId, index) {
          return loadProduct(category, folderId, index);
        }));
      })
      .then(function(products) {
        return products.filter(Boolean);
      });
  }

  function loadProductFolderIds(categoryPath) {
    return loadJson('../../product-data/' + categoryPath + '/index.json')
      .catch(function() {
        return [];
      })
      .then(function(manifest) {
        var ids = normalizeManifestProductIds(manifest);
        return probeProductFolderIds(categoryPath, ids);
      });
  }

  function normalizeManifestProductIds(manifest) {
    if (!Array.isArray(manifest)) return [];

    return unique(manifest.map(function(item) {
      if (typeof item === 'string' || typeof item === 'number') return normalizeProductFolderId(item);
      if (item && (item.product_folder || item.folder || item.id)) {
        return normalizeProductFolderId(item.product_folder || item.folder || item.id);
      }

      return '';
    }).filter(Boolean));
  }

  function probeProductFolderIds(categoryPath, initialIds) {
    var ids = initialIds.slice();
    var start = getNextProbeNumber(ids);
    var emptyStreak = 0;
    var probe = Promise.resolve();

    for (var number = start; number <= productProbeLimit; number += 1) {
      (function(folderId) {
        probe = probe.then(function() {
          if (emptyStreak >= maxEmptyProbeStreak) return;

          if (ids.indexOf(folderId) !== -1) return;

          return fetch('../../product-data/' + categoryPath + '/' + folderId + '/index.json', { cache: 'no-store' })
            .then(function(response) {
              if (!response.ok) {
                emptyStreak += 1;
                return;
              }

              emptyStreak = 0;
              ids.push(folderId);
            })
            .catch(function() {
              emptyStreak += 1;
            });
        });
      })(normalizeProductFolderId(number));
    }

    return probe.then(function() {
      return ids.sort(compareFolderIds);
    });
  }

  function getNextProbeNumber(ids) {
    if (!ids.length) return 1;

    var max = ids.reduce(function(result, id) {
      var number = parseInt(id, 10);
      return Number.isFinite(number) ? Math.max(result, number) : result;
    }, 0);

    return Math.max(1, max + 1);
  }

  function loadProduct(category, folderId, index) {
    var categoryPath = category.category_path || category.path || '';
    var productBasePath = '../../product-data/' + categoryPath + '/' + folderId + '/';

    return loadJson(productBasePath + 'index.json')
      .then(function(rawProduct) {
        var product = Array.isArray(rawProduct) ? rawProduct[0] : rawProduct;

        if (!product) return null;

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
          imageCandidates: getImageCandidates(productBasePath, product),
          href: getProductHref(category, folderId, product)
        };
      })
      .catch(function(error) {
        console.warn('跳过 product-data/' + categoryPath + '/' + folderId + '：', error);
        return null;
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
    var image = item.querySelector('.category-product-image');
    var name = item.querySelector('.category-product-name');
    var subtitle = item.querySelector('.category-product-subtitle');
    var price = item.querySelector('.category-product-price');
    var add = item.querySelector('.category-product-add');

    item.removeAttribute('id');
    item.removeAttribute('hidden');
    item.href = product.href;
    item.dataset.categoryPath = product.categoryPath;
    item.dataset.productFolder = product.folderId;
    item.dataset.productId = product.id;

    if (image) {
      image.classList.remove('is-missing');
      image.alt = product.name;
      setImageWithFallbacks(image, product.imageCandidates);
    }

    if (name) name.textContent = product.name;
    if (subtitle) {
      subtitle.textContent = product.subtitle;
      subtitle.hidden = !product.subtitle;
    }
    if (price) price.textContent = product.price.label;
    initProductAdd(product, add);

    return item;
  }

  function initProductAdd(product, add) {
    if (!add) return;

    add.innerHTML = '';
    add.appendChild(createAddLabel('Add +'));
    product.sizes.forEach(function(size) {
      var sizeItem = document.createElement('button');

      sizeItem.className = 'category-product-size-item';
      sizeItem.type = 'button';
      sizeItem.textContent = size;
      sizeItem.hidden = true;
      sizeItem.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        sizeItem.classList.add('is-active');
        window.setTimeout(function() {
          addProductToCart(product, size);
          closeSizeDropdown(add, function() {
            showAddedState(add);
          });
          sizeItem.classList.remove('is-active');
        }, isTouchView() ? 120 : 0);
      });
      add.appendChild(sizeItem);
    });

    add.hidden = !product.sizes.length;

    add.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();

      if (add.classList.contains('is-open')) {
        closeSizeDropdown(add);
        return;
      }

      add.classList.add('is-active');
      window.setTimeout(function() {
        openSizeDropdown(add);
      }, isTouchView() ? 120 : 0);
    });
  }

  document.addEventListener('click', function(event) {
    Array.prototype.slice.call(document.querySelectorAll('.category-product-add.is-open')).forEach(function(add) {
      if (add.contains(event.target)) return;
      closeSizeDropdown(add);
    });
  });

  function openSizeDropdown(add) {
    closeAllSizeDropdowns(add);
    pinAddPosition(add);
    setAddLabel(add, '', true);
    add.classList.remove('is-closing', 'is-open-ready');
    add.classList.add('is-active', 'is-open');
    Array.prototype.slice.call(add.querySelectorAll('.category-product-size-item')).forEach(function(item) {
      item.hidden = false;
    });
    add.addEventListener('transitionend', function handleOpenEnd(event) {
      if (event.target !== add || event.propertyName !== 'height') return;
      add.removeEventListener('transitionend', handleOpenEnd);
      if (add.classList.contains('is-open')) add.classList.add('is-open-ready');
    });
  }

  function closeSizeDropdown(add, done) {
    if (!add) return;

    pinAddPosition(add);
    add.classList.remove('is-open-ready');
    add.classList.add('is-closing');
    add.offsetHeight;
    add.classList.remove('is-active', 'is-open');

    add.addEventListener('transitionend', function handleCloseEnd(event) {
      if (event.target !== add || event.propertyName !== 'height') return;
      add.removeEventListener('transitionend', handleCloseEnd);
      add.classList.remove('is-closing');
      add.style.removeProperty('--category-add-top');
      add.style.removeProperty('--category-add-left');
      Array.prototype.slice.call(add.querySelectorAll('.category-product-size-item')).forEach(function(item) {
        item.hidden = true;
      });
      setAddLabel(add, 'Add +', false);
      if (done) done();
    });
  }

  function pinAddPosition(add) {
    var parent = add.offsetParent;

    if (!parent) return;

    var addRect = add.getBoundingClientRect();
    var parentRect = parent.getBoundingClientRect();

    add.style.setProperty('--category-add-top', (addRect.top - parentRect.top) + 'px');
    add.style.setProperty('--category-add-left', (addRect.left - parentRect.left + addRect.width / 2) + 'px');
  }

  function closeAllSizeDropdowns(except) {
    Array.prototype.slice.call(document.querySelectorAll('.category-product-add.is-open')).forEach(function(add) {
      if (add !== except) closeSizeDropdown(add);
    });
  }

  function createAddLabel(text) {
    var label = document.createElement('span');

    label.className = 'category-product-add-label';
    label.textContent = text;

    return label;
  }

  function setAddLabel(add, text, isX) {
    var label = add.querySelector('.category-product-add-label');

    if (!label) return;
    label.textContent = text;
    label.classList.toggle('is-x', !!isX);
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

  function showAddedState(add) {
    if (!add) return;

    add.classList.remove('is-active');
    add.classList.add('is-added');
    setAddLabel(add, 'Added', false);

    window.clearTimeout(add.categoryAddedTimer);
    add.categoryAddedTimer = window.setTimeout(function() {
      fadeAddLabel(add, function() {
        setAddLabel(add, 'Add +', false);
        add.classList.remove('is-added');
      });
    }, 1500);
  }

  function fadeAddLabel(add, update) {
    var label = add.querySelector('.category-product-add-label');

    if (!label) return;
    label.classList.add('is-text-fading');
    window.setTimeout(function() {
      update();
      label.classList.remove('is-text-fading');
    }, 120);
  }

  function setImageWithFallbacks(image, candidates) {
    var index = 0;

    function next() {
      if (index >= candidates.length) {
        image.removeAttribute('src');
        image.classList.add('is-missing');
        return;
      }

      image.src = candidates[index];
      index += 1;
    }

    image.addEventListener('error', next);
    next();
  }

  function renderEmpty(message) {
    productContainer.innerHTML = '';

    var empty = document.createElement('div');
    empty.className = 'category-empty';
    empty.textContent = message;
    productContainer.appendChild(empty);
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

  function isTouchView() {
    return window.matchMedia && window.matchMedia('(hover: none)').matches;
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

  function compareFolderIds(first, second) {
    var firstNumber = parseInt(first, 10);
    var secondNumber = parseInt(second, 10);

    if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
      return firstNumber - secondNumber;
    }

    return first.localeCompare(second);
  }

  function unique(values) {
    return values.filter(function(value, index, array) {
      return value && array.indexOf(value) === index;
    });
  }
})();
