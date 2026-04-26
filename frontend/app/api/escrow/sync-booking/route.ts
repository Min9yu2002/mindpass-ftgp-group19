import { NextResponse } from "next/server";
import { syncBookingMirrorFromTxHash } from "../../../../lib/server/booking-mirror-sync";

type SyncBookingRequestBody = {
  txHash?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncBookingRequestBody;
    const txHash = body.txHash?.trim();

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { ok: false, error: "A valid booking txHash is required." },
        { status: 400 },
      );
    }

    const session = await syncBookingMirrorFromTxHash(
      txHash as `0x${string}`,
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
            : "Unable to sync booking mirror.",
      },
      { status: 500 },
    );
  }
}
