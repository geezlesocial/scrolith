import React from 'react';

export type ShellIconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

const baseProps = (size = 24, className = '', strokeWidth = 2) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className
});

const isFilled = (className?: string) => String(className || '').includes('fill-current');

export const LoaderIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
  </svg>
);

export const Loader2Icon = LoaderIcon;

export const AlertTriangleIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const BellIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 0 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
    <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
  </svg>
);

export const BriefcaseIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </svg>
);

export const ChevronDownIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const CreditCardIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
    <line x1="6" y1="15" x2="10" y2="15" />
  </svg>
);

export const FileTextIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v5h5" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </svg>
);

export const FolderIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />
  </svg>
);

export const GlobeIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18" />
    <path d="M12 3a14 14 0 0 0 0 18" />
  </svg>
);

export const HeartIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => {
  const fillColor = isFilled(className) ? 'currentColor' : 'none';
  return (
    <svg {...baseProps(size, className, strokeWidth)}>
      <path
        fill={fillColor}
        d="M12 21s-7-4.4-9.2-8.3A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.2 6.7C19 16.6 12 21 12 21z"
      />
    </svg>
  );
};

export const HelpCircleIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.8 2.1c-.9.6-1.3 1-1.3 2" />
    <circle cx="12" cy="16.6" r=".8" />
  </svg>
);

export const HomeIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
  </svg>
);

export const LayoutDashboardIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="10" width="8" height="11" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
  </svg>
);

export const LogOutIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const MailIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

export const MessageSquareIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M21 14a2 2 0 0 1-2 2H9l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const MessageCircleIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M12 3c5 0 9 3.6 9 8s-4 8-9 8c-1.3 0-2.6-.2-3.8-.7L4 20l1.4-3.2C4 15.5 3 13.8 3 11c0-4.4 4-8 9-8z" />
  </svg>
);

export const SearchIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="11" cy="11" r="7" />
    <line x1="20" y1="20" x2="16.65" y2="16.65" />
  </svg>
);

export const SettingsIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.1a1 1 0 0 0-.9.6z" />
  </svg>
);

export const ShieldIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M12 3 4.5 6v6c0 4.4 3 7.7 7.5 9 4.5-1.3 7.5-4.6 7.5-9V6z" />
  </svg>
);

export const ShieldCheckIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M12 3 4.5 6v6c0 4.4 3 7.7 7.5 9 4.5-1.3 7.5-4.6 7.5-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const ShoppingCartIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M3 4h2l2.4 10.5a1 1 0 0 0 1 .8h9.8a1 1 0 0 0 1-.8L21 7H7" />
  </svg>
);

export const StarIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => {
  const fillColor = isFilled(className) ? 'currentColor' : 'none';
  return (
    <svg {...baseProps(size, className, strokeWidth)}>
      <polygon
        fill={fillColor}
        points="12 3.5 14.7 9 20.8 9.9 16.4 14.1 17.5 20.2 12 17.3 6.5 20.2 7.6 14.1 3.2 9.9 9.3 9"
      />
    </svg>
  );
};

export const UserIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const UserPlusIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2.5 21a7 7 0 0 1 13 0" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="16" y1="11" x2="22" y2="11" />
  </svg>
);

export const XIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const SparklesIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4z" />
    <path d="m18.5 14 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" />
    <path d="m5.5 14 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" />
  </svg>
);

export const HistoryIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 3 3 8 8 8" />
    <line x1="12" y1="7" x2="12" y2="12" />
    <line x1="12" y1="12" x2="15.5" y2="14" />
  </svg>
);

export const CoinsIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <ellipse cx="9" cy="7" rx="5" ry="2.5" />
    <path d="M4 7v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" />
    <ellipse cx="16" cy="14.5" rx="4" ry="2" />
    <path d="M12 14.5V18c0 1.1 1.8 2 4 2s4-.9 4-2v-3.5" />
  </svg>
);

export const EyeIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const PlusIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const Repeat2Icon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const TagIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M20 10 11 1H4v7l9 9a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </svg>
);

export const MoreHorizontalIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="6" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="18" cy="12" r="1.5" />
  </svg>
);

export const MoreVerticalIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="12" cy="6" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="18" r="1.5" />
  </svg>
);

export const PlusSquareIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

export const UsersIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M14 20a5 5 0 0 1 7 0" />
  </svg>
);

export const CameraIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H8l1.5-2h5L16 6h2.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export const CompassIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m14.5 9.5-1.9 4-4 1.9 1.9-4z" />
  </svg>
);

export const Edit3Icon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
  </svg>
);

export const ImageIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="9" r="1.5" />
    <path d="m21 15-4.5-4.5L7 20" />
  </svg>
);

export const MapPinIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M12 22s7-5.6 7-12a7 7 0 1 0-14 0c0 6.4 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const PinIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="m9 3 6 6" />
    <path d="m14 2 2 2a2 2 0 0 1 0 2.8L13 9.8l1.2 1.2a2 2 0 0 1 0 2.8L10 18l-4-4 4.2-4.2a2 2 0 0 1 2.8 0L14 11l2.8-2.8A2 2 0 0 1 19.6 8l2 2" />
    <path d="m8 16-5 5" />
  </svg>
);

export const Trash2Icon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <line x1="10" y1="10" x2="10" y2="17" />
    <line x1="14" y1="10" x2="14" y2="17" />
  </svg>
);

export const VideoIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="m16 10 5-3v10l-5-3z" />
  </svg>
);

export const TypeIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="12" y1="7" x2="12" y2="19" />
  </svg>
);

export const AlignLeftIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="10" x2="14" y2="10" />
    <line x1="4" y1="14" x2="20" y2="14" />
    <line x1="4" y1="18" x2="14" y2="18" />
  </svg>
);

export const AlignCenterIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="7" y1="10" x2="17" y2="10" />
    <line x1="4" y1="14" x2="20" y2="14" />
    <line x1="7" y1="18" x2="17" y2="18" />
  </svg>
);

export const AlignRightIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="10" y1="10" x2="20" y2="10" />
    <line x1="4" y1="14" x2="20" y2="14" />
    <line x1="10" y1="18" x2="20" y2="18" />
  </svg>
);

export const ArrowLeftIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

export const ChevronRightIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export const ExternalLinkIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M14 3h7v7" />
    <path d="M10 14 21 3" />
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </svg>
);

export const SendIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <path d="M22 2 11 13" />
    <path d="m22 2-7 20-4-9-9-4Z" />
  </svg>
);

export const CheckIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const UserMinusIcon = ({ size = 24, className = '', strokeWidth = 2 }: ShellIconProps) => (
  <svg {...baseProps(size, className, strokeWidth)}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2.5 21a7 7 0 0 1 13 0" />
    <line x1="16" y1="11" x2="22" y2="11" />
  </svg>
);
