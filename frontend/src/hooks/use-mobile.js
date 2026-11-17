import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const mediaQuery = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange) {
  const media = window.matchMedia(mediaQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(mediaQuery).matches;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
