import * as React from "react";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Reveals every `[data-reveal]` element inside the returned ref once it scrolls into view.
 * Content stays visible when JavaScript, IntersectionObserver or motion is unavailable,
 * because the hidden state only applies under the `reveal-ready` class added here.
 */
export function useScrollReveal(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion() || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    root.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    root.classList.add("reveal-ready");

    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, [ref]);
}

/**
 * Tracks page scroll without re-rendering: writes the scroll ratio (0 to 1) and offset
 * in pixels to CSS variables on the target element, and flags it once the page moves.
 */
export function useScrollVars(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      el.style.setProperty("--scroll-progress", String(max > 0 ? Math.min(y / max, 1) : 0));
      el.style.setProperty("--scroll-y", String(prefersReducedMotion() ? 0 : y));
      el.dataset["scrolled"] = y > 8 ? "true" : "false";
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref]);
}

/** Cycles an index from 0 to `count - 1` every `intervalMs`, paused for reduced motion. */
export function useCycle(count: number, intervalMs: number) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => window.clearInterval(id);
  }, [count, intervalMs]);

  return index;
}
