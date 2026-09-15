import { useEffect, useState } from "react";

/** Touch em modo paisagem: cobre tanto celular (bloqueado pelo OrientationLockOverlay,
 *  então o valor de isMobile não importa nesse caso) quanto tablet em paisagem, que
 *  deve usar o mesmo layout compacto e o menu inferior em vez do Sidebar. Mouse/trackpad
 *  puro (desktop comum) nunca casa com "pointer: coarse". Mas um notebook/2-em-1 com tela
 *  touch TEM "pointer: coarse" mesmo em uso normal com mouse — por isso o teto de largura
 *  (1180px cobre os tablets de mercado; notebooks começam ~1280px de largura útil). */
const TOUCH_LANDSCAPE_QUERY =
  "(pointer: coarse) and (orientation: landscape) and (max-width: 1180px)";

function computeIsMobile(breakpoint: number): boolean {
  return window.innerWidth < breakpoint || window.matchMedia(TOUCH_LANDSCAPE_QUERY).matches;
}

export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(() => computeIsMobile(breakpoint));
  useEffect(() => {
    const mqWidth = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const mqTouchLandscape = window.matchMedia(TOUCH_LANDSCAPE_QUERY);
    const handler = () => setMobile(computeIsMobile(breakpoint));
    mqWidth.addEventListener("change", handler);
    mqTouchLandscape.addEventListener("change", handler);
    return () => {
      mqWidth.removeEventListener("change", handler);
      mqTouchLandscape.removeEventListener("change", handler);
    };
  }, [breakpoint]);
  return mobile;
}
