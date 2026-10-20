/* Small behaviour only: mark the menu link of the section currently in view (aria-current). Page works without it. */
(function () {
  if (!window.IntersectionObserver) return;
  var links = {};
  document.querySelectorAll(".nav a[href^='#']").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  var ids = Object.keys(links);
  if (!ids.length) return;
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var a = links[e.target.id];
      if (!a) return;
      if (e.isIntersecting) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
  ids.forEach(function (id) { var s = document.getElementById(id); if (s) obs.observe(s); });
})();
