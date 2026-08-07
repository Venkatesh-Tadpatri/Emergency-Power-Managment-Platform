import { useState } from "react";
import type { ComponentType } from "react";

/** Renders /images/<name>.png if it exists; falls back to the SVG icon otherwise,
 * so the UI never shows a broken image while assets are still being produced.
 */
export function EquipmentImage({
  src,
  alt,
  size = 44,
  fallbackIcon: FallbackIcon,
  fallbackColor,
}: {
  src: string;
  alt: string;
  size?: number;
  fallbackIcon: ComponentType<{ size?: number }>;
  fallbackColor: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <FallbackIcon size={size * 0.5} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ width: size * 0.72, height: size * 0.72, objectFit: "contain", color: fallbackColor }}
    />
  );
}
