export const CITIES = [
  "Бар",
  "Будва",
  "Котор",
  "Тиват",
  "Подгорица",
  "Херцег-Нови",
  "Бечичи",
  "Сутоморе",
  "Ульцинь",
  "Цетине",
  "Никшич",
  "Вся Черногория",
] as const;
export const CATEGORIES = [
  {
    id: "all",
    name: "Все категории",
    en: "All categories",
    sr: "Sve kategorije",
    icon: "grid",
  },
  {
    id: "repair",
    name: "Дом и ремонт",
    en: "Home & repairs",
    sr: "Dom i popravke",
    icon: "wrench",
  },
  {
    id: "food",
    name: "Домашняя еда",
    en: "Homemade food",
    sr: "Domaća hrana",
    icon: "chef",
  },
  {
    id: "auto",
    name: "Авто и транспорт",
    en: "Auto & transport",
    sr: "Auto i prevoz",
    icon: "car",
  },
  {
    id: "beauty",
    name: "Красота и здоровье",
    en: "Beauty & wellness",
    sr: "Ljepota i zdravlje",
    icon: "sparkles",
  },
  {
    id: "business",
    name: "Бизнес и документы",
    en: "Business & documents",
    sr: "Posao i dokumenta",
    icon: "briefcase",
  },
  {
    id: "goods",
    name: "Товары и магазины",
    en: "Goods & shops",
    sr: "Roba i prodavnice",
    icon: "bag",
  },
  {
    id: "delivery",
    name: "Доставка и посылки",
    en: "Delivery & parcels",
    sr: "Dostava i paketi",
    icon: "package",
  },
] as const;
export type Role = "customer" | "provider" | "arbiter";
export type User = {
  id: string;
  name: string;
  email: string;
  city: string;
  role: Role;
  contact: string;
  rating: number;
  verified: boolean;
  isOperator: boolean;
};
export type Listing = {
  id: string;
  providerId: string;
  title: string;
  description: string;
  category: string;
  city: string;
  price: number;
  unit: string;
  image: string;
  tags: string[];
  providerName: string;
  providerRating: number;
  providerVerified: boolean;
  reviewCount: number;
  createdAt: string;
  hidden?: boolean;
  moderationReason?: string;
  ownerBlocked?: boolean;
  source?: ListingSource;
};
export type ListingSource = {
  kind: "telegram";
  channel: string;
  messageId: number;
  authorName: string;
  postedAt: string;
  importedAt: string;
  url: string;
  priceLabel: string;
  priceKnown: boolean;
  photos: string[];
};
export type ServiceRequest = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  description: string;
  category: string;
  city: string;
  budget: number;
  kind: "service" | "delivery";
  productUrl: string;
  origin: string;
  status: "open" | "assigned" | "closed";
  createdAt: string;
  offerCount: number;
};
export type Offer = {
  id: string;
  requestId: string;
  providerId: string;
  providerName: string;
  providerRating: number;
  price: number;
  message: string;
  eta: string;
  createdAt: string;
};
export type OrderStatus =
  | "confirmed"
  | "in_progress"
  | "in_transit"
  | "arrived"
  | "completed"
  | "disputed"
  | "resolved";
export const STATUS_LABELS: Record<OrderStatus, string> = {
  confirmed: "Условия согласованы",
  in_progress: "В работе",
  in_transit: "В пути",
  arrived: "Готов к получению",
  completed: "Завершён",
  disputed: "Открыт спор",
  resolved: "Спор разрешён",
};
export type Order = {
  id: string;
  customerId: string;
  providerId: string;
  title: string;
  kind: "service" | "delivery";
  city: string;
  price: number;
  status: OrderStatus;
  customerName: string;
  providerName: string;
  customerContact: string;
  providerContact: string;
  updatedAt: string;
  createdAt: string;
  requestId: string | null;
};
export type OrderEvent = {
  id: string;
  orderId: string;
  status: OrderStatus;
  note: string;
  createdAt: string;
};
export type Message = {
  id: string;
  orderId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
};
export type Incident = {
  id: string;
  orderId: string;
  title: string;
  description: string;
  evidence: string;
  status: "open" | "closed";
  resolution: string;
  decision: string;
  refundAmount: number;
  createdAt: string;
  customerName: string;
  providerName: string;
};
export type Notification = {
  id: string;
  userId: string;
  text: string;
  href: string;
  read: boolean;
  createdAt: string;
};
export type OrderDetail = {
  order: Order;
  events: OrderEvent[];
  messages: Message[];
  incident: Incident | null;
};
