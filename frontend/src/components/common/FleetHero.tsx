import { useNavigate } from "react-router-dom";

import { EquipmentImage } from "./EquipmentImage";
import { IconGenerator, IconATS, IconMeter, IconMap, IconPanel } from "./Icons";

export function FleetHero() {
  const navigate = useNavigate();
  return (
    <div className="fleet-hero">
      <div className="fleet-hero-bg" style={{ backgroundImage: "url(/images/hero-bg.jpg)" }} />
      <div className="fleet-hero-text">
        <h1>
          Real-Time Power Visibility.
          <br />
          <span>Across Every Facility.</span>
        </h1>
        <p>Monitor and manage your critical power infrastructure — generators, ATS, and meters — from a single live view.</p>
        <button className="fleet-hero-action" onClick={() => navigate("/map")}>
          <IconMap size={14} /> View Live Map
        </button>
      </div>
      <div className="fleet-hero-flow">
      </div>
    </div>
  );
}
