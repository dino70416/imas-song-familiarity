-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "shareCode" TEXT NOT NULL,
    "themeColor" TEXT NOT NULL DEFAULT '#92cfbb',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Song" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "musicType" TEXT NOT NULL,
    "lyrics" TEXT,
    "composer" TEXT,
    "arranger" TEXT,
    "lowestPitch" TEXT,
    "highestPitch" TEXT,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cvName" TEXT,
    "taxId" INTEGER,
    "kana" TEXT,
    "cvKana" TEXT,
    "production" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "taxId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kana" TEXT,
    "production" TEXT,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitMember" (
    "unitId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "UnitMember_pkey" PRIMARY KEY ("unitId","memberId")
);

-- CreateTable
CREATE TABLE "SongUnit" (
    "songId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "SongUnit_pkey" PRIMARY KEY ("songId","unitId")
);

-- CreateTable
CREATE TABLE "SongMember" (
    "songId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "SongMember_pkey" PRIMARY KEY ("songId","memberId")
);

-- CreateTable
CREATE TABLE "UserSelection" (
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "familiarity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSelection_pkey" PRIMARY KEY ("userId","songId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_shareCode_key" ON "User"("shareCode");

-- CreateIndex
CREATE UNIQUE INDEX "Song_slug_key" ON "Song"("slug");

-- CreateIndex
CREATE INDEX "Song_brand_idx" ON "Song"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "Member_name_key" ON "Member"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Member_taxId_key" ON "Member"("taxId");

-- CreateIndex
CREATE INDEX "Member_production_idx" ON "Member"("production");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_taxId_key" ON "Unit"("taxId");

-- CreateIndex
CREATE INDEX "Unit_production_idx" ON "Unit"("production");

-- CreateIndex
CREATE INDEX "Unit_name_idx" ON "Unit"("name");

-- AddForeignKey
ALTER TABLE "UnitMember" ADD CONSTRAINT "UnitMember_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitMember" ADD CONSTRAINT "UnitMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongUnit" ADD CONSTRAINT "SongUnit_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongUnit" ADD CONSTRAINT "SongUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongMember" ADD CONSTRAINT "SongMember_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongMember" ADD CONSTRAINT "SongMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSelection" ADD CONSTRAINT "UserSelection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSelection" ADD CONSTRAINT "UserSelection_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
