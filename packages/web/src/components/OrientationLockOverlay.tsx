/** Bloqueia o uso em celular no modo paisagem, pedindo para girar para retrato.
 *  Some completamente em tablets (ver `orientation-lock-overlay` em global.css,
 *  que usa `max-height` para distinguir altura de celular em paisagem da altura
 *  de tablet em paisagem) e em qualquer dispositivo sem tela sensível ao toque. */
export function OrientationLockOverlay() {
  return (
    <div className="orientation-lock-overlay" role="alert">
      <div className="orientation-lock-overlay-icon" aria-hidden="true">
        📱
      </div>
      <p className="orientation-lock-overlay-title">Gire o aparelho para o modo retrato</p>
      <p className="orientation-lock-overlay-text">
        Este sistema não é compatível com o modo paisagem em celulares.
      </p>
    </div>
  );
}
