-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'LLENADO';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PRODUCCION';

-- AlterTable
ALTER TABLE "Barrel" ADD COLUMN     "currentBatchId" TEXT,
ALTER COLUMN "id" SET DEFAULT 'BBC-' || lpad(nextval('barrel_id_seq'::regclass)::text, 3, '0');

-- AlterTable
ALTER TABLE "BarrelEvent" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "product" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCapacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fillDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- AddForeignKey
ALTER TABLE "Barrel" ADD CONSTRAINT "Barrel_currentBatchId_fkey" FOREIGN KEY ("currentBatchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarrelEvent" ADD CONSTRAINT "BarrelEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
