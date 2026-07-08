import type { JSX, SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "pos"
  | "quote"
  | "delivery"
  | "sales"
  | "products"
  | "inventory"
  | "cylinder"
  | "import"
  | "cash"
  | "receivable"
  | "payable"
  | "purchase"
  | "report"
  | "roi"
  | "matrix"
  | "settings"
  | "users"
  | "audit"
  | "bell"
  | "sun"
  | "moon"
  | "menu"
  | "search"
  | "plus"
  | "chevronDown"
  | "chevronRight"
  | "building"
  | "close"
  | "check"
  | "alert"
  | "upload"
  | "eye"
  | "dollar";

const paths: Record<IconName, JSX.Element> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  pos: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </>
  ),
  quote: (
    <>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  delivery: (
    <>
      <rect x="1" y="6" width="13" height="10" rx="1.5" />
      <path d="M14 9h4l3 3v4h-7z" />
      <circle cx="6" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  sales: (
    <>
      <path d="M3 17l5-5 4 4 8-8" />
      <path d="M21 8v5M21 8h-5" />
    </>
  ),
  products: (
    <>
      <path d="M21 8l-9 4-9-4 9-4 9 4z" />
      <path d="M3 8v8l9 4 9-4V8" />
    </>
  ),
  inventory: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M9 12h6" />
    </>
  ),
  cylinder: (
    <>
      <path d="M9 4h6v2a3 3 0 0 1-3 3 3 3 0 0 1-3-3z" />
      <rect x="8" y="9" width="8" height="11" rx="2" />
      <path d="M11 2h2v2h-2z" />
    </>
  ),
  import: (
    <>
      <path d="M12 3v10" />
      <path d="M8 9l4 4 4-4" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v.01M18 15v.01" />
    </>
  ),
  receivable: (
    <>
      <path d="M12 3v18" />
      <path d="M16 7c0-1.7-1.8-2.5-4-2.5S8 5.3 8 7s2 2.2 4 2.5 4 .8 4 2.5-1.8 2.5-4 2.5-4-.8-4-2.5" />
    </>
  ),
  payable: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  purchase: (
    <>
      <path d="M3 4h2l2.4 12.4a1 1 0 0 0 1 .8h8.2a1 1 0 0 0 1-.8L20 8H6" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
    </>
  ),
  report: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 13v4M12 9v8M16 11v6" />
    </>
  ),
  roi: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 15l6-6M9.5 9.5h.01M14.5 14.5h.01" />
    </>
  ),
  matrix: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.4-1.4-4.5-3.5-5.4" />
    </>
  ),
  audit: (
    <>
      <path d="M9 4h6l1 2h3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6h3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12l4 4L19 7" />,
  alert: (
    <>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4M12 17v.01" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5" />
      <path d="M8 9l4-4 4 4" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  dollar: (
    <>
      <path d="M12 2v20" />
      <path d="M16.5 6.5c0-1.7-2-2.6-4.5-2.6S7.5 4.8 7.5 6.7 9.6 9.3 12 9.6s4.5 1 4.5 2.9-2 2.6-4.5 2.6-4.5-.9-4.5-2.6" />
    </>
  ),
};

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
