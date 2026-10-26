import type { AppRole } from "./access";

/** `db/seed.sql` içindeki kullanıcılar. */
export const DEMO_ACCOUNTS: { role: AppRole; email: string }[] = [
  { role: "owner", email: "patron@demo.gastroflow" },
  { role: "manager", email: "mudur@demo.gastroflow" },
  { role: "waiter", email: "garson@demo.gastroflow" },
  { role: "chef", email: "sef@demo.gastroflow" },
  { role: "cashier", email: "kasiyer@demo.gastroflow" },
  { role: "storekeeper", email: "depo@demo.gastroflow" },
  { role: "accountant", email: "muhasebe@demo.gastroflow" },
];

export const DEMO_PASSWORD = "demo1234";
