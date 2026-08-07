import type { ComponentType } from "react";

export function PageHero({
  title,
  subtitle,
  icon: Icon,
  color = "#2563eb",
  bgImage,
}: {
  title: string;
  subtitle?: string | null;
  icon: ComponentType<{ size?: number }>;
  color?: string;
  /** Optional background photo (e.g. "/images/hero-bg.jpg") shown under a colored gradient for legibility. */
  bgImage?: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        background: `linear-gradient(135deg, ${color}c7, ${color}8f)`,
        color: "white",
        padding: "20px 24px",
        minHeight: 150,
        marginBottom: 18,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      {bgImage && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${bgImage})`,
            backgroundSize: "cover",
            // Lower the equipment strip slightly so the circles are fully visible.
            backgroundPosition: "46% 60%",
            mixBlendMode: "overlay",
            opacity: 0.82,
            zIndex: 0,
          }}
        />
      )}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: "rgba(255,255,255,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        <Icon size={22} />
      </div>
      <div style={{ zIndex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ position: "absolute", right: 22, bottom: 14, opacity: 0.16, zIndex: 1 }}>
        <Icon size={86} />
      </div>
    </div>
  );
}
