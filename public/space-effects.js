/* Decorative only: this module never reads or writes account or class data. */
(() => {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const paths = {
    chat: '<path d="M21 11.5a8.3 8.3 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.7a8.3 8.3 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.3 8.3 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
    schedule: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2"/>',
    news: '<path d="m3 10 14-6v16L3 14v-4ZM7 16l1 5h4l-2-4M21 9v6"/>',
    council: '<path d="m3 9 9-6 9 6H3ZM5 11v7M10 11v7M14 11v7M19 11v7M3 21h18"/>',
    requests: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="m3 7 9 7 9-7M17 3h4"/>',
    polls: '<path d="m8 5 6-3 4 7-6 3-4-7ZM4 12l-2 4v5h20v-5l-2-4M2 16h20M9 13h6"/>',
    members: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/>',
    stats: '<path d="M4 3v18h17M8 16v-4M13 16V8M18 16V5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>'
  };

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'space-icon' }).forEach(([key, value]) => svg.setAttribute(key, value));
    svg.innerHTML = paths[name];
    return svg;
  }

  function mount() {
    if (document.getElementById('cosmic-canvas')) return;
    document.querySelectorAll('.nav-item[data-panel] .ic').forEach(slot => {
      const name = slot.parentElement.dataset.panel;
      if (paths[name]) slot.replaceChildren(icon(name));
      slot.setAttribute('aria-hidden', 'true');
    });
    const notifications = document.getElementById('notifications-button');
    if (notifications) {
      // Preserve the message count node and all existing event listeners.
      for (const node of Array.from(notifications.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('🔔')) node.textContent = node.textContent.replace('🔔', '');
      }
      notifications.prepend(icon('bell'));
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'cosmic-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    document.body.prepend(canvas);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const saveData = Boolean(navigator.connection?.saveData);
    let userPaused = false;
    try { userPaused = localStorage.getItem('cc-motion-paused') === 'true'; } catch (_) { /* Browser storage may be disabled. */ }
    let paused = userPaused || reduceMotion.matches || saveData;
    const button = document.createElement('button');
    button.id = 'motion-toggle';
    button.type = 'button';
    const buttonText = document.createElement('span');
    button.append(icon(paused ? 'play' : 'pause'), buttonText);
    document.body.append(button);

    const ctx = canvas.getContext('2d', { alpha: true });
    let width = 0;
    let height = 0;
    let stars = [];
    let links = [];
    let frame = 0;
    let lastFrame = 0;
    let elapsed = 0;
    let nextMeteor = 11000;
    let meteor = null;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const positions = stars.map(star => ({
        x: star.x * width + pointer.x * star.depth,
        y: star.y * height + pointer.y * star.depth,
        opacity: star.opacity * (paused ? 0.82 : 0.7 + 0.3 * Math.sin(elapsed * star.speed + star.phase))
      }));
      ctx.lineWidth = 0.6;
      for (const [a, b] of links) {
        const start = positions[a];
        const end = positions[b];
        ctx.strokeStyle = `rgba(138,159,255,${Math.min(start.opacity, end.opacity) * 0.13})`;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      stars.forEach((star, index) => {
        const point = positions[index];
        ctx.fillStyle = `rgba(${star.color},${point.opacity})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
        if (star.radius > 1.25) {
          ctx.fillStyle = `rgba(${star.color},${point.opacity * 0.12})`;
          ctx.beginPath();
          ctx.arc(point.x, point.y, star.radius * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      if (meteor && !paused) {
        const progress = (elapsed - meteor.start) / 1300;
        if (progress > 1) { meteor = null; return; }
        const x = meteor.x + progress * Math.min(width * 0.5, 380);
        const y = meteor.y + progress * 180;
        const tail = Math.min(75, width * 0.12);
        const alpha = Math.sin(progress * Math.PI) * 0.55;
        const gradient = ctx.createLinearGradient(x - tail, y - tail * 0.47, x, y);
        gradient.addColorStop(0, 'rgba(141,198,255,0)');
        gradient.addColorStop(1, `rgba(213,235,255,${alpha})`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(x - tail, y - tail * 0.47);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(32, Math.min(width < 600 ? 48 : 110, Math.round(width * height / 13500)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random(), y: Math.random(), radius: Math.random() * 1.05 + 0.4,
        depth: Math.random() * 0.75 + 0.25, opacity: Math.random() * 0.5 + 0.22,
        phase: Math.random() * Math.PI * 2, speed: Math.random() * 0.00035 + 0.0002,
        color: Math.random() > 0.8 ? '167,149,255' : '197,222,255'
      }));
      links = [];
      for (let i = 0; i < stars.length && links.length < 9; i++) {
        for (let j = i + 1; j < stars.length && links.length < 9; j++) {
          const distance = Math.hypot((stars[i].x - stars[j].x) * width, (stars[i].y - stars[j].y) * height);
          if (distance > 50 && distance < 115) { links.push([i, j]); break; }
        }
      }
      draw();
    }

    function tick(time) {
      frame = 0;
      if (paused || document.hidden || !ctx) return;
      if (!lastFrame) lastFrame = time;
      const delta = time - lastFrame;
      // Cap canvas painting at 30 fps, independently of high refresh displays.
      if (delta >= 32) {
        elapsed += Math.min(delta, 80);
        lastFrame = time;
        pointer.x += (pointer.targetX - pointer.x) * 0.05;
        pointer.y += (pointer.targetY - pointer.y) * 0.05;
        if (elapsed > nextMeteor && width >= 600) {
          meteor = { x: Math.random() * width * 0.65, y: Math.random() * height * 0.4, start: elapsed };
          nextMeteor = elapsed + 13000 + Math.random() * 12000;
        }
        draw();
      }
      frame = requestAnimationFrame(tick);
    }

    function updateMotion() {
      paused = userPaused || reduceMotion.matches || saveData;
      document.documentElement.classList.toggle('motion-paused', paused || document.hidden);
      button.setAttribute('aria-pressed', String(paused));
      button.disabled = reduceMotion.matches || saveData;
      const label = reduceMotion.matches ? 'Animations réduites' : saveData ? 'Animations en pause' : paused ? 'Réactiver les animations' : 'Mettre les animations en pause';
      buttonText.textContent = label;
      button.setAttribute('aria-label', label);
      button.title = reduceMotion.matches ? 'Les animations suivent la préférence de ton appareil.' : saveData ? 'Les animations sont en pause pour économiser les données et les ressources.' : label;
      button.querySelector('svg').replaceWith(icon(paused ? 'play' : 'pause'));
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
      if (paused) { pointer.x = 0; pointer.y = 0; meteor = null; }
      draw();
      if (!paused && !document.hidden && ctx) frame = requestAnimationFrame(tick);
    }

    button.addEventListener('click', () => {
      userPaused = !userPaused;
      try { localStorage.setItem('cc-motion-paused', String(userPaused)); } catch (_) { /* Pausing still works for this visit. */ }
      updateMotion();
    });
    document.addEventListener('visibilitychange', updateMotion);
    window.addEventListener('pagehide', () => { if (frame) cancelAnimationFrame(frame); frame = 0; });
    window.addEventListener('pageshow', updateMotion);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', updateMotion);
    else reduceMotion.addListener(updateMotion);
    window.addEventListener('pointermove', event => {
      if (paused || event.pointerType === 'touch') return;
      pointer.targetX = (event.clientX / Math.max(width, 1) - 0.5) * 16;
      pointer.targetY = (event.clientY / Math.max(height, 1) - 0.5) * 12;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointer.targetX = 0; pointer.targetY = 0; });
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    }, { passive: true });
    resize();
    updateMotion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
