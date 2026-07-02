/* ========================================================================================================================================
   页头代码部分
   ======================================================================================================================================== */

if (location.hostname === 'yiichendelajii.com' && location.protocol !== 'https:') {
  location.replace('https://' + location.host + location.pathname + location.search + location.hash);
}

var siteRoot = getSiteRoot();
var productDataIndexPath = 'product-data/index.json';
var productDataCategoriesPromise = null;

/* ================================
   header 组件加载
   核心 hook：fetch header.html 后插入 #header-container，再启动 initHeader。
   ================================ */

fetch(siteRoot + 'components/header.html')
  .then(function(response) {
    return response.text();
  })
  .then(function(html) {
    var container = document.getElementById('header-container');
    if (container) {
      container.innerHTML = html;
      initHeader();
    }
  })
  .catch(function(error) {
    console.error('加载 header.html 失败：', error);
  });

fetch(siteRoot + 'components/copyright.html')
  .then(function(response) {
    return response.text();
  })
  .then(function(html) {
    var container = document.getElementById('copyright-container');
    if (container) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var styles = doc.head ? doc.head.querySelectorAll('style') : [];
      var styleHtml = Array.prototype.map.call(styles, function(style) {
        return style.outerHTML;
      }).join('');
      var bodyHtml = doc.body ? doc.body.innerHTML : html;

      container.innerHTML = styleHtml + bodyHtml;
    }
  })
  .catch(function(error) {
    console.error('加载 copyright.html 失败：', error);
  });

/* ================================
   header 初始化入口
   核心 hook：统一触发路径修正、当前页高亮和 panel 交互。
   ================================ */

function initHeader() {
  setHeaderPaths();
  initHeaderPanels();
  loadProductDataCategories()
    .then(function(categories) {
      renderHeaderProductMenu(categories);
      setActiveHeaderMenuItem();
    })
    .catch(function(error) {
      console.error('加载 product-data/index.json 失败：', error);
      renderHeaderProductMenu([]);
      setActiveHeaderMenuItem();
    });
}

/* ================================
   header 路径与商品菜单
   核心 hook：从 product-data/index.json 生成上半部分菜单。
   ================================ */

function getSiteRoot() {
  var script = document.currentScript;
  var scriptPath = script ? script.getAttribute('src') : '';

  if (!scriptPath) return '';

  return scriptPath.replace(/js\/universal\.js(\?.*)?$/, '');
}

function setHeaderPaths() {
  var logo = document.getElementById('logo');
  var logoLink = document.getElementById('logo-link');
  var staticMenuItems = document.querySelectorAll('#header-panel-menu [data-menu-path]');
  var componentFrames = document.querySelectorAll('[data-component-path]');

  if (logo) {
    logo.src = siteRoot + 'image/brand/logoa-black.png';
  }

  if (logoLink) {
    logoLink.href = siteRoot + 'index.html';
  }

  staticMenuItems.forEach(function(item) {
    var path = item.dataset.menuPath || '';

    if (!path) return;

    item.href = siteRoot + path.replace(/^\/+/, '');
  });

  componentFrames.forEach(function(frame) {
    var path = frame.dataset.componentPath || '';

    if (!path) return;

    frame.src = siteRoot + path.replace(/^\/+/, '');
  });
}

function loadProductDataCategories() {
  if (productDataCategoriesPromise) return productDataCategoriesPromise;

  productDataCategoriesPromise = fetch(siteRoot + productDataIndexPath)
    .then(function(response) {
      if (!response.ok) {
        throw new Error(response.status + ' ' + response.statusText);
      }

      return response.json();
    })
    .then(function(categories) {
      if (!Array.isArray(categories)) return [];

      return categories.filter(function(category) {
        return category && category.active !== false && category.label;
      });
    });

  return productDataCategoriesPromise;
}

function renderHeaderProductMenu(categories) {
  var productMenu = document.getElementById('header-product-menu');

  if (!productMenu) return;

  productMenu.innerHTML = '';
  productMenu.appendChild(createHeaderMenuItem({
    label: 'Home',
    href: siteRoot + 'index.html',
    key: 'home'
  }));

  categories.forEach(function(category) {
    productMenu.appendChild(createHeaderMenuItem({
      label: category.label,
      href: getHeaderCategoryHref(category),
      categoryId: category.category_id || category.id || '',
      categoryPath: category.category_path || category.path || '',
      categoryPage: category.category_page || category.page || ''
    }));
  });
}

