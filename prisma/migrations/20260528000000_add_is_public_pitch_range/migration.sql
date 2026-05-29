-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPublicPitchRange" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserVocalRange" ADD COLUMN     "singableHighest" INTEGER,
ADD COLUMN     "singableLowest" INTEGER;
