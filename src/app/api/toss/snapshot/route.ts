import { NextRequest, NextResponse } from "next/server";

import { createTossSnapshot } from "@/lib/toss-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clientId?: string;
      clientSecret?: string;
      accountSeq?: number;
    };

    const clientId = body.clientId?.trim();
    const clientSecret = body.clientSecret?.trim();

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error: {
            code: "credentials-required",
            message: "API Key와 Secret Key를 모두 입력해야 합니다.",
          },
        },
        { status: 400 }
      );
    }

    const snapshot = await createTossSnapshot({
      clientId,
      clientSecret,
      accountSeq: body.accountSeq,
    });

    return NextResponse.json({ result: snapshot });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number(error.status)
        : 500;
    const stage =
      error && typeof error === "object" && "stage" in error
        ? String(error.stage)
        : "snapshot";
    const message =
      error instanceof Error
        ? error.message
        : "Toss API 연동 중 오류가 발생했습니다.";

    return NextResponse.json({
      error: {
        code: "toss-api-request-failed",
        status: Number.isFinite(status) ? status : 500,
        stage,
        message,
      },
    });
  }
}