function createHeaderMenuItem(options) {
  var item = document.createElement('a');

  item.className = 'panel-menu-item';
  item.href = options.href || '#';
  item.textContent = options.label || '';

  if (options.key) item.dataset.menuKey = options.key;
  if (options.categoryId) item.dataset.categoryId = options.categoryId;
  if (options.categoryPath) item.dataset.categoryPath = options.categoryPath;
  if (options.categoryPage) item.dataset.categoryPage = options.categoryPage;

  return item;
}

function getHeaderCategoryHref(category) {
  var categoryPage = category.category_page || category.page || '';
  var categoryId = category.category_id || category.id || '';

  if (categoryPage) {
    return siteRoot + categoryPage.replace(/^\/+/, '');
  }

  if (categoryId) {
    return siteRoot + 'pages/category/index.html?c=' + encodeURIComponent(categoryId);
  }

  return '#';
}

/* ================================
   header 当前页面高亮
   核心 hook：用当前 URL 和 product-data/index.json 里的分类数据判断下划线。
   ================================ */

function setActiveHeaderMenuItem() {
  var currentUrl = new URL(window.location.href);
  var menuItems = document.querySelectorAll('#header-panel-menu .panel-menu-item');
  var activeItem = null;

  menuItems.forEach(function(item) {
    item.classList.remove('panel-menu-item-active');

    if (!activeItem && isActiveHeaderMenuItem(item, currentUrl)) activeItem = item;
  });

  if (activeItem) activeItem.classList.add('panel-menu-item-active');
}

function isActiveHeaderMenuItem(item, currentUrl) {
  if (item.dataset.menuKey === 'home') {
    return urlsSharePath(currentUrl, new URL(item.href, window.location.href));
  }

  if (item.dataset.categoryId || item.dataset.categoryPath) {
    return isActiveHeaderCategoryItem(item, currentUrl);
  }

  if (item.dataset.menuPath) {
    return urlsSharePath(currentUrl, new URL(item.href, window.location.href));
  }

  return false;
}

function isActiveHeaderCategoryItem(item, currentUrl) {
  var categoryId = item.dataset.categoryId || '';
  var categoryPath = item.dataset.categoryPath || '';
  var currentCategory = currentUrl.searchParams.get('c') ||
    currentUrl.searchParams.get('category') ||
    currentUrl.searchParams.get('categoryId') ||
    '';

  if (currentCategory) {
    if (categoryId && normalizeCategoryToken(currentCategory) === normalizeCategoryToken(categoryId)) return true;
    if (categoryPath && currentCategory === categoryPath) return true;
  }

  if (item.dataset.categoryPage) {
    var targetUrl = new URL(siteRoot + item.dataset.categoryPage.replace(/^\/+/, ''), window.location.href);

    if (urlsSharePath(currentUrl, targetUrl)) {
      var targetCategory = targetUrl.searchParams.get('c') || '';

      if (!targetCategory) return true;
      if (normalizeCategoryToken(currentCategory) === normalizeCategoryToken(targetCategory)) return true;
    }
  }

  return categoryPath && normalizePathname(currentUrl.pathname).indexOf('/' + categoryPath + '/') !== -1;
}

function normalizeCategoryToken(value) {
  var text = String(value || '').trim();

  if (/^[0-9]+$/.test(text)) {
    return String(parseInt(text, 10)).padStart(2, '0');
  }

  return text;
}

function urlsSharePath(firstUrl, secondUrl) {
  return normalizePathname(firstUrl.pathname) === normalizePathname(secondUrl.pathname);
}

function normalizePathname(pathname) {
  var path = pathname || '/';

  path = path.replace(/\/index\.html$/, '/');
  path = path.replace(/\/+$/, '/');

  return path || '/';
}

/* ====================================================================
   页头 panel 交互部分
   核心 hook：管理 cart/menu 两个 panel 的打开状态和事件。
   ==================================================================== */

