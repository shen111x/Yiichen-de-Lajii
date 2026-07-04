(function() {
  var categoryIndexPath = '../../product-data/index.json';
  var fallbackCategoryPath = 'c-01';
  var fallbackProductFolder = '01';

  var nameNode = document.getElementById('product-name');
  var priceNode = document.getElementById('product-price');
  var galleryNode = document.getElementById('product-gallery');
  var galleryTrack = document.getElementById('product-gallery-track');
  var galleryGroups = galleryNode ? galleryNode.querySelectorAll('.product-body-img-group') : [];
  var dropdownSection = document.getElementById('product-dropdown-section');
  var addButton = document.getElementById('product-add-button');
  var currentProductState = null;
  var galleryGroupWidth = 0;
  var galleryIsMeasured = false;
  var gallerySettleTimer = 0;
  var galleryCenterIndex = galleryGroups.length ? Math.floor(galleryGroups.length / 2) : 0;
  var galleryCenterScrollLeft = 0;
  var galleryViewportWidth = 0;
  var galleryLastScrollLeft = 0;
  var galleryResetPending = false;
  var galleryUserScrolled = false;

  if (!nameNode || !priceNode || !galleryNode || !galleryTrack || !galleryGroups.length || !dropdownSection) return;

  initProductPage();
  initAddToCartDropdown();
  initInfiniteGallery();

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

    renderProductGallery(productState);
    renderDropdowns(product.dropdowns || []);
    renderSizeOptions(getProductSizes(product));
  }

  function renderProductGallery(productState) {
    var product = productState.product;
    var imagePaths = getGalleryImagePaths(productState.productBasePath, product);

    galleryIsMeasured = false;
    galleryUserScrolled = false;

    Array.prototype.slice.call(galleryGroups).forEach(function(group) {
      group.innerHTML = '';

      imagePaths.forEach(function(imagePath) {
        var cell = document.createElement('div');
        var image = document.createElement('img');

        cell.className = 'product-body-img-cell';
        image.alt = product.name || 'product-img';
        image.decoding = 'async';
        image.draggable = false;
        image.addEventListener('load', function() {
          measureInfiniteGallery(!galleryUserScrolled);
        });
        image.addEventListener('error', function() {
          measureInfiniteGallery(!galleryUserScrolled);
        });
        image.src = imagePath;
        cell.appendChild(image);
        group.appendChild(cell);
      });
    });

    requestAnimationFrame(function() {
      measureInfiniteGallery(true);
    });
  }

  function initInfiniteGallery() {
    galleryNode.addEventListener('scroll', scheduleInfiniteGalleryReset, { passive: true });

    if ('onscrollend' in window) {
      galleryNode.addEventListener('scrollend', resetInfiniteGalleryAfterScroll, { passive: true });
    }

    window.addEventListener('resize', function() {
      measureInfiniteGallery(!galleryIsMeasured);
    });
  }

  function measureInfiniteGallery(forceCenter) {
    var mainGroup = galleryGroups[galleryCenterIndex];
    var nextGroupWidth = getGalleryGroupDistance(mainGroup);
    var nextCenterScrollLeft;
    var nextViewportWidth = galleryNode.clientWidth;
    var groupWidthChanged = galleryGroupWidth && Math.abs(nextGroupWidth - galleryGroupWidth) > 1;

    if (!nextGroupWidth) return;

    forceCenter = forceCenter ||
      (!galleryUserScrolled && groupWidthChanged) ||
      (galleryViewportWidth && Math.abs(nextViewportWidth - galleryViewportWidth) > 1);
    galleryGroupWidth = nextGroupWidth;
    galleryViewportWidth = nextViewportWidth;
    nextCenterScrollLeft = getGalleryCenteredImageScrollLeft(mainGroup);

    if (nextCenterScrollLeft === null) return;

    galleryCenterScrollLeft = nextCenterScrollLeft;

    if (forceCenter || !galleryIsMeasured) {
      galleryNode.scrollLeft = galleryCenterScrollLeft;
      galleryLastScrollLeft = galleryNode.scrollLeft;
      galleryResetPending = false;
      galleryIsMeasured = true;
    }
  }

  function getGalleryCenteredImageScrollLeft(group) {
    var cell = group ? group.querySelector('.product-body-img-cell') : null;
    var cellCenter;

    if (!cell) return null;

    cellCenter = cell.offsetLeft + cell.offsetWidth / 2;

    if (!cell.offsetWidth || !galleryNode.clientWidth) return null;

    return cellCenter - galleryNode.clientWidth / 2;
  }

  function getGalleryGroupDistance(group) {
    var nextGroup = group ? group.nextElementSibling : null;
    var previousGroup = group ? group.previousElementSibling : null;

    if (nextGroup) return nextGroup.offsetLeft - group.offsetLeft;
    if (previousGroup) return group.offsetLeft - previousGroup.offsetLeft;

    return group ? group.offsetWidth : 0;
  }

  function scheduleInfiniteGalleryReset() {
    var nextScrollLeft = galleryNode.scrollLeft;

    if (!galleryGroupWidth) return;
    if (Math.abs(nextScrollLeft - galleryLastScrollLeft) < 2) return;

    if (galleryIsMeasured) galleryUserScrolled = true;
    galleryLastScrollLeft = nextScrollLeft;
    galleryResetPending = true;

    window.clearTimeout(gallerySettleTimer);
    gallerySettleTimer = window.setTimeout(resetInfiniteGalleryAfterScroll, 180);
  }

  function resetInfiniteGalleryAfterScroll() {
    var left;
    var centerLeft;
    var relativeLeft;
    var nextLeft;

    if (!galleryGroupWidth) return;
    if (!galleryResetPending) return;

    left = galleryNode.scrollLeft;
    centerLeft = galleryCenterScrollLeft;
    relativeLeft = left - centerLeft;

    while (relativeLeft < galleryGroupWidth * -0.5) {
      relativeLeft += galleryGroupWidth;
    }

    while (relativeLeft > galleryGroupWidth * 0.5) {
      relativeLeft -= galleryGroupWidth;
    }

    nextLeft = centerLeft + relativeLeft;

    if (Math.abs(nextLeft - left) > 1) {
      galleryNode.scrollLeft = nextLeft;
    }

    galleryLastScrollLeft = galleryNode.scrollLeft;
    galleryResetPending = false;
  }

  function initAddToCartDropdown() {
    if (!addButton) return;

    document.addEventListener('click', function(event) {
      var add = event.target.closest('.product-body-add-button');
      var size = event.target.closest('.product-body-size-item');
      var close = event.target.closest('.product-body-size-close');
      var inside = event.target.closest('#product-add-button');

      if (add) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openSizeBox();
        return;
      }

      if (size) {
        event.preventDefault();
        event.stopImmediatePropagation();
        addProductToCart(size.dataset.size || size.textContent);
        resetSizeBox('Added');
        return;
      }

      if (close) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resetSizeBox();
        return;
      }

      if (!inside) {
        resetSizeBox();
      }
    }, true);
  }

  function renderSizeOptions(sizes) {
    var add = addButton ? addButton.querySelector('.product-body-add-button') : null;
    var sizeBox = addButton ? addButton.querySelector('.product-body-size-box') : null;
    var sizeBottom = addButton ? addButton.querySelector('.product-body-size-bottom') : null;

    if (!addButton || !add || !sizeBox || !sizeBottom) return;

    add.textContent = 'Add';
    sizeBox.setAttribute('aria-hidden', 'true');
    sizeBottom.innerHTML = '';

    sizes.forEach(function(size) {
      var item = document.createElement('button');

      item.className = 'product-body-size-item';
      item.type = 'button';
      item.textContent = size;
      item.dataset.size = size;
      sizeBottom.appendChild(item);
    });

    addButton.hidden = !sizes.length;
    resetSizeBox();
  }

  function openSizeBox() {
    var sizeBox = addButton ? addButton.querySelector('.product-body-size-box') : null;
    var closedHeight = getClosedAddHeight();

    if (!addButton || !sizeBox) return;
    if (addButton.classList.contains('is-open')) return;

    addButton.style.height = closedHeight + 'px';
    addButton.classList.add('is-open');
    sizeBox.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(function() {
      addButton.style.height = addButton.scrollHeight + 'px';
    });
  }

  function resetSizeBox(message) {
    var add = addButton ? addButton.querySelector('.product-body-add-button') : null;
    var sizeBox = addButton ? addButton.querySelector('.product-body-size-box') : null;
    var wasOpen = addButton ? addButton.classList.contains('is-open') : false;

    if (!addButton || !add || !sizeBox) return;

    if (wasOpen) {
      addButton.style.height = addButton.getBoundingClientRect().height + 'px';
    }

    addButton.classList.remove('is-open');
    sizeBox.setAttribute('aria-hidden', 'true');
    add.textContent = message || 'Add';

    window.requestAnimationFrame(function() {
      addButton.style.height = getClosedAddHeight() + 'px';
    });

    window.clearTimeout(addButton.productAddedTimer);
    if (message) {
      addButton.productAddedTimer = window.setTimeout(function() {
        add.textContent = 'Add';
      }, 1500);
    }
  }

  function getClosedAddHeight() {
    var parent = addButton ? addButton.parentElement : null;
    var parentHeight = parent ? parent.getBoundingClientRect().height : 0;

    return parentHeight || addButton.getBoundingClientRect().height || 0;
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
        candidates.push(productBasePath + 'images/' + index + '.' + extension);
      });
    }

    return unique(candidates);
  }

  function getGalleryImagePaths(productBasePath, product) {
    var productImages = Array.isArray(product.images) ? product.images.map(function(imagePath) {
      return imagePath ? productBasePath + imagePath.replace(/^\/+/, '') : '';
    }).filter(Boolean) : [];

    return unique(productImages.length ? productImages : getImageCandidates(productBasePath, product));
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
