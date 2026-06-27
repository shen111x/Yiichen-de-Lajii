/* ========================================================================================================================================
   页头代码部分
   ======================================================================================================================================== */

var siteRoot = getSiteRoot();

/* ================================
   header 组件加载
   核心 hook：fetch header.html 后插入 #header_container，再启动 initHeader。
   ================================ */

fetch(siteRoot + 'components/header.html')
  .then(function(response) {
    return response.text();
  })
  .then(function(html) {
    var container = document.getElementById('header_container');
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
    var container = document.getElementById('copyright_container');
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
  setActiveHeaderMenuItem();
  initHeaderPanels();
}

/* ================================
   header 路径计算
   核心 hook：用 currentScript 推出 siteRoot，再按菜单文字自动生成链接路径。
   ================================ */

function getSiteRoot() {
  var script = document.currentScript;
  var scriptPath = script ? script.getAttribute('src') : '';

  if (!scriptPath) return '';

  return scriptPath.replace(/js\/universal\.js(\?.*)?$/, '');
}

function getSlugFromText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function setHeaderPaths() {
  var logo = document.getElementById('logo');
  var piano = document.querySelector('.panel_menu_piano');
  var menuItems = document.querySelectorAll('#header_panel_menu .panel_menu_item');

  if (logo) {
    logo.src = siteRoot + 'image/brand/logoa_black.png';
  }

  if (piano) {
    piano.src = siteRoot + 'components/de-lajii-sampler.html';
  }

  menuItems.forEach(function(item) {
    var slug = getSlugFromText(item.textContent || '');

    if (!slug) return;

    item.href = slug === 'home'
      ? siteRoot + 'index.html'
      : (slug === 'wearable' || slug === 'bags')
        ? siteRoot + 'pages/' + slug + '/'
      : siteRoot + slug + '/';
  });
}

/* ================================
   header 当前页面高亮
   核心 hook：读取 body[data-page]，匹配 menu item 的 data-page。
   ================================ */

function setActiveHeaderMenuItem() {
  var currentPage = document.body && document.body.dataset ? document.body.dataset.page : '';
  var menuItems = document.querySelectorAll('#header_panel_menu .panel_menu_item');

  menuItems.forEach(function(item) {
    item.classList.remove('panel_menu_item_active');

    if (item.dataset.page === currentPage) {
      item.classList.add('panel_menu_item_active');
    }
  });
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

  var cartButton = document.getElementById('cart_button');
  var menuButton = document.getElementById('menu_button');
  var cartPanel = document.getElementById('header_panel_cart');
  var menuPanel = document.getElementById('header_panel_menu');
  var headerMain = document.getElementById('header_main');

  if (!cartButton || !menuButton || !cartPanel || !menuPanel || !headerMain) return;

  var cartPanelWrapper = cartPanel.querySelector('.header_panel_wrapper');
  var menuPanelWrapper = menuPanel.querySelector('.header_panel_wrapper');

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
     核心 hook：读取 CSS 变量 --mobile_view_threshold 判断移动端布局。
     ================================ */

  function isNarrow() {
    var threshold = getComputedStyle(document.documentElement)
      .getPropertyValue('--mobile_view_threshold') || '725px';
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
   核心 hook：点击 .product_body_goback 时返回用户来处，没有历史记录时回首页。
   ================================ */

function initGoBackButtons() {
  var goBackButtons = document.querySelectorAll('.product_body_goback');

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
   关闭 快速双击缩放
   核心 hook：拦截 300ms 内、位置接近的第二次 touchend，防止 Safari 双击放大。
   关闭方式：注释掉下面整个 IIFE。
   其他 guard：如需单独启用 pinch / overscroll，请在页面 head 里引用 js/utility/ 对应文件。
   ================================ */

(function() {
  if (window.__disableFastDoubleTapZoomLoaded) return;
  window.__disableFastDoubleTapZoomLoaded = true;

  var lastTouchEndTime = 0;
  var lastTouchEndX = 0;
  var lastTouchEndY = 0;

  document.addEventListener('touchend', function(event) {
    var touch = event.changedTouches[0];
    var now = Date.now();
    var movedX = Math.abs(touch.clientX - lastTouchEndX);
    var movedY = Math.abs(touch.clientY - lastTouchEndY);

    if (now - lastTouchEndTime < 300 && movedX < 24 && movedY < 24) {
      event.preventDefault();
    }

    lastTouchEndTime = now;
    lastTouchEndX = touch.clientX;
    lastTouchEndY = touch.clientY;
  }, { passive: false });
}());
