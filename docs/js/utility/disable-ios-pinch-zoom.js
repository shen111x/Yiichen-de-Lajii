/* ====================================================================
   关闭 iOS 双指 pinch 缩放
   用法：在页面 <head> 或 </body> 前单独引用本文件，引入即生效。
   关闭：删除或注释掉对应 script 标签。
   ==================================================================== */

(function() {
  function preventGesture(event) {
    event.preventDefault();
  }

  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
}());
