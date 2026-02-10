-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[];
