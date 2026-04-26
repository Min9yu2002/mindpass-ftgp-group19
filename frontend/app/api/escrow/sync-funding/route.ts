import { NextResponse } from "next/server";
import { syncFundingMirrorFromTxHash } from "../../../../lib/server/funding-mirror-sync";

type SyncFundingRequestBody = {
  txHash?: string;
  sessionId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncFundingRequestBody;
    const txHash = body.txHash?.trim();
    const sessionId = body.sessionId?.trim();

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { ok: false, error: "A valid funding txHash is required." },
        { status: 400 },
      );
    }

    const session = await syncFundingMirrorFromTxHash(
      txHash as `0x${string}`,
      { sessionId: sessionId || null },
    );

    return NextResponse.json({
      ok: true,
      session,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to sync funding mirror.",
      },
      { status: 500 },
    );
  }
}
