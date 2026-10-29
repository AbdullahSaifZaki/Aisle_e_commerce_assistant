// The on-screen keyboard shrinks the visual viewport on mobile without
// necessarily changing CSS viewport units. Keep the chat shell in that area.
export function bindMobileViewport(root, win = window) {
  const mobile = win.matchMedia('(max-width:560px)');
  const viewport = win.visualViewport;

  function update() {
    if (!mobile.matches) {
      root.style.removeProperty('--aisle-viewport-height');
      root.style.removeProperty('--aisle-viewport-top');
      return;
    }
    const height = viewport?.height ?? win.innerHeight;
    if (height > 0) root.style.setProperty('--aisle-viewport-height', `${height}px`);
    root.style.setProperty('--aisle-viewport-top', `${viewport?.offsetTop ?? 0}px`);
  }

  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  win.addEventListener('resize', update);
  mobile.addEventListener('change', update);
  update();

  return () => {
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    win.removeEventListener('resize', update);
    mobile.removeEventListener('change', update);
  };
}
