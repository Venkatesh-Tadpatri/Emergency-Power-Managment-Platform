import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(props: IconProps) {
  const { size = 16, ...rest } = props;
  return { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...rest };
}

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconMap(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="8" width="12" height="13" rx="1" />
      <rect x="15" y="3" width="6" height="18" rx="1" />
      <line x1="6.5" y1="11.5" x2="6.5" y2="11.51" />
      <line x1="10.5" y1="11.5" x2="10.5" y2="11.51" />
      <line x1="6.5" y1="15.5" x2="6.5" y2="15.51" />
      <line x1="10.5" y1="15.5" x2="10.5" y2="15.51" />
      <line x1="18" y1="7" x2="18" y2="7.01" />
      <line x1="18" y1="11" x2="18" y2="11.01" />
      <line x1="18" y1="15" x2="18" y2="15.01" />
    </svg>
  );
}

export function IconResellers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M6 8.5V12a2 2 0 002 2h2m4 0h2a2 2 0 002-2V8.5" />
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

export function IconReport(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

/** Engine-generator set: block body + cooling fins + a bolt for "power". */
export function IconGenerator(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="9" width="14" height="10" rx="1.5" />
      <line x1="5" y1="9" x2="5" y2="19" />
      <line x1="8" y1="9" x2="8" y2="19" />
      <line x1="11" y1="9" x2="11" y2="19" />
      <circle cx="18.5" cy="8" r="4" />
      <path d="M19 6l-1.6 2.4h2L18 11" />
    </svg>
  );
}

/** ATS — automatic transfer switch: two contacts swapping between sources. */
export function IconATS(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="5" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 5h6a4 4 0 014 4v1.5" />
      <path d="M7 19h6a4 4 0 004-4v-1.5" />
      <path d="M17.5 9.5L19 12l1.5-2.5M17.5 14.5L19 12l1.5 2.5" opacity="0" />
    </svg>
  );
}

/** Power meter / gauge. */
export function IconMeter(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13l4-4" />
      <path d="M8.5 8.5l.01.01M12 4.5v.01M17 8l.01.01" strokeLinecap="round" />
      <path d="M9 20h6" />
    </svg>
  );
}

/** Panel / PLC — enclosure with breaker switches. */
export function IconPanel(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="2" width="16" height="20" rx="1.5" />
      <rect x="7" y="6" width="3" height="6" rx="0.5" />
      <rect x="11.5" y="6" width="3" height="6" rx="0.5" />
      <rect x="16" y="6" width="1.5" height="6" rx="0.5" />
      <line x1="7" y1="16" x2="17" y2="16" />
      <line x1="7" y1="18.5" x2="13" y2="18.5" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/** Double chevron — "«" pointing left; rotate 180deg for "»". */
export function IconChevronsLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor" stroke="none">
      <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" />
    </svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );
}

export function IconFlask(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 2h6" />
      <path d="M10 2v6.5L4.5 18a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 8.5V2" />
      <line x1="7.5" y1="14" x2="16.5" y2="14" />
    </svg>
  );
}
