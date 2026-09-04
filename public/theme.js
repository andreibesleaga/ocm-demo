/* Light/dark theme switch.
   The theme itself is applied by the inline script in index.html before first
   paint; this file only wires the toggle, persistence and the system listener. */
(function () {
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var meta = document.querySelector('meta[name="theme-color"]');
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  var THEME_COLOR = { light: '#eef2f6', dark: '#0b1220' };

  function stored() {
    try {
      var value = localStorage.getItem('theme');
      return value === 'light' || value === 'dark' ? value : null;
    } catch (e) {
      return null;
    }
  }

  function apply(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
    if (toggle) {
      toggle.setAttribute('aria-checked', theme === 'dark' ? 'true' : 'false');
    }
    if (persist) {
      try {
        localStorage.setItem('theme', theme);
      } catch (e) {
        /* Storage unavailable: the choice simply does not survive a reload. */
      }
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }

  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);

  if (toggle) {
    toggle.addEventListener('click', function () {
      apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });
  }

  /* Follow the system only while the visitor has made no explicit choice. */
  if (media) {
    var onChange = function (event) {
      if (!stored()) apply(event.matches ? 'dark' : 'light', false);
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }
})();
