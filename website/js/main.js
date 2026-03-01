/* ========================================
   Mirehub — Static Site Scripts
   ======================================== */

(function () {
  'use strict';

  // --- Language System ---
  var LANG_KEY = 'mirehub-lang';
  var html = document.documentElement;

  function setLang(lang) {
    html.className = 'lang-' + lang;
    html.setAttribute('lang', lang);
    localStorage.setItem(LANG_KEY, lang);
  }

  function initLang() {
    var saved = localStorage.getItem(LANG_KEY);
    if (saved) {
      setLang(saved);
      return;
    }
    var browserLang = (navigator.language || '').slice(0, 2);
    setLang(browserLang === 'fr' ? 'fr' : 'en');
  }

  initLang();

  document.getElementById('lang-toggle').addEventListener('click', function () {
    var current = html.className.indexOf('lang-fr') !== -1 ? 'fr' : 'en';
    setLang(current === 'fr' ? 'en' : 'fr');
  });

  // --- OS Detection ---
  var userOS = 'other';
  (function detectOS() {
    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';
    if (/Win/.test(platform) || /Windows/.test(ua)) {
      userOS = 'win';
    } else if (/Mac/.test(platform) || /Macintosh/.test(ua)) {
      userOS = 'mac';
    }
    if (userOS !== 'other') {
      document.body.classList.add('os-' + userOS);
    }
  })();

  // --- Header Scroll ---
  var header = document.getElementById('header');
  var scrollThreshold = 10;

  function onScroll() {
    if (window.scrollY > scrollThreshold) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Mobile Menu ---
  var menuToggle = document.getElementById('menu-toggle');
  var nav = document.getElementById('nav');

  menuToggle.addEventListener('click', function () {
    var isOpen = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', isOpen);
  });

  // Close menu on nav link click
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) {
      nav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // --- Smooth Scroll ---
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // --- Scroll Animations ---
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.animate-in').forEach(function (el) {
      observer.observe(el);
    });
  } else {
    document.querySelectorAll('.animate-in').forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // --- Screenshot Tabs ---
  var tabs = document.querySelectorAll('.tab[data-tab]');
  var panels = document.querySelectorAll('.screenshot-panel');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = this.getAttribute('data-tab');

      tabs.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      this.classList.add('active');
      this.setAttribute('aria-selected', 'true');

      panels.forEach(function (p) { p.classList.remove('active'); });
      var panel = document.getElementById('tab-' + target);
      if (panel) panel.classList.add('active');
    });
  });

  // --- Feature card click scrolls to screenshot tab ---
  document.querySelectorAll('.feature-card[data-screenshot]').forEach(function (card) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      var target = this.getAttribute('data-screenshot');
      var tab = document.querySelector('.tab[data-tab="' + target + '"]');
      if (tab) {
        tab.click();
        var screenshotsSection = document.getElementById('screenshots');
        if (screenshotsSection) screenshotsSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // --- Keyboard navigation for tabs ---
  var tabList = document.querySelector('.screenshot-tabs');
  if (tabList) {
    tabList.addEventListener('keydown', function (e) {
      var tabsArr = Array.from(tabs);
      var idx = tabsArr.indexOf(document.activeElement);
      if (idx === -1) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        var next = tabsArr[(idx + 1) % tabsArr.length];
        next.focus();
        next.click();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        var prev = tabsArr[(idx - 1 + tabsArr.length) % tabsArr.length];
        prev.focus();
        prev.click();
      }
    });
  }

  // --- GitHub Release (dynamic download) ---
  var GITHUB_REPO = 'AntonyCanut/Mirehub';
  var RELEASE_CACHE_KEY = 'mirehub-release';
  var RELEASE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(0) + ' MB';
  }

  function getCachedRelease() {
    try {
      var cached = JSON.parse(localStorage.getItem(RELEASE_CACHE_KEY));
      if (cached && Date.now() - cached.ts < RELEASE_CACHE_TTL) return cached.data;
    } catch (e) { /* ignore */ }
    return null;
  }

  function setCachedRelease(data) {
    try {
      localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) { /* ignore */ }
  }

  function applyRelease(release) {
    var version = release.tag_name;
    var displayVersion = version.replace(/^v/, '');

    // Version badge in hero
    var heroVersion = document.getElementById('hero-version');
    if (heroVersion) heroVersion.textContent = ' \u00B7 v' + displayVersion;

    // Version in both download buttons
    var versionMac = document.getElementById('download-version-mac');
    if (versionMac) versionMac.textContent = 'v' + displayVersion;
    var versionWin = document.getElementById('download-version-win');
    if (versionWin) versionWin.textContent = 'v' + displayVersion;

    // Find assets: .dmg for macOS, .exe (NSIS) for Windows
    var dmgAsset = null;
    var exeAsset = null;
    var assets = release.assets || [];
    for (var i = 0; i < assets.length; i++) {
      var name = assets[i].name.toLowerCase();
      if (!dmgAsset && name.indexOf('.dmg') !== -1 && name.indexOf('blockmap') === -1) {
        dmgAsset = assets[i];
      }
      if (!exeAsset && name.indexOf('.exe') !== -1 && name.indexOf('blockmap') === -1) {
        exeAsset = assets[i];
      }
    }

    // Apply macOS download
    if (dmgAsset) {
      var macBtn = document.getElementById('download-mac');
      if (macBtn) {
        macBtn.href = dmgAsset.browser_download_url;
        macBtn.removeAttribute('target');
      }
      var sizeMac = document.getElementById('download-size-mac');
      if (sizeMac) sizeMac.textContent = '~' + formatBytes(dmgAsset.size);
    }

    // Apply Windows download
    if (exeAsset) {
      var winBtn = document.getElementById('download-win');
      if (winBtn) {
        winBtn.href = exeAsset.browser_download_url;
        winBtn.removeAttribute('target');
      }
      var sizeWin = document.getElementById('download-size-win');
      if (sizeWin) sizeWin.textContent = '~' + formatBytes(exeAsset.size);
    }

    // Update hero CTA — point to the asset matching user's OS
    var heroDownload = document.getElementById('hero-download');
    if (heroDownload) {
      var primaryAsset = userOS === 'win' ? exeAsset : dmgAsset;
      if (primaryAsset) {
        heroDownload.href = primaryAsset.browser_download_url;
        heroDownload.removeAttribute('target');
      }
    }
  }

  function fetchLatestRelease() {
    var cached = getCachedRelease();
    if (cached) {
      applyRelease(cached);
      return;
    }

    fetch('https://api.github.com/repos/' + GITHUB_REPO + '/releases/latest')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (release) {
        setCachedRelease(release);
        applyRelease(release);
      })
      .catch(function () {
        // Silently fallback to static links — already pointing to /releases/latest
      });
  }

  // Only fetch if on the index page (has download section)
  if (document.getElementById('download-buttons')) {
    fetchLatestRelease();
  }

  // --- Docs Sidebar ---
  var docsSidebar = document.getElementById('docs-sidebar');
  var docsSidebarToggle = document.getElementById('docs-sidebar-toggle');
  var docsNavLinks = document.querySelectorAll('.docs-nav-link');

  if (docsSidebarToggle && docsSidebar) {
    docsSidebarToggle.addEventListener('click', function () {
      var isOpen = docsSidebar.classList.toggle('open');
      docsSidebarToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // Close sidebar on link click (mobile)
  docsNavLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      if (docsSidebar) docsSidebar.classList.remove('open');
    });
  });

  // Active section tracking for docs sidebar
  if (docsNavLinks.length > 0 && 'IntersectionObserver' in window) {
    var sections = [];
    docsNavLinks.forEach(function (link) {
      var href = link.getAttribute('href');
      if (href && href.charAt(0) === '#') {
        var section = document.querySelector(href);
        if (section) sections.push({ el: section, link: link });
      }
    });

    if (sections.length > 0) {
      var sectionObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              docsNavLinks.forEach(function (l) { l.classList.remove('active'); });
              sections.forEach(function (s) {
                if (s.el === entry.target) s.link.classList.add('active');
              });
            }
          });
        },
        { rootMargin: '-20% 0px -60% 0px' }
      );

      sections.forEach(function (s) {
        sectionObserver.observe(s.el);
      });
    }
  }

})();
