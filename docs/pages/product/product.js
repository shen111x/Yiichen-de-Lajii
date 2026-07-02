(function() {
  var categoryIndexPath = '../../product-data/index.json';
  var fallbackCategoryPath = 'c-01';
  var fallbackProductFolder = '01';

  var nameNode = document.getElementById('product-name');
  var priceNode = document.getElementById('product-price');
  var imageNode = document.getElementById('product-image');
  var dropdownSection = document.getElementById('product-dropdown-section');

  if (!nameNode || !priceNode || !imageNode || !dropdownSection) return;

  initProductPage();

  function initProductPage() {
    resolveProductLocation()
      .then(function(location) {
        return loadProduct(location.categoryPath, location.productFolder);
      })
      .then(function(productState) {
        renderProduct(productState);
        initProductDropdowns();
      })
      .catch(function(error) {
        console.error('加载 product page 数据失败：', error);
        initProductDropdowns();
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

    nameNode.textContent = product.name || '';
    priceNode.textContent = price.label;
    document.title = (product.name ? product.name + ' - ' : '') + 'Yiichen de Lajii';

    imageNode.alt = product.name || 'product-img';
    setImageWithFallbacks(imageNode, getImageCandidates(productState.productBasePath, product));
    renderDropdowns(product.dropdowns || []);
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
