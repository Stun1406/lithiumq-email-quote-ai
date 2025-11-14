import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  // attach prisma to global to prevent multiple instances during hot reloads
  // eslint-disable-next-line no-var
  var __PRISMA_CLIENT__: PrismaClient | undefined;
}

export const prisma = global.__PRISMA_CLIENT__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__PRISMA_CLIENT__ = prisma;
}

export default prisma;
