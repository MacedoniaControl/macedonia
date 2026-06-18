import type { RoleKey } from "@/lib/auth/roles";
import type { SessionCompanyOption } from "@/lib/auth/company-access";

export type DemoAuthUser = {
  id: string;
  fullName: string;
  email: string;
  username: string;
  password: string;
  role: RoleKey;
  companies: SessionCompanyOption[];
  defaultCompanyId: string | null;
};

export const demoAuthUsers: DemoAuthUser[] = [
  {
    id: "demo-owner",
    fullName: "Owner Demo",
    email: "owner@sumicontrol.local",
    username: "owner",
    password: "owner123",
    role: "OWNER",
    defaultCompanyId: "demo-sumigases",
    companies: [
      { id: "demo-sumigases", name: "Sumigases", slug: "sumigases" },
      { id: "demo-sudematin", name: "Sudematin", slug: "sudematin" },
    ],
  },
  {
    id: "demo-admin",
    fullName: "Admin Demo",
    email: "admin@sumicontrol.local",
    username: "admin",
    password: "admin123",
    role: "ADMIN",
    defaultCompanyId: "demo-sumigases",
    companies: [
      { id: "demo-sumigases", name: "Sumigases", slug: "sumigases" },
      { id: "demo-sudematin", name: "Sudematin", slug: "sudematin" },
    ],
  },
  {
    id: "demo-auditor",
    fullName: "Auditor Demo",
    email: "auditor@sumicontrol.local",
    username: "auditor",
    password: "audit123",
    role: "AUDITOR",
    defaultCompanyId: "demo-sudematin",
    companies: [{ id: "demo-sudematin", name: "Sudematin", slug: "sudematin" }],
  },
];
