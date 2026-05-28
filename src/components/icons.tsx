import {
  IconAdjustmentsHorizontal,
  IconRefresh,
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconAtom2,
  IconBell,
  IconBold,
  IconBox,
  IconBrandGithub,
  IconBrandTwitter,
  IconBrightness,
  IconCalendar,
  IconCalendarEvent,
  IconChartHistogram,
  IconChartLine,
  IconCheck,
  IconChecks,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsDown,
  IconChevronsLeft,
  IconChevronsRight,
  IconChevronUp,
  IconCircle,
  IconCircleCheck,
  IconCirclePlus,
  IconCircleX,
  IconClipboardText,
  IconClock,
  IconCode,
  IconCommand,
  IconCreditCard,
  IconCrown,
  IconDeviceDesktopAnalytics,
  IconDeviceLaptop,
  IconDots,
  IconDotsVertical,
  IconEdit,
  IconExternalLink,
  IconEyeOff,
  IconFile,
  IconFileDescription,
  IconFileText,
  IconFileTypeDoc,
  IconFileTypePdf,
  IconFileTypeXls,
  IconFileZip,
  IconFlask,
  IconFlask2,
  IconFolder,
  IconGripVertical,
  IconHelpCircle,
  IconHierarchy,
  IconInfoCircle,
  IconItalic,
  IconLayoutDashboard,
  IconLayoutKanban,
  IconLayoutSidebar,
  IconLoader2,
  IconLock,
  IconLogin,
  IconLogout,
  IconMessage,
  IconMinus,
  IconMoon,
  IconMusic,
  IconPalette,
  IconPaperclip,
  IconPhone,
  IconPhoto,
  IconPizza,
  IconPlus,
  type IconProps,
  IconRosetteDiscountCheck,
  IconSearch,
  IconSelector,
  IconSend,
  IconSettings,
  IconShare,
  IconSlash,
  IconSparkles,
  IconStack2,
  IconStar,
  IconSun,
  IconTestPipe,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
  IconTypography,
  IconUnderline,
  IconUpload,
  IconUser,
  IconUserCircle,
  IconUserEdit,
  IconUsers,
  IconUsersGroup,
  IconUserX,
  IconVideo,
  IconX
} from '@tabler/icons-react';

export type Icon = React.ComponentType<IconProps>;

/**
 * R237a-v2: original PDF file glyph (Zotero-style) — a sheet with a folded
 * corner and a red "PDF" tab. Hand-drawn SVG (not a trademarked logo) so it's
 * safe to ship. Inherits size via width/height props; the red label is fixed.
 */
function PdfFileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      aria-hidden
    >
      <path
        d='M6 2.75h7.5L19.25 8.5v11.75a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z'
        fill='currentColor'
        fillOpacity='0.08'
        stroke='currentColor'
        strokeWidth='1.4'
        strokeLinejoin='round'
      />
      <path
        d='M13.5 2.75V8.5h5.75'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.4'
        strokeLinejoin='round'
      />
      <rect x='3.5' y='12.5' width='11' height='6' rx='1.2' fill='#dc2626' />
      <text
        x='9'
        y='17'
        textAnchor='middle'
        fontSize='4.2'
        fontWeight='700'
        fill='white'
        fontFamily='Arial, sans-serif'
      >
        PDF
      </text>
    </svg>
  );
}

export const Icons = {
  // General
  alertCircle: IconAlertCircle,
  warning: IconAlertTriangle,
  arrowRight: IconArrowRight,
  check: IconCheck,
  checks: IconChecks,
  circleCheck: IconCircleCheck,
  close: IconX,
  clock: IconClock,
  code: IconCode,
  dots: IconDots,
  ellipsis: IconDotsVertical,
  externalLink: IconExternalLink,
  help: IconHelpCircle,
  info: IconInfoCircle,
  spinner: IconLoader2,
  search: IconSearch,
  settings: IconSettings,
  trash: IconTrash,

  // Navigation / Chevrons
  chevronDown: IconChevronDown,
  chevronLeft: IconChevronLeft,
  chevronRight: IconChevronRight,
  chevronUp: IconChevronUp,
  chevronsDown: IconChevronsDown,
  chevronsLeft: IconChevronsLeft,
  chevronsRight: IconChevronsRight,
  chevronsUpDown: IconSelector,

  // Layout
  dashboard: IconLayoutDashboard,
  kanban: IconLayoutKanban,
  panelLeft: IconLayoutSidebar,

  // User
  user: IconUser,
  user2: IconUserCircle,
  account: IconUserCircle,
  profile: IconUser,
  employee: IconUserX,
  userPen: IconUserEdit,
  teams: IconUsers,

  // Brand
  github: IconBrandGithub,
  twitter: IconBrandTwitter,
  logo: IconCommand,

  // Communication
  chat: IconMessage,
  notification: IconBell,
  phone: IconPhone,
  video: IconVideo,
  send: IconSend,
  paperclip: IconPaperclip,

  // Files
  page: IconFile,
  post: IconFileText,
  fileTypePdf: IconFileTypePdf,
  fileTypeDoc: IconFileTypeDoc,
  fileTypeXls: IconFileTypeXls,
  fileZip: IconFileZip,
  media: IconPhoto,
  music: IconMusic,

  // Actions
  add: IconPlus,
  edit: IconEdit,
  upload: IconUpload,
  share: IconShare,
  login: IconLogin,
  logout: IconLogout,
  gripVertical: IconGripVertical,

  // Shapes / Indicators
  circle: IconCircle,
  circleX: IconCircleX,
  plusCircle: IconCirclePlus,
  xCircle: IconCircleX,
  minus: IconMinus,

  // Theme
  sun: IconSun,
  moon: IconMoon,
  brightness: IconBrightness,
  laptop: IconDeviceLaptop,
  palette: IconPalette,

  // Commerce / Plans
  billing: IconCreditCard,
  creditCard: IconCreditCard,
  product: IconBox,
  pro: IconCrown,
  exclusive: IconStar,
  sparkles: IconSparkles,
  badgeCheck: IconRosetteDiscountCheck,
  lock: IconLock,

  // Data / Charts
  trendingDown: IconTrendingDown,
  trendingUp: IconTrendingUp,
  eyeOff: IconEyeOff,
  adjustments: IconAdjustmentsHorizontal,
  refresh: IconRefresh,

  // Text formatting
  bold: IconBold,
  italic: IconItalic,
  underline: IconUnderline,
  text: IconTypography,

  // Toast
  toastSuccess: IconCircleCheck,
  toastInfo: IconInfoCircle,
  toastWarning: IconAlertTriangle,
  toastError: IconCircleX,
  toastLoading: IconLoader2,

  // Misc
  pizza: IconPizza,
  workspace: IconFolder,
  forms: IconClipboardText,
  slash: IconSlash,
  calendar: IconCalendar,
  galleryVerticalEnd: IconStack2,
  moreHorizontal: IconDots,
  // Lab domains
  materials: IconAtom2,
  samples: IconTestPipe,
  experiments: IconFlask,
  spectra: IconChartLine,
  dataAssets: IconChartHistogram,
  lineage: IconHierarchy,
  chemicals: IconFlask2,
  equipment: IconDeviceDesktopAnalytics,
  bookings: IconCalendarEvent,
  members: IconUsersGroup,
  papers: IconFileDescription,
  aiAssistant: IconSparkles,
  pdfFile: PdfFileIcon
};
