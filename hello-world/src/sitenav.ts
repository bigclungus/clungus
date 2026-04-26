(() => {
  'use strict';

  interface NavLink {
    href: string;
    label: string;
    path?: string;
    external?: boolean;
    toolHost?: string;
  }

  const NAV_LINKS: NavLink[] = [
    { href: 'https://clung.us/', label: 'hello', path: '/' },
    { href: 'https://clung.us/tasks', label: 'tasks', path: '/tasks' },
    { href: 'https://clung.us/congress', label: 'congress', path: '/congress' },
    { href: 'https://clung.us/personas', label: 'personas', path: '/personas' },
    { href: 'https://labs.clung.us', label: 'labs', external: true },
    { href: 'https://clung.us/commons-v2/', label: 'commons', path: '/commons-v2/' },
    { href: 'https://clung.us/clungiverse', label: 'clungiverse', path: '/clungiverse' },
    { href: 'https://clung.us/chat/', label: 'clungcord', path: '/chat/' },
    { href: 'https://clung.us/timeline', label: 'timeline', path: '/timeline' },
    { href: 'https://clung.us/wallet', label: 'wallet', path: '/wallet' },
    { href: 'https://github.com/bigclungus', label: 'github', external: true },
  ];

  const TOOL_LINKS: NavLink[] = [
    { href: 'https://terminal.clung.us', label: 'terminal', external: true, toolHost: 'terminal.clung.us' },
    { href: 'https://temporal.clung.us', label: 'temporal', external: true, toolHost: 'temporal.clung.us' },
    { href: 'https://terminal.clung.us/topology', label: 'topology', external: true },
    { href: 'https://clung.us/cockpit', label: 'cockpit', path: '/cockpit' },
  ];

  function normalizePath(p: string): string {
    return p.replace(/\/+$/, '') || '/';
  }

  function isActiveSameDomain(link: NavLink): boolean {
    try {
      const linkUrl = new URL(link.href);
      if (linkUrl.hostname !== window.location.hostname) return false;
      const lp = normalizePath(linkUrl.pathname);
      const p = normalizePath(window.location.pathname);
      return p === lp;
    } catch {
      return false;
    }
  }

  function isActive(link: NavLink): boolean {
    if (link.toolHost) {
      return window.location.hostname === link.toolHost;
    }
    if (link.external) return false;
    if (isActiveSameDomain(link)) return true;
    if (!link.path) return false;
    const p = normalizePath(window.location.pathname);
    const lp = normalizePath(link.path);
    return p === lp;
  }

  function buildNav(): HTMLElement {
    const nav = document.createElement('nav');
    nav.className = 'sitenav';

    const brand = document.createElement('a');
    brand.className = 'sitenav-brand';
    brand.href = 'https://clung.us/';
    brand.textContent = '\u{1F916} clung.us';
    nav.appendChild(brand);

    const links = document.createElement('div');
    links.className = 'sitenav-links';

    NAV_LINKS.forEach((item: NavLink) => {
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      if (item.external) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      if (isActive(item)) {
        a.className = 'active';
      }
      links.appendChild(a);
    });

    const sep = document.createElement('span');
    sep.className = 'sitenav-sep';
    sep.textContent = '|';
    links.appendChild(sep);

    TOOL_LINKS.forEach((item: NavLink) => {
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      a.className = isActive(item) ? 'sitenav-tool-link active' : 'sitenav-tool-link';
      if (item.external && !item.toolHost) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      links.appendChild(a);
    });

    nav.appendChild(links);

    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.id = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle light/dark mode');
    toggle.textContent = '\u{1F319}';
    nav.appendChild(toggle);

    return nav;
  }

  function applyTheme(theme: string, toggleBtn: HTMLElement): void {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      toggleBtn.textContent = '\u2600';
    } else {
      document.documentElement.removeAttribute('data-theme');
      toggleBtn.textContent = '\u{1F319}';
    }
  }

  function initTheme(toggleBtn: HTMLElement): void {
    const saved = localStorage.getItem('theme') ?? 'dark';
    applyTheme(saved, toggleBtn);

    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      applyTheme(next, toggleBtn);
    });
  }

  function inject(): void {
    const nav = buildNav();

    const body = document.body;
    body.insertBefore(nav, body.firstChild);

    function applyNavOffset(): void {
      const navHeight = nav.getBoundingClientRect().height;
      const existing = parseFloat(window.getComputedStyle(body).paddingTop) || 0;
      if (existing < navHeight) {
        body.style.paddingTop = `${navHeight}px`;
      }
    }
    applyNavOffset();
    window.addEventListener('load', applyNavOffset);
    window.addEventListener('resize', applyNavOffset);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      initTheme(toggleBtn);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
