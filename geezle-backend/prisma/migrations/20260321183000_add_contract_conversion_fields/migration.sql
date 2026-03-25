ALTER TABLE "Contract"
ADD COLUMN     "contractValue" DOUBLE PRECISION,
ADD COLUMN     "deliveryDays" INTEGER,
ADD COLUMN     "paymentSchedule" JSONB,
ADD COLUMN     "milestones" JSONB;
