/**
 * Çok dilli arayüz — sözlükler.
 *
 * Kapsam bilinçli olarak sınırlı: kabuk (menü, roller, çıkış), giriş ekranı
 * ve en sık kullanılan operasyon ekranları (POS/salon, sipariş, mutfak
 * gönderimi, kasa/ödeme, patron paneli başlığı) çevrildi. Geri kalan
 * ekranlar (raporlar, satın alma, reçeteler, ayarlar, denetim, mutfak
 * ekranının gövdesi) henüz `dict`e hiç bağlanmadı — JSX'te doğrudan Türkçe
 * metin olarak duruyor, İngilizce seçilse bile Türkçe görünür. Kapsamı
 * genişletmek: (1) buraya yeni anahtar eklemek, (2) ilgili ekranda
 * `getServerDictionary()`/`useI18n()` ile o anahtarı kullanmak.
 */

export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "tr";
export const LOCALE_COOKIE = "gf_locale";

export type Dictionary = {
  nav: {
    pos: string;
    orders: string;
    kds: string;
    cash: string;
    inventory: string;
    recipes: string;
    purchasing: string;
    reports: string;
    m: string;
    approvals: string;
    audit: string;
    settings: string;
  };
  role: {
    owner: string;
    manager: string;
    chef: string;
    waiter: string;
    cashier: string;
    storekeeper: string;
    accountant: string;
  };
  shell: { signOut: string; business: string };
  login: {
    title: string;
    email: string;
    password: string;
    submit: string;
    submitting: string;
    noAccount: string;
  };
  pos: {
    floorTitle: string;
    noTables: string;
    seats: string;
    empty: string;
    backToFloor: string;
    noItems: string;
    cartEmpty: string;
    total: string;
    sendToKitchen: string;
    nothingToSend: string;
  };
  cash: {
    title: string;
    noOpenOrders: string;
    backToCash: string;
    products: string;
    remaining: string;
    payButton: string;
    fullAmount: string;
    closed: string;
  };
  m: { title: string };
};

const tr: Dictionary = {
  nav: {
    pos: "Sipariş Al",
    orders: "Siparişler",
    kds: "Mutfak",
    cash: "Kasa",
    inventory: "Stok",
    recipes: "Reçeteler",
    purchasing: "Satın Alma",
    reports: "Raporlar",
    m: "Patron Paneli",
    approvals: "Onaylar",
    audit: "Loglar",
    settings: "Ayarlar",
  },
  role: {
    owner: "Patron",
    manager: "Müdür",
    chef: "Mutfak",
    waiter: "Garson",
    cashier: "Kasa",
    storekeeper: "Depo",
    accountant: "Muhasebe",
  },
  shell: {
    signOut: "Çıkış",
    business: "İşletme",
  },
  login: {
    title: "Restoran yönetim sistemi",
    email: "E-posta",
    password: "Şifre",
    submit: "Giriş yap",
    submitting: "Giriş yapılıyor…",
    noAccount: "Hesabınız yoksa işletme yöneticinize başvurun. Bu sisteme kendi kendine kayıt olunamaz.",
  },
  pos: {
    floorTitle: "Salon",
    noTables: "Henüz masa tanımlanmamış. Ayarlar → Salon ve masalar bölümünden ekle.",
    seats: "kişilik",
    empty: "Boş",
    backToFloor: "← Salon",
    noItems: "Satılabilir ürün yok. Reçeteler → menü ürününe fiyat tanımla.",
    cartEmpty: "Sepet boş. Soldan ürün seç.",
    total: "Toplam",
    sendToKitchen: "Mutfağa gönder",
    nothingToSend: "Gönderilecek ürün yok",
  },
  cash: {
    title: "Kasa",
    noOpenOrders: "Açık adisyon yok.",
    backToCash: "← Kasa",
    products: "Ürünler",
    remaining: "Kalan bakiye",
    payButton: "Ödemeyi al",
    fullAmount: "Tamamı",
    closed: "Bu adisyon tamamen ödendi ve kapatıldı.",
  },
  m: {
    title: "Patron Paneli",
  },
} as const;

const en: Dictionary = {
  nav: {
    pos: "Take Order",
    orders: "Orders",
    kds: "Kitchen",
    cash: "Cash Register",
    inventory: "Inventory",
    recipes: "Recipes",
    purchasing: "Purchasing",
    reports: "Reports",
    m: "Owner Dashboard",
    approvals: "Approvals",
    audit: "Audit Log",
    settings: "Settings",
  },
  role: {
    owner: "Owner",
    manager: "Manager",
    chef: "Chef",
    waiter: "Waiter",
    cashier: "Cashier",
    storekeeper: "Storekeeper",
    accountant: "Accountant",
  },
  shell: {
    signOut: "Sign out",
    business: "Business",
  },
  login: {
    title: "Restaurant management system",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    noAccount: "If you don't have an account, ask your business admin. Self-registration isn't available.",
  },
  pos: {
    floorTitle: "Floor",
    noTables: "No tables defined yet. Add them under Settings → Floor and tables.",
    seats: "seats",
    empty: "Empty",
    backToFloor: "← Floor",
    noItems: "No sellable items. Set a price for a menu item under Recipes.",
    cartEmpty: "Cart is empty. Pick an item on the left.",
    total: "Total",
    sendToKitchen: "Send to kitchen",
    nothingToSend: "Nothing to send",
  },
  cash: {
    title: "Cash Register",
    noOpenOrders: "No open orders.",
    backToCash: "← Cash register",
    products: "Items",
    remaining: "Remaining balance",
    payButton: "Take payment",
    fullAmount: "Full amount",
    closed: "This order is fully paid and closed.",
  },
  m: {
    title: "Owner Dashboard",
  },
};

const dictionaries: Record<Locale, Dictionary> = { tr, en };

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}
