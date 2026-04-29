import { h, type VNode } from 'preact';

export interface IconProps {
  size?: number;
  class?: string;
  style?: string | Record<string, string>;
}

function _ic(paths: VNode | VNode[]) {
  return function Icon({ size = 14, class: cls, style }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        class={cls}
        style={style}
      >
        {paths}
      </svg>
    );
  };
}

export const Sprout = _ic([
  <path d="M7 20h10" />,
  <path d="M12 20v-8" />,
  <path d="M12 12c0-3 2-5 5-5 0 3-2 5-5 5z" />,
  <path d="M12 12c0-3-2-5-5-5 0 3 2 5 5 5z" />,
]);

export const Sun = _ic([
  <circle cx="12" cy="12" r="4" />,
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />,
]);

export const Droplet = _ic(
  <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />,
);

export const Shield = _ic(
  <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />,
);

export const Wrench = _ic([
  <path d="M15 12l-8 8-3-3 8-8" />,
  <path d="M15 12l4-4 3 3-4 4" />,
  <path d="M11 8l5 5" />,
]);

export const Hammer = _ic([
  <path d="M15 12l-8 8-3-3 8-8" />,
  <path d="M15 12l4-4 3 3-4 4" />,
  <path d="M11 8l5 5" />,
]);

export const Trees = _ic([
  <path d="M8 21v-4" />,
  <path d="M8 17l-3-3 2-1-2-3 3-1-2-3h4l-2 3 3 1-2 3 2 1-3 3z" />,
  <path d="M16 21v-3" />,
  <path d="M16 18l-2-2 1-1-2-2 2-1-1-2h3l-1 2 2 1-2 2 1 1-2 2z" />,
]);

export const Star = _ic(
  <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />,
);

export const X = _ic([
  <path d="M6 6l12 12" />,
  <path d="M18 6L6 18" />,
]);

export const MessageSquare = _ic([
  <path d="M4 4h12l4 4v12H4z" />,
  <path d="M16 4v4h4" />,
  <path d="M8 12h8M8 16h6" />,
]);

export const Share = _ic([
  <circle cx="6" cy="12" r="2.5" />,
  <circle cx="18" cy="6" r="2.5" />,
  <circle cx="18" cy="18" r="2.5" />,
  <path d="M8 11l8-4M8 13l8 4" />,
]);

export const ExternalLink = _ic([
  <path d="M14 4h6v6" />,
  <path d="M20 4l-8 8" />,
  <path d="M19 13v6H5V5h6" />,
]);

export const Settings = _ic([
  <circle cx="12" cy="12" r="3" />,
  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
]);

export const ChevronDown = _ic(
  <polyline points="6 9 12 15 18 9" />,
);

export const RefreshCw = _ic([
  <path d="M21 12a9 9 0 1 1-3-6.7" />,
  <polyline points="21 4 21 10 15 10" />,
]);

export const AlertTriangle = _ic([
  <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />,
  <line x1="12" y1="9" x2="12" y2="13" />,
  <line x1="12" y1="17" x2="12.01" y2="17" />,
]);

export const Check = _ic(
  <polyline points="20 6 9 17 4 12" />,
);

export const Layers = _ic([
  <polygon points="12 2 22 8 12 14 2 8 12 2" />,
  <polyline points="2 14 12 20 22 14" />,
]);

export const LogOut = _ic([
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />,
  <polyline points="16 17 21 12 16 7" />,
  <line x1="21" y1="12" x2="9" y2="12" />,
]);

export const Mountain = _ic(
  <path d="M3 20l6-10 4 6 3-4 5 8z" />,
);

export const COMPONENT_ICONS: Record<string, (props: IconProps) => VNode> = {
  gardenViability: Sprout,
  growingSeason: Sun,
  waterAvailability: Droplet,
  floodSafety: Shield,
  septicFeasibility: Wrench,
  buildingSuitability: Hammer,
  firewoodPotential: Trees,
};
