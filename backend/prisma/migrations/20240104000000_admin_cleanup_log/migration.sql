-- CreateTable
CREATE TABLE "cleanup_logs" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "shares_deleted" INTEGER NOT NULL,
    "bytes_freed" BIGINT NOT NULL,
    "error" TEXT,

    CONSTRAINT "cleanup_logs_pkey" PRIMARY KEY ("id")
);
