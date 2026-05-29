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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      aria-hidden
    >
      <path d='M5 6h14' />
      <path d='M10 4h4' />
      <path d='M6 6l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2 -2l1 -13' />
    </svg>
  );
}

function PdfFileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      aria-hidden
    >
      <path d='M14 3v4a1 1 0 0 0 1 1h4' />
      <path d='M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4' />
      <g stroke='#E2574C'>
        <path d='M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6' />
        <path d='M11 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1z' />
        <path d='M17 18h2' />
        <path d='M20 15h-3v6' />
      </g>
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
  trash: TrashIcon,

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
