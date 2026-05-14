-- Remove ASIGNADO from BarrelStopStatus enum and change default to ENTREGADO
ALTER TABLE "RouteStopBarrel" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "BarrelStopStatus_new" AS ENUM ('ENTREGADO', 'RECOGIDO_VACIO', 'NOVEDAD');

UPDATE "RouteStopBarrel" SET "status" = 'ENTREGADO' WHERE "status" = 'ASIGNADO';

ALTER TABLE "RouteStopBarrel"
  ALTER COLUMN "status" TYPE "BarrelStopStatus_new"
  USING ("status"::text::"BarrelStopStatus_new");

DROP TYPE "BarrelStopStatus";
ALTER TYPE "BarrelStopStatus_new" RENAME TO "BarrelStopStatus";

ALTER TABLE "RouteStopBarrel" ALTER COLUMN "status" SET DEFAULT 'ENTREGADO';

-- CreateTable RouteStopRequirement
CREATE TABLE "RouteStopRequirement" (
    "id" TEXT NOT NULL,
    "routeStopId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "RouteStopRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable RouteBarrel
CREATE TABLE "RouteBarrel" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "barrelId" TEXT NOT NULL,
    CONSTRAINT "RouteBarrel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteBarrel_routeId_barrelId_key" ON "RouteBarrel"("routeId", "barrelId");

-- AddForeignKey
ALTER TABLE "RouteStopRequirement" ADD CONSTRAINT "RouteStopRequirement_routeStopId_fkey"
  FOREIGN KEY ("routeStopId") REFERENCES "RouteStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteBarrel" ADD CONSTRAINT "RouteBarrel_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteBarrel" ADD CONSTRAINT "RouteBarrel_barrelId_fkey"
  FOREIGN KEY ("barrelId") REFERENCES "Barrel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
