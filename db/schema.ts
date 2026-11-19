import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const sofaRooms = sqliteTable("sofa_rooms", {
  code: text("code").primaryKey(),
  revision: integer("revision").notNull().default(0),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  jonSeen: integer("jon_seen").notNull().default(0),
  lydiaSeen: integer("lydia_seen").notNull().default(0),
}, table => [index("sofa_rooms_expiry_idx").on(table.expiresAt)]);
