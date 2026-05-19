import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'idol-colors.json');
    const data = fs.readFileSync(dataPath, 'utf-8');
    const colors = JSON.parse(data);
    return NextResponse.json(colors);
  } catch (err) {
    return NextResponse.json({ error: '無法讀取偶像代表色資料' }, { status: 500 });
  }
}
