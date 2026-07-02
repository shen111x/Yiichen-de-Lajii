(function() {
  var categoryIndexPath = '../../product-data/index.json';
  var productPagePath = '../product/monogram-flag-tee-roc.html';
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

  if (!title || !sortSelect || !productContainer) return;

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
          launchDate: product.launch_date || product.launchDate || product.release_date || product.releaseDate || product.date || '',
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

    if (state.sort === 'price-asc') {
      products.sort(function(a, b) {
        return a.price.value - b.price.value || a.defaultIndex - b.defaultIndex;
      });
    } else if (state.sort === 'price-desc') {
      products.sort(function(a, b) {
        return b.price.value - a.price.value || a.defaultIndex - b.defaultIndex;
      });
    } else if (state.sort === 'date-desc') {
      products.sort(function(a, b) {
        return getTimeValue(b.launchDate) - getTimeValue(a.launchDate) || a.defaultIndex - b.defaultIndex;
      });
    } else if (state.sort === 'date-asc') {
      products.sort(function(a, b) {
        return getTimeValue(a.launchDate) - getTimeValue(b.launchDate) || a.defaultIndex - b.defaultIndex;
      });
    }

    return products;
  }

  function createProductItem(product) {
    var item = document.createElement('a');
    var imageWrapper = document.createElement('div');
    var image = document.createElement('img');
    var info = document.createElement('div');
    var name = document.createElement('p');
    var subtitle = document.createElement('p');
    var price = document.createElement('p');
    var add = document.createElement('span');

    item.className = 'category-product-item';
    item.href = product.href;
    item.dataset.categoryPath = product.categoryPath;
    item.dataset.productFolder = product.folderId;
    item.dataset.productId = product.id;

    imageWrapper.className = 'category-product-image-wrapper';
    image.className = 'category-product-image';
    image.alt = product.name;
    setImageWithFallbacks(image, product.imageCandidates);

    info.className = 'category-product-info';
    name.className = 'category-product-name';
    subtitle.className = 'category-product-subtitle';
    price.className = 'category-product-price';
    add.className = 'category-product-add';

    name.textContent = product.name;
    subtitle.textContent = product.subtitle;
    price.textContent = product.price.label;
    add.textContent = 'Add';

    imageWrapper.appendChild(image);
    info.appendChild(name);
    if (product.subtitle) info.appendChild(subtitle);
    info.appendChild(price);
    info.appendChild(add);

    item.appendChild(imageWrapper);
    item.appendChild(info);

    return item;
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

  function getTimeValue(value) {
    var time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
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
