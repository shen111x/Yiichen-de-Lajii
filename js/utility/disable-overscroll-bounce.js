/* ====================================================================
   关闭页面边缘橡皮筋 overscroll
   用法：在页面 <head> 或 </body> 前单独引用本文件，引入即生效。
   说明：内部可滚动区域仍可正常滚动；到顶/到底后继续拖动才会被阻止。
   关闭：删除或注释掉对应 script 标签。
   ==================================================================== */

(function() {
  var touchStartY = 0;

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

  document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) return;

    touchStartY = event.touches[0].clientY;
  }, { passive: false });

  document.addEventListener('touchmove', function(event) {
    if (event.touches.length > 1) return;

    var deltaY = event.touches[0].clientY - touchStartY;
    var scroller = getScrollableParent(event.target);

    if (!canScrollInDirection(scroller, deltaY)) {
      event.preventDefault();
    }
  }, { passive: false });
}());
