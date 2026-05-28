import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const pitchMapData = [
  { pitch: "hihiG♯", scientific: "G#6", number: 60 },
  { pitch: "hihiG", scientific: "G6", number: 59 },
  { pitch: "hihiF♯", scientific: "F#6", number: 58 },
  { pitch: "hihiF", scientific: "F6", number: 57 },
  { pitch: "hihiE", scientific: "E6", number: 56 },
  { pitch: "hihiD♯", scientific: "D#6", number: 55 },
  { pitch: "hihiD", scientific: "D6", number: 54 },
  { pitch: "hihiC♯", scientific: "C#6", number: 53 },
  { pitch: "hihiC", scientific: "C6", number: 52 },
  { pitch: "hihiB", scientific: "B5", number: 51 },
  { pitch: "hihiA♯", scientific: "A#5", number: 50 },
  { pitch: "hihiA", scientific: "A5", number: 49 },
  { pitch: "hiG♯", scientific: "G#5", number: 48 },
  { pitch: "hiG", scientific: "G5", number: 47 },
  { pitch: "hiF♯", scientific: "F#5", number: 46 },
  { pitch: "hiF", scientific: "F5", number: 45 },
  { pitch: "hiE", scientific: "E5", number: 44 },
  { pitch: "hiD♯", scientific: "D#5", number: 43 },
  { pitch: "hiD", scientific: "D5", number: 42 },
  { pitch: "hiC♯", scientific: "C#5", number: 41 },
  { pitch: "hiC", scientific: "C5", number: 40 },
  { pitch: "hiB", scientific: "B4", number: 39 },
  { pitch: "hiA♯", scientific: "A#4", number: 38 },
  { pitch: "hiA", scientific: "A4", number: 37 },
  { pitch: "mid2G♯", scientific: "G#4", number: 36 },
  { pitch: "mid2G", scientific: "G4", number: 35 },
  { pitch: "mid2F♯", scientific: "F#4", number: 34 },
  { pitch: "mid2F", scientific: "F4", number: 33 },
  { pitch: "mid2E", scientific: "E4", number: 32 },
  { pitch: "mid2D♯", scientific: "D#4", number: 31 },
  { pitch: "mid2D", scientific: "D4", number: 30 },
  { pitch: "mid2C♯", scientific: "C#4", number: 29 },
  { pitch: "mid2C", scientific: "C4", number: 28 },
  { pitch: "mid2B", scientific: "B3", number: 27 },
  { pitch: "mid2A♯", scientific: "A#3", number: 26 },
  { pitch: "mid2A", scientific: "A3", number: 25 },
  { pitch: "mid1G♯", scientific: "G#3", number: 24 },
  { pitch: "mid1G", scientific: "G3", number: 23 },
  { pitch: "mid1F♯", scientific: "F#3", number: 22 },
  { pitch: "mid1F", scientific: "F3", number: 21 },
  { pitch: "mid1E", scientific: "E3", number: 20 },
  { pitch: "mid1D♯", scientific: "D#3", number: 19 },
  { pitch: "mid1D", scientific: "D3", number: 18 },
  { pitch: "mid1C♯", scientific: "C#3", number: 17 },
  { pitch: "mid1C", scientific: "C3", number: 16 },
  { pitch: "mid1B", scientific: "B2", number: 15 },
  { pitch: "mid1A♯", scientific: "A#2", number: 14 },
  { pitch: "mid1A", scientific: "A2", number: 13 },
  { pitch: "lowG♯", scientific: "G#2", number: 12 },
  { pitch: "lowG", scientific: "G2", number: 11 },
  { pitch: "lowF♯", scientific: "F#2", number: 10 },
  { pitch: "lowF", scientific: "F2", number: 9 },
  { pitch: "lowE", scientific: "E2", number: 8 },
  { pitch: "lowD♯", scientific: "D#2", number: 7 },
  { pitch: "lowD", scientific: "D2", number: 6 },
  { pitch: "lowC♯", scientific: "C#2", number: 5 },
  { pitch: "lowC", scientific: "C2", number: 4 },
  { pitch: "lowB", scientific: "B1", number: 3 },
  { pitch: "lowA♯", scientific: "A#1", number: 2 },
  { pitch: "lowA", scientific: "A1", number: 1 }
];

async function seed() {
  console.log('Seeding PitchToNumber table...');
  for (const item of pitchMapData) {
    await prisma.pitchToNumber.upsert({
      where: { pitch: item.pitch },
      update: {
        scientific: item.scientific,
        number: item.number
      },
      create: {
        pitch: item.pitch,
        scientific: item.scientific,
        number: item.number
      }
    });
  }
  console.log('PitchToNumber seeded successfully.');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
