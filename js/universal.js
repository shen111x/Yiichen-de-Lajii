/* ========================================================================================================================================
   页头代码部分
   ======================================================================================================================================== */

var siteRoot = getSiteRoot();

initViewportGuards();

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
   viewport 手势保护
   核心 hook：压掉 iOS 双击/双指缩放，并尽量阻止页面边缘橡皮筋。
   ================================ */

function initViewportGuards() {
  var touchStartY = 0;
  var lastTouchEndTime = 0;
  var lastTouchEndX = 0;
  var lastTouchEndY = 0;

  function preventGesture(event) {
    event.preventDefault();
  }

  function getScrollableParent(target) {
    var node = target;

    while (node && node !== document.body && node !== document.documentElement) {
      var style = getComputedStyle(node);
      var canScrollY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;

      if (canScrollY) return node;

      node = node.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function canScrollInDirection(scroller, deltaY) {
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return false;

    if (deltaY > 0) {
      return scroller.scrollTop > 0;
    }

    return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight;
  }

  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });

  document.addEventListener('dblclick', preventGesture, { passive: false, capture: true });

  document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) {
      event.preventDefault();
      return;
    }

    touchStartY = event.touches[0].clientY;
  }, { passive: false });

  document.addEventListener('touchmove', function(event) {
    if (event.touches.length > 1) {
      event.preventDefault();
      return;
    }

    var deltaY = event.touches[0].clientY - touchStartY;
    var scroller = getScrollableParent(event.target);

    if (!canScrollInDirection(scroller, deltaY)) {
      event.preventDefault();
    }
  }, { passive: false });

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
}

/* ================================
   header 路径计算
   核心 hook：用 currentScript 推出 siteRoot，再给 header 里的资源补路径。
   ================================ */

function getSiteRoot() {
  var script = document.currentScript;
  var scriptPath = script ? script.getAttribute('src') : '';

  if (!scriptPath) return '';

  return scriptPath.replace(/js\/universal\.js(\?.*)?$/, '');
}

function setHeaderPaths() {
  var logo = document.getElementById('logo');
  var homeLink = document.querySelector('#header_panel_menu .panel_menu_item[data-page="home"]');
  var wearableLink = document.querySelector('#header_panel_menu .panel_menu_item[data-page="wearable"]');

  if (logo) {
    logo.src = siteRoot + 'image/brand/logoa_black.png';
  }

  if (homeLink) {
    homeLink.href = siteRoot + 'index.html';
  }

  if (wearableLink) {
    wearableLink.href = siteRoot + 'wearable/';
  }
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
   核心 hook：管理 cart/menu 两个 panel 的打开状态、位置和事件。
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

  if (!cartButton || !menuButton || !cartPanel || !menuPanel) return;

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
    var threshold = getComputedStyle(document.documentElement).getPropertyValue('--mobile_view_threshold') || '725px';
    var thresholdNumber = parseInt(threshold, 10) || 725;

    return window.innerWidth < thresholdNumber;
  }

  function getGapUnit() {
    var gapUnit = getComputedStyle(document.documentElement).getPropertyValue('--gap-unit') || '4px';
    return parseFloat(gapUnit) || 4;
  }

  function getPanelOpenLeft() {
    return getGapUnit() * 1.5;
  }

  function getPanelClosedLeft(panel) {
    return -panel.getBoundingClientRect().width - getGapUnit() * 3;
  }

  function getCartStackedLeft() {
    return getPanelOpenLeft() + menuPanel.getBoundingClientRect().width + getGapUnit() * 1.5;
  }

  /* ================================
     panel 视觉更新
     核心 hook：把 state 转换成 left、open class 和 aria-hidden。
     ================================ */

  function updatePanels() {
    if (!isNarrow()) {
      if (state.menuOpen) {
        menuPanel.style.left = getPanelOpenLeft() + 'px';
        menuPanel.classList.add('open');
      } else {
        menuPanel.style.left = getPanelClosedLeft(menuPanel) + 'px';
        menuPanel.classList.remove('open');
      }

      if (state.cartOpen) {
        cartPanel.style.left = (state.menuOpen ? getCartStackedLeft() : getPanelOpenLeft()) + 'px';
        cartPanel.classList.add('open');
      } else {
        cartPanel.style.left = state.menuOpen ? getPanelOpenLeft() + 'px' : getPanelClosedLeft(cartPanel) + 'px';
        cartPanel.classList.remove('open');
      }
    } else {
      if (state.menuOpen) {
        menuPanel.style.left = getPanelOpenLeft() + 'px';
        menuPanel.classList.add('open');
      } else {
        menuPanel.style.left = getPanelClosedLeft(menuPanel) + 'px';
        menuPanel.classList.remove('open');
      }

      if (state.cartOpen) {
        cartPanel.style.left = getPanelOpenLeft() + 'px';
        cartPanel.classList.add('open');
      } else {
        cartPanel.style.left = getPanelClosedLeft(cartPanel) + 'px';
        cartPanel.classList.remove('open');
      }
    }

    menuPanel.setAttribute('aria-hidden', state.menuOpen ? 'false' : 'true');
    cartPanel.setAttribute('aria-hidden', state.cartOpen ? 'false' : 'true');
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

    if ((!cartPanelWrapper || !cartPanelWrapper.contains(event.target)) &&
        (!menuPanelWrapper || !menuPanelWrapper.contains(event.target)) &&
        !cartButton.contains(event.target) && !menuButton.contains(event.target)) {
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
   代码部分
   ======================================================================================================================================== */
