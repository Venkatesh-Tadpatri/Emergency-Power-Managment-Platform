import type { ComponentType, ReactNode } from "react";

import { StatusPill } from "./StatusPill";
import type { IconDashboard } from "./Icons";

type Icon = ComponentType<{ size?: number }>;

export interface Stat {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
  icon?: Icon;
  onClick?: () => void;
}

export function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="dash-grid">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div
            className={`dash-card${s.onClick ? " dash-card-clickable" : ""}`}
            key={s.label}
            onClick={s.onClick}
            role={s.onClick ? "button" : undefined}
            tabIndex={s.onClick ? 0 : undefined}
            onKeyDown={(event) => {
              if (s.onClick && (event.key === "Enter" || event.key === " ")) s.onClick();
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {Icon && (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `${s.color || "var(--blue)"}15`,
                    color: s.color || "var(--blue)",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} />
                </div>
              )}
              <div>
                <div className="dc-label">{s.label}</div>
                <div className="dc-val" style={{ color: s.color }}>
                  {s.value}
                </div>
              </div>
            </div>
            {s.sub && <div className="dc-sub">{s.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

export interface InfoCardStat {
  label: string;
  value: string | number;
  color?: string;
}

export function InfoCard({
  title,
  status,
  subtitle,
  stats,
  statusLabel,
  onClick,
  disabled = false,
  icon: Icon,
  footer,
}: {
  title: string;
  status?: string;
  subtitle?: string | null;
  stats: InfoCardStat[];
  statusLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: typeof IconDashboard;
  /** Extra content below the stats, e.g. record details and action buttons on archived cards. */
  footer?: ReactNode;
}) {
  const interactive = Boolean(onClick) && !disabled;
  return (
    <div
      className={`info-card${disabled ? " info-card-disabled" : ""}`}
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) onClick?.();
      }}
    >
      <div className="info-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && (
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--surface-2)",
                color: "var(--blue)",
                flexShrink: 0,
              }}
            >
              <Icon size={14} />
            </div>
          )}
          <div className="info-card-title" title={typeof title === "string" ? title : undefined}>{title}</div>
        </div>
        {status && <StatusPill status={status} label={statusLabel} />}
      </div>
      {subtitle && <div className="reseller-label">{subtitle}</div>}
      <div className="info-card-body">
        {stats.map((s) => (
          <div className="info-card-stat" key={s.label}>
            <div className="v" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="l">{s.label}</div>
          </div>
        ))}
      </div>
      {footer && <div className="info-card-footer">{footer}</div>}
    </div>
  );
}
