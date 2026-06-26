import { openApiInfo } from "@/lib/openapi";
import { toNumber } from "@/lib/toss-format";

export type TossCredentials = {
  clientId: string;
  clientSecret: string;
  accountSeq?: number;
};

export type TossAccount = {
  accountNo: string;
  accountSeq: number;
  accountType: string;
};

export type TossPrice = {
  krw: string;
  usd?: string | null;
};

export type TossHolding = {
  symbol: string;
  name: string;
  marketCountry: "KR" | "US" | string;
  currency: "KRW" | "USD" | string;
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
  marketValue: {
    purchaseAmount: string;
    amount: string;
    amountAfterCost: string;
  };
  profitLoss: {
    amount: string;
    amountAfterCost: string;
    rate: string;
    rateAfterCost: string;
  };
  dailyProfitLoss: {
    amount: string;
    rate: string;
  };
  cost: {
    commission: string;
    tax?: string | null;
  };
};

export type TossHoldingsOverview = {
  totalPurchaseAmount: TossPrice;
  marketValue: {
    amount: TossPrice;
    amountAfterCost: TossPrice;
  };
  profitLoss: {
    amount: TossPrice;
    amountAfterCost: TossPrice;
    rate: string;
    rateAfterCost: string;
  };
  dailyProfitLoss: {
    amount: TossPrice;
    rate: string;
  };
  items: TossHolding[];
};

export type TossOrder = {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL" | string;
  orderType: "LIMIT" | "MARKET" | string;
  timeInForce: string;
  status: string;
  price?: string | null;
  quantity: string;
  orderAmount?: string | null;
  currency: string;
  orderedAt: string;
};

export type TossBuyingPower = {
  currency: string;
  cashBuyingPower: string;
};

export type TossCommission = {
  marketCountry: string;
  commissionRate: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type TossRsiResult = {
  symbol: string;
  rsi: number | null;
  candleCount: number;
  status: "ok" | "insufficient-data" | "failed";
  message?: string;
};

export type TossSnapshot = {
  generatedAt: string;
  tokenExpiresIn: number;
  selectedAccountSeq: number | null;
  accounts: TossAccount[];
  holdings: TossHoldingsOverview | null;
  openOrders: TossOrder[];
  buyingPower: TossBuyingPower[];
  commissions: TossCommission[];
  rsi: TossRsiResult[];
  warnings: string[];
};

type TossTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
};

type TossEnvelope<T> = {
  result: T;
};

type TossCandle = {
  timestamp: string;
  closePrice: string;
};

type TossCandleResponse = {
  candles: TossCandle[];
  nextBefore?: string | null;
};

type TossOrdersResponse = {
  orders: TossOrder[];
};

class TossApiError extends Error {
  status: number;
  stage: string;

  constructor(stage: string, status: number, message: string) {
    super(message);
    this.name = "TossApiError";
    this.status = status;
    this.stage = stage;
  }
}

