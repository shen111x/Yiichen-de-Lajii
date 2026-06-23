/* ====================================================================
   关闭快速双击缩放
   用法：在页面 <head> 或 </body> 前单独引用本文件，引入即生效。
   说明：拦截 300ms 内、位置接近的第二次 touchend，防止 Safari 双击放大。
   关闭：删除或注释掉对应 script 标签。
   ==================================================================== */

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
