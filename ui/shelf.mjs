export const SHELF_MODES = ['two-player', 'party'];
export const HERO_INTERVAL_MS = 7000;

export function shelfModeFromHash(hash) {
  return hash === '#party' ? 'party' : 'two-player';
}

export function shelfTabForKey(mode, key) {
  if (key === 'Home') return SHELF_MODES[0];
  if (key === 'End') return SHELF_MODES.at(-1);
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const direction = key === 'ArrowRight' ? 1 : -1;
    return SHELF_MODES[nextHeroIndex(SHELF_MODES.indexOf(mode), SHELF_MODES.length, direction)];
  }
  return null;
}

export function featuredGames(catalog, mode) {
  return catalog.filter(game =>
    (game.category === 'party') === (mode === 'party') && game.status !== 'planned');
}

export function nextHeroIndex(index, count, direction = 1) {
  return (index + direction + count) % count;
}

export function canAdvanceHero({count, hovered, focused, hidden, reducedMotion, paused, modalOpen}) {
  return count > 1 && !hovered && !focused && !hidden && !reducedMotion && !paused && !modalOpen;
}

// The shelf can be replaced by a modal or a different screen. Scope all
// listeners and the timer to this mount, and dispose before replacing its DOM.
export function mountShelfCarousel(root, {index, paused, motionPreference, modalOpen, onChange, onPause}) {
  const slides = [...root.querySelectorAll('.featured-game')];
  const dots = [...root.querySelectorAll('.carousel-dot')];
  const rotation = root.querySelector('.carousel-rotation');
  const announcement = root.querySelector('.carousel-announcement');
  const {ownerDocument: doc} = root;
  const listeners = new AbortController();
  const {signal} = listeners;
  let timer;
  let hovered = root.matches(':hover') && matchMedia('(hover: hover)').matches;
  let focused = root.contains(doc.activeElement);
  let touchStart = null;

  function mayRotate() {
    return canAdvanceHero({
      count: slides.length, hovered, focused, hidden: doc.hidden,
      reducedMotion: motionPreference.matches, paused, modalOpen,
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (mayRotate()) {
      timer = setTimeout(() => {
        // The visibility or media query value can change before its event runs.
        if (mayRotate()) show(nextHeroIndex(index, slides.length), false);
      }, HERO_INTERVAL_MS);
    }
  }

  function updateRotation() {
    rotation.hidden = motionPreference.matches || slides.length < 2;
    rotation.textContent = paused ? 'Start' : 'Pause';
    rotation.setAttribute('aria-label', paused ? 'Start slideshow' : 'Pause slideshow');
  }

  function show(next, manual) {
    if (next !== index) {
      // A swipe can change the slide while a link in that slide has focus.
      if (slides[index].contains(doc.activeElement)) dots[next].focus({preventScroll: true});
      index = next;
      slides.forEach((slide, i) => {
        slide.setAttribute('aria-hidden', String(i !== index));
        slide.inert = i !== index;
        dots[i].setAttribute('aria-current', String(i === index));
      });
      announcement.setAttribute('aria-live', manual ? 'polite' : 'off');
      announcement.textContent = manual ? `${slides[index].dataset.slideTitle}, slide ${index + 1} of ${slides.length}` : '';
      onChange(index);
    }
    schedule();
  }

  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i, true), {signal}));
  rotation.addEventListener('click', () => {
    paused = !paused;
    onPause(paused);
    updateRotation();
    schedule();
  }, {signal});
  root.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      hovered = true;
      schedule();
    }
  }, {signal});
  root.addEventListener('pointerleave', () => {
    hovered = false;
    schedule();
  }, {signal});
  root.addEventListener('focusin', () => {
    focused = true;
    schedule();
  }, {signal});
  root.addEventListener('focusout', event => {
    focused = root.contains(event.relatedTarget);
    schedule();
  }, {signal});
  root.addEventListener('touchstart', event => {
    touchStart = event.touches.length === 1 ? event.touches[0] : null;
  }, {passive: true, signal});
  root.addEventListener('touchend', event => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.clientX;
    const dy = touch.clientY - touchStart.clientY;
    touchStart = null;
    // A horizontal swipe must be deliberate; leave vertical page scrolling alone.
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (event.cancelable) event.preventDefault();
      show(nextHeroIndex(index, slides.length, dx < 0 ? 1 : -1), true);
    }
  }, {signal});
  root.addEventListener('touchcancel', () => { touchStart = null; }, {signal});
  doc.addEventListener('visibilitychange', schedule, {signal});
  motionPreference.addEventListener('change', () => {
    updateRotation();
    schedule();
  }, {signal});
  updateRotation();
  schedule();
  return () => {
    clearTimeout(timer);
    listeners.abort();
  };
}
