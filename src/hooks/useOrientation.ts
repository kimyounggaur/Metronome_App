import { useEffect, useState } from "react";

function readLandscape(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(orientation: landscape)").matches && window.innerWidth > 700;
}

export function useOrientation(): { isLandscape: boolean } {
  const [isLandscape, setIsLandscape] = useState(readLandscape);

  useEffect(() => {
    const update = () => setIsLandscape(readLandscape());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return { isLandscape };
}
