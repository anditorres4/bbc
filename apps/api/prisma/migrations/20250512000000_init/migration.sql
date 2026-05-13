-- ─────────────────────────────────────────────────────────────────────────────
-- BBC Barrel Track — Migración inicial
-- ─────────────────────────────────────────────────────────────────────────────

-- Secuencia para IDs de barril: BBC-001, BBC-002, ...
CREATE SEQUENCE IF NOT EXISTS barrel_id_seq START 1;

-- CreateEnum
CREATE TYPE "BarrelStatus" AS ENUM (
  'EN_BODEGA',
  'EN_ALISTAMIENTO',
  'EN_TRANSPORTE',
  'ENTREGADO',
  'EN_RECOGIDA',
  'DEVUELTO',
  'EN_MANTENIMIENTO',
  'BAJA'
);

-- CreateEnum
CREATE TYPE "EventType" AS ENUM (
  'REGISTRO',
  'ALISTAMIENTO',
  'SALIDA_BODEGA',
  'LLEGADA_PUNTO',
  'ENTREGA_LLENO',
  'RECOGIDA_VACIO',
  'RETORNO_BODEGA',
  'ENVIO_MANTENIMIENTO',
  'RETORNO_MANTENIMIENTO',
  'DISPOSICION_FINAL',
  'NOVEDAD'
);

-- CreateEnum
CREATE TYPE "Role" AS ENUM (
  'ADMIN',
  'SUPERVISOR',
  'OPERARIO_BODEGA',
  'TRANSPORTISTA'
);

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM (
  'PLANIFICADA',
  'EN_CURSO',
  'COMPLETADA',
  'CON_NOVEDAD',
  'CANCELADA'
);

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM (
  'PENDIENTE',
  'COMPLETADA',
  'CON_NOVEDAD',
  'CANCELADA'
);

-- CreateEnum
CREATE TYPE "BarrelStopStatus" AS ENUM (
  'ASIGNADO',
  'ENTREGADO',
  'RECOGIDO_VACIO',
  'NOVEDAD'
);

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM (
  'SIN_MOVIMIENTO_60_DIAS',
  'NOVEDAD_EN_RUTA',
  'BARRIL_PROXIMO_MANTENIMIENTO',
  'BARRIL_FIN_VIDA_UTIL',
  'RUTA_SIN_CERRAR'
);

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM (
  'INFO',
  'WARNING',
  'CRITICAL'
);

