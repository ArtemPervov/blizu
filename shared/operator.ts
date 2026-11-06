import type { Listing, User } from "./types.js";

export const REPORT_CATEGORIES = {
  spam: "Спам или реклама",
  fraud: "Подозрение на обман",
  inappropriate: "Неподходящий контент",
  other: "Другая причина",
} as const;
export type ReportCategory = keyof typeof REPORT_CATEGORIES;
export type OperatorUser = User & {
  createdAt: string;
  blocked: boolean;
  blockReason: string;
  listingCount: number;
  orderCount: number;
};
export type OperatorListing = Listing & {
  hidden: boolean;
  moderationReason: string;
  ownerBlocked: boolean;
};
export type ReportStatus = "open" | "resolved" | "dismissed";
export type OperatorReport = {
  id: string;
  targetType: "listing" | "user";
  targetId: string;
  targetLabel: string;
  reporterId: string;
  reporterName: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  resolution: string;
  createdAt: string;
  updatedAt: string;
  resolvedByName: string | null;
};
export type OperatorAudit = {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
};
export type OperatorSummary = {
  users: number;
  blockedUsers: number;
  publishedListings: number;
  hiddenListings: number;
  openReports: number;
  totalReports: number;
};
export type OperatorPageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export const AUDIT_ACTIONS: Record<string, string> = {
  "user.block": "Аккаунт заблокирован",
  "user.unblock": "Аккаунт разблокирован",
  "user.verify": "Отметка профиля добавлена",
  "user.unverify": "Отметка профиля снята",
  "listing.hide": "Предложение скрыто",
  "listing.restore": "Скрытие предложения снято",
  "report.resolved": "Жалоба рассмотрена",
  "report.dismissed": "Жалоба отклонена",
  "operator.provision": "Создан доступ оператора",
  "operator.grant": "Выдан доступ оператора",
  "operator.revoke": "Отозван доступ оператора",
};
