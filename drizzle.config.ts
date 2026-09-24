import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations use the session pooler (port 5432); the app uses the transaction pooler.
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
