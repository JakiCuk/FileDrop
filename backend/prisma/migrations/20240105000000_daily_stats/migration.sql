CREATE TABLE "daily_stats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shares_created" INTEGER NOT NULL,
    "shares_active" INTEGER NOT NULL,
    "total_files" INTEGER NOT NULL,
    "total_storage_bytes" BIGINT NOT NULL,
    "total_users" INTEGER NOT NULL,
    "total_downloads" INTEGER NOT NULL,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_stats_date_key" ON "daily_stats"("date");
