(function installGameHubViewCore(globalObject) {
  'use strict';

  function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  const HEADER_AVATAR_KEYS = new Set([
    'helmet-red',
    'helmet-blue',
    'helmet-yellow',
    'helmet-green',
    'helmet-orange',
    'helmet-purple',
    'helmet-cyan',
    'helmet-white'
  ]);


  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const DEFAULT_GAME_HUB_ICON = 'sparkles';
  const GAME_HUB_ICON_DEFINITIONS = Object.freeze({
    trophy: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 4.5h8v2.8a4 4 0 0 1-8 0V4.5Z', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 5.5H5.5c0 2.1 1.4 3.9 3.6 4.3M16 5.5h2.5c0 2.1-1.4 3.9-3.6 4.3', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 11.5v3.5M9 20h6M10 15.2h4V20h-4z', class: 'icon-accent' }) })
    ]),
    'racing-line': Object.freeze([
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '8.4', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M7.1 15.8c1.5-4.8 4.1-7.5 9.8-7.6M7.5 8.2h3.2M13.7 15.8h2.8', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M15.7 5.8h3.1v3.1M16.4 6.5l2.1 2.1M5.1 17.9l2.2-2.2', class: 'icon-accent' }) })
    ]),
    'race-day': Object.freeze([
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '3.2', y: '5', width: '17.6', height: '16', rx: '3.2', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M7.5 3v4.3M16.5 3v4.3M3.2 10h17.6', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 14.2h7.8l-1.6 1.7 1.6 1.7H8v-3.4ZM8 13v6', class: 'icon-accent' }) })
    ]),
    'duel-helmets': Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M3.3 12.3c0-4.4 2.5-7.5 6.4-7.5v7.8H3.3v-.3ZM20.7 12.3c0-4.4-2.5-7.5-6.4-7.5v7.8h6.4v-.3Z', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4.2 12.6h5.5v3.1H6.2M19.8 12.6h-5.5v3.1h3.5', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M10.7 9.2h2.6M11.1 12h1.8M11.4 14.8h1.2', class: 'icon-accent' }) })
    ]),
    'boost-clock': Object.freeze([
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12.7', cy: '13.1', r: '7.2', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9.7 3h6M12.7 3v3M18.4 7.5l1.9-1.9M12.7 13.1l3.3-2', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5.2 8.5H2.7M4.2 12H1.8M5.2 15.5H2.7', class: 'icon-accent' }) })
    ]),
    'heritage-helmet': Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5 13.1C5 7.8 7.8 4 12.3 4c4.1 0 6.7 3.1 6.7 7.6v1.5H5Z', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5 13.1h9.3l2.3 2.6H9.2c-2.6 0-4.2-.9-4.2-2.6ZM10.2 7.1c2.2-.8 4.6-.5 6.3.8', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8.2 4.9 6.5 2.8M12 4V2M15.7 4.9l1.8-2.1', class: 'icon-accent' }) })
    ]),
    'hot-streak': Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M13.1 2.8c.7 3.3-1.6 4.8-1.6 7.1 0 1.7 1.3 3 3 3 2.2 0 3.8-1.9 3.4-4.2 2.2 2.4 2.5 5.8.8 8.5A7.7 7.7 0 0 1 12 21a7.7 7.7 0 0 1-6.7-3.8C3.4 14 5 10.4 8.1 8.1c.1 2 1.2 3.5 3 4.1-1-3.1.9-5.5 2-9.4Z', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '16.4', r: '2.8', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9.9 16.4h4.2M12 14.3v4.2', class: 'icon-accent' }) })
    ]),
    'grand-prix-week': Object.freeze([
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '3.2', y: '5', width: '17.6', height: '16', rx: '3.2', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M7.5 3v4.3M16.5 3v4.3M3.2 10h17.6M7 14h3v3H7zM10 14h3v3h-3zM13 14h3v3h-3z', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M7 14h3v3H7M13 14h3v3h-3', class: 'icon-accent' }) })
    ]),
    'constructor-works': Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 2.8 20 6v5.6c0 4.4-3 7.8-8 9.6-5-1.8-8-5.2-8-9.6V6l8-3.2Z', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm7.2 10.3 4.8-3.1 4.8 3.1v5.6H7.2v-5.6ZM9.2 12.2h5.6', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8.1 15.9h7.8M9.4 14.1h5.2M10.1 17.7h3.8', class: 'icon-accent' }) }),
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '9.1', cy: '15.9', r: '.8', class: 'icon-soft-fill' }) }),
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '14.9', cy: '15.9', r: '.8', class: 'icon-soft-fill' }) })
    ]),
    'driver-grid': Object.freeze([
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '3.5', y: '3.5', width: '17', height: '17', rx: '3.2', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9.17 3.5v17M14.83 3.5v17M3.5 9.17h17M3.5 14.83h17', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M10.3 11.7c0-1.2.7-2 1.8-2s1.8.8 1.8 2v.5h-3.6v-.5ZM10.3 12.2h3.6v1.2h-2.5', class: 'icon-accent' }) })
    ]),
    'circuit-flag': Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M6.2 17.6c2.3-1.1 2.8-3.3 1.7-5.1-1-1.7-.2-4.2 2.2-5.3 2.7-1.2 5.9-.2 7.1 2.2 1.1 2.3.2 5-2 6.2-1.8 1-4.2.6-5.4-.8', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M6.2 17.6H3.5M5 15.8v3.8M16.8 4.1v6.2', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M16.8 4.1h4v3.6h-4M16.8 4.1h2v1.8h2M18.8 5.9v1.8', class: 'icon-accent' }) })
    ]),
    sparkles: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm12 2.8 1.5 4.6 4.7 1.5-4.7 1.5L12 15l-1.5-4.6L5.8 8.9l4.7-1.5L12 2.8Z', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M18.7 14.2 19.5 16.4 21.7 17.2 19.5 18 18.7 20.2 17.9 18 15.7 17.2 17.9 16.4 18.7 14.2ZM5.3 13.2l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z', class: 'icon-accent' }) })
    ]),
    grid: Object.freeze([
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '4', y: '4', width: '6.2', height: '6.2', rx: '1.2', class: 'icon-soft-fill' }) }),
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '13.8', y: '4', width: '6.2', height: '6.2', rx: '1.2', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '4', y: '13.8', width: '6.2', height: '6.2', rx: '1.2', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '13.8', y: '13.8', width: '6.2', height: '6.2', rx: '1.2', class: 'icon-secondary' }) })
    ]),
    target: Object.freeze([
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '7.5', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '3.3', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 2.8v2.7M21.2 12h-2.7M12 21.2v-2.7M2.8 12h2.7', class: 'icon-accent' }) })
    ]),
    calendar: Object.freeze([
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '3', y: '5', width: '18', height: '16', rx: '3.2', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M7.5 3v4.5M16.5 3v4.5M3 10h18', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8.2 14.6h7.6M8.2 17.8h4.4', class: 'icon-accent' }) })
    ]),
    'arrow-right': Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4.5 12h12.6', class: 'icon-strong' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12.5 6.8 17.8 12l-5.3 5.2', class: 'icon-secondary' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M18.2 12H21', class: 'icon-accent' }) })
    ])
  });

  function createSvgElement(documentObject, tagName) {
    if (typeof documentObject?.createElementNS === 'function') {
      return documentObject.createElementNS(SVG_NAMESPACE, tagName);
    }
    return documentObject.createElement(tagName);
  }

  function createGameHubIcon(documentObject, iconKey, className = 'game-hub-svg-icon') {
    const usesFallback = !Object.hasOwn(GAME_HUB_ICON_DEFINITIONS, iconKey);
    const normalizedKey = usesFallback ? DEFAULT_GAME_HUB_ICON : iconKey;
    const svg = createSvgElement(documentObject, 'svg');
    svg.setAttribute('class', className);
    if (typeof svg.className === 'string') svg.className = className;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.dataset.iconKey = normalizedKey;
    if (usesFallback) svg.dataset.iconFallback = 'true';

    for (const definition of GAME_HUB_ICON_DEFINITIONS[normalizedKey]) {
      const shape = createSvgElement(documentObject, definition.tag);
      for (const [name, value] of Object.entries(definition.attributes)) {
        shape.setAttribute(name, value);
      }
      svg.append(shape);
    }
    return svg;
  }

  function asNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeAvatarKey(value) {
    const avatarKey = String(value || '').trim();
    return HEADER_AVATAR_KEYS.has(avatarKey) ? avatarKey : 'helmet-red';
  }

  function getActiveStreak(stats = {}) {
    return Math.max(
      0,
      ...Object.values(stats.modes || {}).map(mode => asNonNegativeInteger(mode?.currentStreak))
    );
  }

  function setProgressPercent(element, value) {
    const numericValue = Number(value);
    const percent = Number.isFinite(numericValue)
      ? Math.round(Math.min(100, Math.max(0, numericValue)))
      : 0;
    if (!element) return percent;

    const previousValue = element.dataset.progressPercent;
    if (/^(?:100|[1-9]?\d)$/.test(previousValue || '')) {
      element.classList.remove(`progress-percent-${previousValue}`);
    }
    element.classList.add('has-progress-percent', `progress-percent-${percent}`);
    element.dataset.progressPercent = String(percent);
    return percent;
  }

  const api = Object.freeze({
    asNonNegativeInteger,
    createElement,
    createGameHubIcon,
    getActiveStreak,
    normalizeAvatarKey,
    setProgressPercent
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) globalObject.F1GameHubViewCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : null));
