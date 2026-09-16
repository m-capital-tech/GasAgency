// Design tokens shared by mobile and web (PRD §10)
export const colors = {
  primary: "#F26B1D",
  primaryDark: "#D4550C",
  primarySoft: "#FFF1E8",
  navy: "#12263A",
  ink: "#12263A",
  inkMuted: "#5B6B7B",
  inkFaint: "#93A0AD",
  success: "#1E9E5A",
  successSoft: "#E6F6EC",
  warning: "#E0A100",
  warningSoft: "#FFF7DB",
  danger: "#D93B3B",
  dangerSoft: "#FDECEC",
  info: "#2F6FED",
  infoSoft: "#EAF0FE",
  bg: "#F4F5F7",
  surface: "#FFFFFF",
  surfaceAlt: "#F8F9FA",
  border: "#E6E9ED",
  borderStrong: "#CBD2D9",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const omcColors: Record<string, { bg: string; fg: string }> = {
  HP: { bg: "#EAF0FE", fg: "#2F6FED" },
  IOCL: { bg: "#FFF1E8", fg: "#D4550C" },
  BPCL: { bg: "#FFF7DB", fg: "#9A6B00" },
};

export const statusColors: Record<string, { bg: string; fg: string }> = {
  PENDING_PAYMENT: { bg: "#FFF7DB", fg: "#9A6B00" },
  PAYMENT_FAILED: { bg: "#FDECEC", fg: "#B42323" },
  PLACED: { bg: "#EAF0FE", fg: "#2F6FED" },
  ACCEPTED: { bg: "#EAF0FE", fg: "#1D4FB8" },
  ASSIGNED: { bg: "#F1E9FF", fg: "#6A3FC7" },
  OUT_FOR_DELIVERY: { bg: "#FFF1E8", fg: "#D4550C" },
  DELIVERED: { bg: "#E6F6EC", fg: "#1E9E5A" },
  DELIVERY_FAILED: { bg: "#FDECEC", fg: "#B42323" },
  REJECTED: { bg: "#FDECEC", fg: "#B42323" },
  CANCELLED: { bg: "#EEF0F2", fg: "#5B6B7B" },
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const font = {
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, hero: 34 },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const;
