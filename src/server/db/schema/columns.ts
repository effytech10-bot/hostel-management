import { bigint, timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Money column: integer paisa (৳1 = 100). Column names end in _paisa so nobody mistakes the unit. */
export const paisa = (name: string) => bigint(name, { mode: "number" });
