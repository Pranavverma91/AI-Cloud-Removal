import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
export const analyses = sqliteTable("analyses", {
    id: text("id").primaryKey(), owner: text("owner").notNull(), type: text("type").notNull(),
    title: text("title").notNull(), createdAt: text("created_at").notNull(), payload: text("payload").notNull(),
}, table => [index("idx_analyses_owner_created").on(table.owner, table.createdAt)]);
export const personalRecords = sqliteTable('personal_records', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), kind:text('kind').notNull(), payload:text('payload').notNull(),createdAt:text('created_at').notNull(),
},table=>[index('idx_personal_owner_kind_created').on(table.owner,table.kind,table.createdAt)]);
export const personalLimits = sqliteTable('personal_limits', {id:text('id').primaryKey(),payload:text('payload').notNull()});
