-- CreateTable
CREATE TABLE "PitchToNumber" (
    "pitch" TEXT NOT NULL,
    "scientific" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "PitchToNumber_pkey" PRIMARY KEY ("pitch")
);

-- CreateTable
CREATE TABLE "UserVocalRange" (
    "userId" UUID NOT NULL,
    "comfortableHighest" INTEGER,
    "limitHighest" INTEGER,
    "comfortableLowest" INTEGER,
    "limitLowest" INTEGER,

    CONSTRAINT "UserVocalRange_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PitchToNumber_number_key" ON "PitchToNumber"("number");

-- AddForeignKey
ALTER TABLE "UserVocalRange" ADD CONSTRAINT "UserVocalRange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