function initHeaderPanels() {
  /* ================================
     panel 元素获取
     核心 hook：缓存按钮和面板 DOM，缺任意一个就停止初始化。
     ================================ */

  var cartButton = document.getElementById('cart-button');
  var menuButton = document.getElementById('menu-button');
  var cartPanel = document.getElementById('header-panel-cart');
  var menuPanel = document.getElementById('header-panel-menu');
  var headerMain = document.getElementById('header-main');

  if (!cartButton || !menuButton || !cartPanel || !menuPanel || !headerMain) return;

  var cartPanelWrapper = cartPanel.querySelector('.header-panel-wrapper');
  var menuPanelWrapper = menuPanel.querySelector('.header-panel-wrapper');

  /* ================================
     panel 状态数据
     核心 hook：用 state 记录 cartOpen 和 menuOpen 两个开关。
     ================================ */

  var state = {
    cartOpen: false,
    menuOpen: false
  };

  /* ================================
     panel 视口判断
     核心 hook：读取 CSS 变量 --mobile-view-threshold 判断移动端布局。
     ================================ */

  function isNarrow() {
    var threshold = getComputedStyle(document.documentElement)
      .getPropertyValue('--mobile-view-threshold') || '725px';
    var thresholdNumber = parseInt(threshold, 10) || 725;

    return window.innerWidth < thresholdNumber;
  }

  /* ================================
     panel 视觉更新
     核心 hook：把 state 转换成状态 class 和 aria。
     ================================ */

  function updatePanels() {
    headerMain.classList.toggle('menu-open', state.menuOpen);
    headerMain.classList.toggle('cart-open', state.cartOpen);

    menuPanel.setAttribute('aria-hidden', state.menuOpen ? 'false' : 'true');
    cartPanel.setAttribute('aria-hidden', state.cartOpen ? 'false' : 'true');
    menuButton.setAttribute('aria-expanded', state.menuOpen ? 'true' : 'false');
    cartButton.setAttribute('aria-expanded', state.cartOpen ? 'true' : 'false');
  }

  /* ================================
     panel cart 按钮
     核心 hook：点击购物车按钮切换 cartOpen，窄屏时关闭 menu。
     ================================ */

  cartButton.addEventListener('click', function(event) {
    event.stopPropagation();

    if (!isNarrow()) {
      state.cartOpen = !state.cartOpen;
      updatePanels();
      return;
    }

    state.cartOpen = !state.cartOpen;
    state.menuOpen = false;
    updatePanels();
  });

  /* ================================
     panel menu 按钮
     核心 hook：点击菜单按钮切换 menuOpen，窄屏时关闭 cart。
     ================================ */

  menuButton.addEventListener('click', function(event) {
    event.stopPropagation();

    if (!isNarrow()) {
      state.menuOpen = !state.menuOpen;
      updatePanels();
      return;
    }

    state.menuOpen = !state.menuOpen;
    state.cartOpen = false;
    updatePanels();
  });

  /* ================================
     panel 外部关闭
     核心 hook：点击按钮和面板之外时，同时关闭两个 panel。
     ================================ */

  document.addEventListener('click', function(event) {
    if (!state.cartOpen && !state.menuOpen) return;

    if (
      (!cartPanelWrapper || !cartPanelWrapper.contains(event.target)) &&
      (!menuPanelWrapper || !menuPanelWrapper.contains(event.target)) &&
      !cartButton.contains(event.target) &&
      !menuButton.contains(event.target)
    ) {
      state.cartOpen = false;
      state.menuOpen = false;
      updatePanels();
    }
  });

  /* ================================
     panel resize 同步
     核心 hook：窗口尺寸变化后重新按当前 state 渲染 panel。
     ================================ */

  window.addEventListener('resize', updatePanels);

  updatePanels();
}


/* ========================================================================================================================================
   全局代码部分
   ======================================================================================================================================== */

/* ================================
   通用返回按钮
   核心 hook：点击 .product-body-goback 时返回用户来处，没有历史记录时回首页。
   ================================ */

function initGoBackButtons() {
  var goBackButtons = document.querySelectorAll('.product-body-goback');

  goBackButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = siteRoot + 'index.html';
    });
  });
}

initGoBackButtons();


/* ================================
   全局缩放防护
   核心 hook：统一加载 utility，避免每个页面单独引用。
   ================================ */

function loadUtilityScript(path) {
  var script = document.createElement('script');
  script.src = siteRoot + path;
  script.defer = true;
  document.head.appendChild(script);
}

loadUtilityScript('js/utility/disable-fast-double-tap-zoom.js');
