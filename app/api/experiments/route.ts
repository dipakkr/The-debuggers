import { NextResponse } from "next/server";
import { ledgerBacking, readExperiments } from "@/lib/referee/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    experiments: readExperiments(200),
    backing: ledgerBacking(),
  });
}
