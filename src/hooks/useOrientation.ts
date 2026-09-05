import { useEffect, useState } from "react";

function readLandscape(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches;
}

/** Orientation is a device observation; the user controls performance mode separately. */
export function useOrientation(): { isLandscape: boolean } {
  const [isLandscape, setIsLandscape] = useState(readLandscape);
  useEffect(() => {
    const media = window.matchMedia("(orientation: landscape)");
    const update = () => setIsLandscape(readLandscape());
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return { isLandscape };
}
