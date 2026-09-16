// Design tokens shared by mobile and web.
// Palette (investor brief): charcoal #1D1D1E · maroon #620A1A · gold #C6953F · red #A31E21 · sand #E9E3D6 · off-white #F9F7F5
// Mix: red = actions/brand (cylinders), gold = money/premium accents, maroon = depth/danger, charcoal = text/dark surfaces.
// The one colour outside the palette is a muted green for "delivered / online / paid" so success never reads as the red primary.
export const palette = {
  charcoal: "#1D1D1E",
  maroon: "#620A1A",
  gold: "#C6953F",
  red: "#A31E21",
  sand: "#E9E3D6",
  offWhite: "#F9F7F5",
} as const;

export const colors = {
  primary: palette.red,
  primaryDark: palette.maroon,
  primarySoft: "#F6E3E1",
  gold: palette.gold,
  goldDark: "#9C7328",
  goldSoft: "#F5ECD9",
  navy: palette.charcoal,
  ink: palette.charcoal,
  inkMuted: "#5F5852",
  inkFaint: "#9A918A",
  success: "#2E7D4F",
  successSoft: "#E3EFE6",
  warning: palette.gold,
  warningSoft: "#F5ECD9",
  danger: palette.maroon,
  dangerSoft: "#F2E1E1",
  info: palette.charcoal,
  infoSoft: "#ECE7DF",
  bg: palette.sand,
  surface: palette.offWhite,
  surfaceAlt: "#F1ECE3",
  border: "#DAD1C3",
  borderStrong: "#C3B8A6",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const omcColors: Record<string, { bg: string; fg: string }> = {
  HP: { bg: "#ECE7DF", fg: "#1D1D1E" },
  IOCL: { bg: "#F6E3E1", fg: "#A31E21" },
  BPCL: { bg: "#F5ECD9", fg: "#9C7328" },
};

export const statusColors: Record<string, { bg: string; fg: string }> = {
  PENDING_PAYMENT: { bg: "#F5ECD9", fg: "#9C7328" },
  PAYMENT_FAILED: { bg: "#F2E1E1", fg: "#620A1A" },
  PLACED: { bg: "#ECE7DF", fg: "#1D1D1E" },
  ACCEPTED: { bg: "#ECE7DF", fg: "#3A3633" },
  ASSIGNED: { bg: "#F5ECD9", fg: "#9C7328" },
  OUT_FOR_DELIVERY: { bg: "#F6E3E1", fg: "#A31E21" },
  DELIVERED: { bg: "#E3EFE6", fg: "#2E7D4F" },
  DELIVERY_FAILED: { bg: "#F2E1E1", fg: "#620A1A" },
  REJECTED: { bg: "#F2E1E1", fg: "#620A1A" },
  CANCELLED: { bg: "#ECE7DF", fg: "#5F5852" },
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const font = {
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, hero: 34 },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const;
