-- AlterTable: add parent_share_id to shares
ALTER TABLE "shares" ADD COLUMN "parent_share_id" TEXT;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_parent_share_id_fkey"
  FOREIGN KEY ("parent_share_id") REFERENCES "shares"("id") ON DELETE SET NULL ON UPDATE CASCADE;