-- CreateTable: User
CREATE TABLE "User" (
    "id"           TEXT        NOT NULL,
    "email"        TEXT        NOT NULL,
    "passwordHash" TEXT        NOT NULL,
    "name"         TEXT        NOT NULL,
    "phone"        TEXT,
    "role"         "Role"      NOT NULL DEFAULT 'OPERARIO_BODEGA',
    "isActive"     BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DeliveryPoint
CREATE TABLE "DeliveryPoint" (
    "id"          TEXT        NOT NULL,
    "name"        TEXT        NOT NULL,
    "address"     TEXT        NOT NULL,
    "lat"         DOUBLE PRECISION,
    "lng"         DOUBLE PRECISION,
    "phone"       TEXT,
    "contactName" TEXT,
    "isActive"    BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Barrel
-- El id se genera automáticamente: BBC-001, BBC-002...
CREATE TABLE "Barrel" (
    "id"                  TEXT         NOT NULL DEFAULT 'BBC-' || lpad(nextval('barrel_id_seq'::regclass)::text, 3, '0'),
    "qrCode"              TEXT         NOT NULL,
    "status"              "BarrelStatus" NOT NULL DEFAULT 'EN_BODEGA',
    "capacity"            INTEGER      NOT NULL,
    "manufactureDate"     TIMESTAMP(3) NOT NULL,
    "lastMaintenanceDate" TIMESTAMP(3),
    "maxLifeYears"        INTEGER      NOT NULL DEFAULT 10,
    "product"             TEXT,
    "notes"               TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "createdById"         TEXT         NOT NULL,

    CONSTRAINT "Barrel_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Route
CREATE TABLE "Route" (
    "id"             TEXT          NOT NULL,
    "name"           TEXT          NOT NULL,
    "date"           TIMESTAMP(3)  NOT NULL,
    "status"         "RouteStatus" NOT NULL DEFAULT 'PLANIFICADA',
    "transportistId" TEXT          NOT NULL,
    "vehiclePlate"   TEXT,
    "departedAt"     TIMESTAMP(3),
    "arrivedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RouteStop
CREATE TABLE "RouteStop" (
    "id"               TEXT         NOT NULL,
    "routeId"          TEXT         NOT NULL,
    "deliveryPointId"  TEXT         NOT NULL,
    "position"         INTEGER      NOT NULL,
    "status"           "StopStatus" NOT NULL DEFAULT 'PENDIENTE',
    "barrelsAssigned"  INTEGER      NOT NULL,
    "barrelsDelivered" INTEGER      NOT NULL DEFAULT 0,
    "barrelsPickedUp"  INTEGER      NOT NULL DEFAULT 0,
    "deliveredAt"      TIMESTAMP(3),
    "lat"              DOUBLE PRECISION,
    "lng"              DOUBLE PRECISION,

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RouteStopBarrel
CREATE TABLE "RouteStopBarrel" (
    "id"              TEXT             NOT NULL,
    "routeStopId"     TEXT             NOT NULL,
    "barrelId"        TEXT             NOT NULL,
    "product"         TEXT             NOT NULL,
    "status"          "BarrelStopStatus" NOT NULL DEFAULT 'ASIGNADO',
    "deliveredAt"     TIMESTAMP(3),
    "pickedUpEmptyAt" TIMESTAMP(3),

    CONSTRAINT "RouteStopBarrel_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BarrelEvent (append-only — nunca se modifica ni elimina)
CREATE TABLE "BarrelEvent" (
    "id"              TEXT          NOT NULL,
    "barrelId"        TEXT          NOT NULL,
    "type"            "EventType"   NOT NULL,
    "fromStatus"      "BarrelStatus",
    "toStatus"        "BarrelStatus" NOT NULL,
    "userId"          TEXT          NOT NULL,
    "routeId"         TEXT,
    "deliveryPointId" TEXT,
    "lat"             DOUBLE PRECISION,
    "lng"             DOUBLE PRECISION,
    "notes"           TEXT,
    "timestamp"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarrelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Alert
CREATE TABLE "Alert" (
    "id"          TEXT            NOT NULL,
    "type"        "AlertType"     NOT NULL,
    "barrelId"    TEXT,
    "routeId"     TEXT,
    "routeStopId" TEXT,
    "message"     TEXT            NOT NULL,
    "severity"    "AlertSeverity" NOT NULL,
    "isRead"      BOOLEAN         NOT NULL DEFAULT false,
    "readById"    TEXT,
    "readAt"      TIMESTAMP(3),
    "targetRoles" "Role"[]        NOT NULL,
    "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Barrel_qrCode_key" ON "Barrel"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_routeId_position_key" ON "RouteStop"("routeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStopBarrel_routeStopId_barrelId_key" ON "RouteStopBarrel"("routeStopId", "barrelId");

-- CreateIndex
CREATE INDEX "BarrelEvent_barrelId_timestamp_idx" ON "BarrelEvent"("barrelId", "timestamp");

-- CreateIndex
CREATE INDEX "BarrelEvent_timestamp_idx" ON "BarrelEvent"("timestamp");

-- AddForeignKey: Barrel → User
ALTER TABLE "Barrel" ADD CONSTRAINT "Barrel_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Route → User
ALTER TABLE "Route" ADD CONSTRAINT "Route_transportistId_fkey"
    FOREIGN KEY ("transportistId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: RouteStop → Route
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "Route"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: RouteStop → DeliveryPoint
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_deliveryPointId_fkey"
    FOREIGN KEY ("deliveryPointId") REFERENCES "DeliveryPoint"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: RouteStopBarrel → RouteStop
ALTER TABLE "RouteStopBarrel" ADD CONSTRAINT "RouteStopBarrel_routeStopId_fkey"
    FOREIGN KEY ("routeStopId") REFERENCES "RouteStop"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: RouteStopBarrel → Barrel
ALTER TABLE "RouteStopBarrel" ADD CONSTRAINT "RouteStopBarrel_barrelId_fkey"
    FOREIGN KEY ("barrelId") REFERENCES "Barrel"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: BarrelEvent → Barrel
ALTER TABLE "BarrelEvent" ADD CONSTRAINT "BarrelEvent_barrelId_fkey"
    FOREIGN KEY ("barrelId") REFERENCES "Barrel"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: BarrelEvent → User
ALTER TABLE "BarrelEvent" ADD CONSTRAINT "BarrelEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: BarrelEvent → Route
ALTER TABLE "BarrelEvent" ADD CONSTRAINT "BarrelEvent_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "Route"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: BarrelEvent → DeliveryPoint
ALTER TABLE "BarrelEvent" ADD CONSTRAINT "BarrelEvent_deliveryPointId_fkey"
    FOREIGN KEY ("deliveryPointId") REFERENCES "DeliveryPoint"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Alert → Barrel
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_barrelId_fkey"
    FOREIGN KEY ("barrelId") REFERENCES "Barrel"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Alert → Route
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "Route"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Alert → RouteStop
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_routeStopId_fkey"
    FOREIGN KEY ("routeStopId") REFERENCES "RouteStop"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Alert → User (readBy)
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_readById_fkey"
    FOREIGN KEY ("readById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: RefreshToken (almacenados en DB para poder revocarlos)
CREATE TABLE "RefreshToken" (
    "id"        TEXT        NOT NULL,
    "token"     TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey: RefreshToken → User (CASCADE: borrar tokens si se borra el usuario)
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
