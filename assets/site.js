/* ============================================================
   个人工具箱 · 共享站点脚本
   在 <body> 开头同步插入顶栏与页脚，避免各页面重复维护。
   <script src="/assets/site.js" data-app="trend"></script>
   ============================================================ */
(function () {
  'use strict';

  var script = document.currentScript;
  var app = (script && script.getAttribute('data-app')) || '';

  var NAV = [
    ['/', '首页'],
    ['/cs2/', '赛历'],
    ['/trend/', '行情'],
    ['/railway/', '出行'],
    ['/gold/', '金价'],
    ['/track/', '物流']
  ];

  var ICON_MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="4.4"/></svg>';

  function currentPath() {
    var p = location.pathname.replace(/index\.html$/, '');
    if (p === '') p = '/';
    if (p.length > 1 && p.slice(-1) !== '/') p += '/';
    return p;
  }

  function near(path) {
    var cur = currentPath();
    if (path === '/') return cur === '/';
    return cur.indexOf(path) === 0;
  }

  var navHtml = NAV.map(function (item) {
    var active = near(item[0]);
    return '<a href="' + item[0] + '"' + (active ? ' aria-current="page"' : '') + '>' + item[1] + '</a>';
  }).join('');

  var topbar =
    '<header class="topbar"><div class="topbar-inner">' +
      '<a class="brand" href="/" aria-label="个人工具箱 首页">' +
        '<span class="brand-mark">' + ICON_MARK + '</span>' +
        '<span class="brand-name">个人工具箱</span>' +
        '<span class="brand-sub">Toolkit</span>' +
      '</a>' +
      '<nav class="topnav" aria-label="站点导航">' + navHtml + '</nav>' +
      '<span class="topbar-tip">赛事 · 行情 · 出行 · 金价 · 物流</span>' +
    '</div></header>';

  var footer =
    '<footer class="site-footer"><div class="footer-inner shell">' +
      '<div class="footer-brand">' +
        '<span class="brand-mark">' + ICON_MARK + '</span>' +
        '<span>个人工具箱</span>' +
      '</div>' +
      '<div class="footer-links">' +
        NAV.slice(1).map(function (item) { return '<a href="' + item[0] + '">' + item[1] + '</a>'; }).join('') +
      '</div>' +
      '<p class="footer-note">数据来自 Liquipedia、5EPlay、腾讯财经、东方财富、12306 数据服务与快递查询等公开接口，' +
      '仅供个人学习研究，不构成任何投资、出行或交易建议。接口可用性由第三方决定。</p>' +
    '</div></footer>';

  if (!document.querySelector('.topbar')) {
    document.body.insertAdjacentHTML('afterbegin', topbar);
  }
  function mountFooter() {
    if (!document.querySelector('.site-footer')) {
      document.body.insertAdjacentHTML('beforeend', footer);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountFooter);
  } else {
    mountFooter();
  }
  if (app) document.body.classList.add('app-' + app);
})();