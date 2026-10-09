import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const CLOUDS = [
  { top: "8%", size: 22, duration: 46, delay: -6, opacity: 0.9 },
  { top: "22%", size: 14, duration: 34, delay: -20, opacity: 0.75 },
  { top: "38%", size: 26, duration: 58, delay: -38, opacity: 0.7 },
  { top: "14%", size: 11, duration: 28, delay: -12, opacity: 0.6 },
  { top: "52%", size: 18, duration: 40, delay: -30, opacity: 0.65 },
  { top: "64%", size: 30, duration: 66, delay: -8, opacity: 0.5 },
  { top: "30%", size: 9, duration: 24, delay: -4, opacity: 0.55 },
].map(
  (c) =>
    ({
      "--cloud-top": c.top,
      "--cloud-size": `${c.size}rem`,
      "--cloud-duration": `${c.duration}s`,
      "--cloud-delay": `${c.delay}s`,
      "--cloud-opacity": c.opacity,
    }) as CSSProperties,
);

/** Blue sky gradient with soft clouds drifting across. Decorative only. */
export function SkyBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-b from-[#6fb9ec] via-[#b9e0f7] to-[#faf6f0]",
        className,
      )}
    >
      {CLOUDS.map((cloud, i) => (
        <span key={i} className="cb-cloud" style={cloud} />
      ))}
    </div>
  );
}
