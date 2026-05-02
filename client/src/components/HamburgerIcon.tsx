/** Tres barras visibles en todos los navegadores móviles (evita box-shadow en .icon-menu). */
export function HamburgerIcon() {
  return (
    <span className="icon-hamburger" aria-hidden="true">
      <span className="icon-hamburger-bar" />
      <span className="icon-hamburger-bar" />
      <span className="icon-hamburger-bar" />
    </span>
  );
}