function sanitizeErrorBody(body: unknown) {
  if (!body || typeof body !== "object") return "Toss API 호출에 실패했습니다.";
  if ("error_description" in body && typeof body.error_description === "string") {
    return body.error_description;
  }
  if (
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return "Toss API 호출에 실패했습니다.";
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function issueToken(credentials: TossCredentials) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });

  const response = await fetch(`${openApiInfo.serverUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = await readResponseBody(response);

  if (!response.ok) {
    throw new TossApiError(
      "token",
      response.status,
      sanitizeErrorBody(payload)
    );
  }

  return payload as TossTokenResponse;
}

async function callToss<T>(
  path: string,
  accessToken: string,
  init: RequestInit & { accountSeq?: number; stage: string }
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");

  if (init.accountSeq) {
    headers.set("X-Tossinvest-Account", String(init.accountSeq));
  }

  const response = await fetch(`${openApiInfo.serverUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = await readResponseBody(response);

  if (!response.ok) {
    throw new TossApiError(
      init.stage,
      response.status,
      sanitizeErrorBody(payload)
    );
  }

  return (payload as TossEnvelope<T>).result;
}

function calculateRsi(candles: TossCandle[]) {
  const closes = [...candles]
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    .map((candle) => toNumber(candle.closePrice))
    .filter((value) => value > 0);

  if (closes.length < 15) return null;

  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const recent = changes.slice(-14);
  const gains = recent.map((change) => Math.max(change, 0));
  const losses = recent.map((change) => Math.max(-change, 0));
  const averageGain = gains.reduce((sum, gain) => sum + gain, 0) / 14;
  const averageLoss = losses.reduce((sum, loss) => sum + loss, 0) / 14;

  if (averageLoss === 0) return 100;

  const rs = averageGain / averageLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

async function getRsi(symbol: string, accessToken: string): Promise<TossRsiResult> {
  try {
    const params = new URLSearchParams({
      symbol,
      interval: "1d",
      count: "30",
      adjusted: "true",
    });
    const result = await callToss<TossCandleResponse>(
      `/api/v1/candles?${params.toString()}`,
      accessToken,
      { method: "GET", stage: "candles" }
    );
    const rsi = calculateRsi(result.candles);

    return {
      symbol,
      rsi,
      candleCount: result.candles.length,
      status: rsi === null ? "insufficient-data" : "ok",
    };
  } catch (error) {
    return {
      symbol,
      rsi: null,
      candleCount: 0,
      status: "failed",
      message: error instanceof Error ? error.message : "RSI 계산 실패",
    };
  }
}

async function getOptional<T>(
  task: Promise<T>,
  warnings: string[],
  label: string,
  fallback: T
) {
  try {
    return await task;
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : "실패"}`);
    return fallback;
  }
}

export async function createTossSnapshot(
  credentials: TossCredentials
): Promise<TossSnapshot> {
  const warnings: string[] = [];
  const token = await issueToken(credentials);
  const accounts = await callToss<TossAccount[]>("/api/v1/accounts", token.access_token, {
    method: "GET",
    stage: "accounts",
  });
  const selectedAccount =
    accounts.find((account) => account.accountSeq === credentials.accountSeq) ??
    accounts[0] ??
    null;

  if (!selectedAccount) {
    return {
      generatedAt: new Date().toISOString(),
      tokenExpiresIn: token.expires_in,
      selectedAccountSeq: null,
      accounts,
      holdings: null,
      openOrders: [],
      buyingPower: [],
      commissions: [],
      rsi: [],
      warnings: ["조회 가능한 종합매매 계좌가 없습니다."],
    };
  }

  const accountSeq = selectedAccount.accountSeq;
  const [holdings, orders, commissions, krwBuyingPower, usdBuyingPower] =
    await Promise.all([
      callToss<TossHoldingsOverview>("/api/v1/holdings", token.access_token, {
        method: "GET",
        accountSeq,
        stage: "holdings",
      }),
      getOptional(
        callToss<TossOrdersResponse>(
          "/api/v1/orders?status=OPEN",
          token.access_token,
          {
            method: "GET",
            accountSeq,
            stage: "orders",
          }
        ),
        warnings,
        "진행 중 주문 조회",
        { orders: [] }
      ),
      getOptional(
        callToss<TossCommission[]>("/api/v1/commissions", token.access_token, {
          method: "GET",
          accountSeq,
          stage: "commissions",
        }),
        warnings,
        "수수료 조회",
        []
      ),
      getOptional(
        callToss<TossBuyingPower>(
          "/api/v1/buying-power?currency=KRW",
          token.access_token,
          {
            method: "GET",
            accountSeq,
            stage: "buying-power-krw",
          }
        ),
        warnings,
        "원화 매수가능금액 조회",
        null
      ),
      getOptional(
        callToss<TossBuyingPower>(
          "/api/v1/buying-power?currency=USD",
          token.access_token,
          {
            method: "GET",
            accountSeq,
            stage: "buying-power-usd",
          }
        ),
        warnings,
        "달러 매수가능금액 조회",
        null
      ),
    ]);

  const rsiSymbols = holdings.items.slice(0, 8).map((holding) => holding.symbol);
  const rsi = await Promise.all(
    rsiSymbols.map((symbol) => getRsi(symbol, token.access_token))
  );

  return {
    generatedAt: new Date().toISOString(),
    tokenExpiresIn: token.expires_in,
    selectedAccountSeq: accountSeq,
    accounts,
    holdings,
    openOrders: orders.orders,
    buyingPower: [krwBuyingPower, usdBuyingPower].filter(
      (item): item is TossBuyingPower => Boolean(item)
    ),
    commissions,
    rsi,
    warnings,
  };
}
