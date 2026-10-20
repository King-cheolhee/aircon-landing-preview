/* how.html figures. Hold the first frame until the figure reaches the middle 20% band of the screen, wait 0.4s, then play;
   when the last step ends, show the finished frame for 3s and play again. Fully off screen or hidden tab: back to the first frame.
   Button: stop (= finished frame) / play again. Reduced motion or no IntersectionObserver: leave the finished frame alone. */
(function () {
  if (!window.IntersectionObserver || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll("[data-mf]").forEach(function (f) {
    var c = f.nextElementSibling, b = c && c.querySelector(".mf-btn"), seen = false, on = false, play = false, stop = false, t = 0;
    if (!b) return;
    function reset() {
      clearTimeout(t); t = 0; play = false;
      f.classList.remove("is-on"); void f.offsetWidth; f.classList.add("is-on", "is-paused");
    }
    function go() { t = 0; play = true; f.classList.remove("is-paused"); }
    function sync() {
      if (stop) return;
      if (!seen || document.hidden) { if (play || t) reset(); }
      else if (!play) { if (!on) { clearTimeout(t); t = 0; } else if (!t) t = setTimeout(go, 400); }
    }
    function watch(o, set) { // isIntersecting only (no ratio math), so tall figures, landscape phones and resizes all work
      var cb = function (e) { set(e[e.length - 1].isIntersecting); sync(); };
      try { new IntersectionObserver(cb, o).observe(f); }
      catch (_) { delete o.root; new IntersectionObserver(cb, o).observe(f); } // no document root: margins still apply at top level
    }
    watch({ threshold: 0 }, function (v) { seen = v; }); // implicit root: also off screen when a parent page scrolls this page away
    watch({ root: document, rootMargin: "-40% 0px -40% 0px", threshold: 0 }, function (v) { on = v; }); // document root: the band works inside iframes too
    document.addEventListener("visibilitychange", sync);
    f.addEventListener("animationend", function (e) {
      if (play && e.target.hasAttribute("data-mf-last")) t = setTimeout(function () { reset(); go(); }, 3000);
    });
    b.addEventListener("click", function () {
      stop = !stop;
      b.textContent = stop ? "다시 재생" : "움직임 멈추기";
      if (stop) { clearTimeout(t); t = 0; play = false; f.classList.remove("is-on", "is-paused"); }
      else { reset(); if (seen && !document.hidden) go(); }
    });
    reset();
    c.hidden = false;
  });
})();
