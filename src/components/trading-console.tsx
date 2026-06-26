"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ApiEndpoint } from "@/lib/openapi";
import type { TossHolding, TossSnapshot } from "@/lib/toss-api";
import { toNumber, toPercent } from "@/lib/toss-format";
import { cn } from "@/lib/utils";

type TradingConsoleProps = {
  endpoints: ApiEndpoint[];
  stats: {
    total: number;
    marketData: number;
    account: number;
    order: number;
  };
  apiInfo: {
    title: string;
    version: string;
    serverUrl: string;
  };
};

type SnapshotResponse =
  | {
      result: TossSnapshot;
    }
  | {
      error: {
        code: string;
        stage?: string;
        message: string;
      };
    };

function normalizeSliderValue(value: number | readonly number[]) {
  return Array.isArray(value) ? [...value] : [value];
}

function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 10) return "입력됨";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatCurrency(value: string | number | null | undefined, currency = "KRW") {
  const amount = toNumber(value);

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(amount);
}

function formatPercent(value: string | number | null | undefined) {
  const percent = toPercent(value);
  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRsi(snapshot: TossSnapshot | null, symbol: string) {
  return snapshot?.rsi.find((item) => item.symbol === symbol)?.rsi ?? null;
}

function getSignal(rsi: number | null, buyRsi: number, sellRsi: number) {
  if (rsi === null) return "RSI 대기";
  if (rsi <= buyRsi) return "매수 검토";
  if (rsi >= sellRsi) return "비중 축소";
  return "보유";
}

function signalClass(signal: string) {
  if (signal === "매수 검토") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (signal === "비중 축소") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getEndpointLabel(endpoint: ApiEndpoint) {
  return `${endpoint.method} ${endpoint.path}`;
}

function sumHoldingsByCurrency(holdings: TossHolding[]) {
  return holdings.reduce<Record<string, number>>((totals, holding) => {
    totals[holding.currency] =
      (totals[holding.currency] ?? 0) + toNumber(holding.marketValue.amount);
    return totals;
  }, {});
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="border-r border-slate-200 px-4 py-3 last:border-r-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-slate-950">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

export function TradingConsole({
  endpoints,
  stats,
  apiInfo,
}: TradingConsoleProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [accountSeq, setAccountSeq] = useState("");
  const [snapshot, setSnapshot] = useState<TossSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [buyRsi, setBuyRsi] = useState([32]);
  const [sellRsi, setSellRsi] = useState([70]);
  const [maxOrderRate, setMaxOrderRate] = useState([10]);

  const holdings = useMemo(() => snapshot?.holdings?.items ?? [], [snapshot]);
  const totals = useMemo(() => sumHoldingsByCurrency(holdings), [holdings]);
  const groupedEndpoints = useMemo(
    () =>
      endpoints.reduce<Record<string, ApiEndpoint[]>>((groups, endpoint) => {
        groups[endpoint.tag] = [...(groups[endpoint.tag] ?? []), endpoint];
        return groups;
      }, {}),
    [endpoints]
  );
  const orderCandidates = holdings.filter((holding) => {
    const signal = getSignal(getRsi(snapshot, holding.symbol), buyRsi[0], sellRsi[0]);
    return signal !== "보유" && signal !== "RSI 대기";
  });
  const connected = Boolean(snapshot);

  async function loadSnapshot() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/toss/snapshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          clientSecret,
          accountSeq: accountSeq ? Number(accountSeq) : undefined,
        }),
      });

      const payload = (await response.json()) as SnapshotResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? `${payload.error.stage ? `[${payload.error.stage}] ` : ""}${payload.error.message}`
            : "Toss API 조회에 실패했습니다."
        );
      }

      setSnapshot(payload.result);
      setAccountSeq(String(payload.result.selectedAccountSeq ?? ""));
    } catch (loadError) {
      setSnapshot(null);
      setError(loadError instanceof Error ? loadError.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>Toss OpenAPI Web</span>
              <span>·</span>
              <span>{apiInfo.title} {apiInfo.version}</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              실계좌 기반 자동매매 관리
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "rounded-md border px-2 py-1",
                connected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600"
              )}
            >
              {connected ? "계좌 조회 완료" : "계좌 미연결"}
            </Badge>
            <Badge variant="outline" className="rounded-md border-slate-200 bg-white">
              {stats.total}개 API 작업
            </Badge>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="rounded-md border-slate-200 bg-white shadow-none">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4 text-slate-500" />
                API 자격 증명
              </CardTitle>
              <CardDescription>
                토스증권에서 발급한 API Key와 Secret Key를 서버 Route Handler로 전달합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="client-id">API Key</Label>
                <Input
                  id="client-id"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="tsck_live_..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="client-secret">Secret Key</Label>
                <Input
                  id="client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder="tssk_live_..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-seq">계좌 식별값</Label>
                <Input
                  id="account-seq"
                  inputMode="numeric"
                  value={accountSeq}
                  onChange={(event) => setAccountSeq(event.target.value)}
                  placeholder="비워두면 첫 번째 계좌"
                />
              </div>
              <Button
                onClick={loadSnapshot}
                disabled={loading || !clientId.trim() || !clientSecret.trim()}
                className="h-9 rounded-md"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    조회 중
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4" />
                    계좌 데이터 조회
                  </>
                )}
              </Button>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Secret Key는 화면 상태에만 보관되며, 조회 요청 때만 서버로 전달됩니다.
                현재 입력값: {clientSecret ? maskSecret(clientSecret) : "없음"}
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>조회 실패</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="rounded-md border-slate-200 bg-white shadow-none">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4 text-slate-500" />
                  실시간 계좌 스냅샷
                </CardTitle>
                <CardDescription>
                  `/oauth2/token`으로 토큰을 발급한 뒤 계좌·보유·주문·주문정보 API를 서버에서 호출합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid divide-y divide-slate-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                  <Metric
                    label="선택 계좌"
                    value={snapshot?.selectedAccountSeq ? String(snapshot.selectedAccountSeq) : "-"}
                    sub={`${snapshot?.accounts.length ?? 0}개 계좌`}
                  />
                  <Metric
                    label="평가금액 KRW"
                    value={formatCurrency(totals.KRW ?? 0, "KRW")}
                    sub="보유 종목 합산"
                  />
                  <Metric
                    label="평가금액 USD"
                    value={formatCurrency(totals.USD ?? 0, "USD")}
                    sub="해외 종목 합산"
                  />
                  <Metric
                    label="진행 중 주문"
                    value={`${snapshot?.openOrders.length ?? 0}건`}
                    sub={snapshot ? formatDateTime(snapshot.generatedAt) : "조회 전"}
                  />
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="holdings" className="gap-3">
              <TabsList className="h-9 w-full justify-start overflow-x-auto rounded-md border border-slate-200 bg-white p-1 sm:w-fit">
                <TabsTrigger value="holdings" className="rounded-sm px-3">
                  보유 종목
                </TabsTrigger>
                <TabsTrigger value="rules" className="rounded-sm px-3">
                  자동매매 기준
                </TabsTrigger>
                <TabsTrigger value="orders" className="rounded-sm px-3">
                  주문·검증
                </TabsTrigger>
                <TabsTrigger value="api" className="rounded-sm px-3">
                  API 경로
                </TabsTrigger>
              </TabsList>

              <TabsContent value="holdings">
                <Card className="rounded-md border-slate-200 bg-white shadow-none">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-base">보유 종목과 RSI</CardTitle>
                    <CardDescription>
                      보유 종목은 `/api/v1/holdings`, RSI는 각 종목의 `/api/v1/candles` 일봉으로 계산합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>종목</TableHead>
                          <TableHead className="text-right">수량</TableHead>
                          <TableHead className="text-right">평가금액</TableHead>
                          <TableHead className="text-right">손익률</TableHead>
                          <TableHead className="text-right">일간</TableHead>
                          <TableHead className="text-right">RSI</TableHead>
                          <TableHead className="text-right">판단</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {holdings.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-28 text-center text-slate-500">
                              API Key와 Secret Key를 입력하고 계좌 데이터를 조회하세요.
                            </TableCell>
                          </TableRow>
                        ) : (
                          holdings.map((holding) => {
                            const rsi = getRsi(snapshot, holding.symbol);
                            const signal = getSignal(rsi, buyRsi[0], sellRsi[0]);

                            return (
                              <TableRow key={holding.symbol}>
                                <TableCell>
                                  <div className="font-medium">{holding.name}</div>
                                  <div className="text-xs text-slate-500">
                                    {holding.symbol} · {holding.marketCountry} · {holding.currency}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {holding.quantity}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatCurrency(holding.marketValue.amount, holding.currency)}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-mono",
                                    toNumber(holding.profitLoss.rate) >= 0
                                      ? "text-red-600"
                                      : "text-blue-600"
                                  )}
                                >
                                  {formatPercent(holding.profitLoss.rate)}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-mono",
                                    toNumber(holding.dailyProfitLoss.rate) >= 0
                                      ? "text-red-600"
                                      : "text-blue-600"
                                  )}
                                >
                                  {formatPercent(holding.dailyProfitLoss.rate)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="font-mono">
                                    {rsi === null ? "-" : rsi.toFixed(1)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="outline" className={cn("rounded-md", signalClass(signal))}>
                                    {signal}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="rules" className="grid gap-4 lg:grid-cols-[420px_1fr]">
                <Card className="rounded-md border-slate-200 bg-white shadow-none">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-base">자동매매 기준</CardTitle>
                    <CardDescription>
                      실제 주문 전 검증 API를 먼저 통과해야 하며, 이 화면에서는 후보만 산출합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-5">
                    <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                      <div>
                        <div className="font-medium">자동 후보 산출</div>
                        <p className="text-xs text-slate-500">조회된 실계좌 데이터에만 적용</p>
                      </div>
                      <Switch checked={autoMode} onCheckedChange={setAutoMode} disabled={!connected} />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex justify-between text-sm">
                        <Label>매수 검토 RSI</Label>
                        <span className="font-mono">{buyRsi[0]} 이하</span>
                      </div>
                      <Slider min={15} max={45} step={1} value={buyRsi} onValueChange={(value) => setBuyRsi(normalizeSliderValue(value))} />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex justify-between text-sm">
                        <Label>비중 축소 RSI</Label>
                        <span className="font-mono">{sellRsi[0]} 이상</span>
                      </div>
                      <Slider min={55} max={85} step={1} value={sellRsi} onValueChange={(value) => setSellRsi(normalizeSliderValue(value))} />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex justify-between text-sm">
                        <Label>종목별 주문 상한</Label>
                        <span className="font-mono">평가금액의 {maxOrderRate[0]}%</span>
                      </div>
                      <Slider min={1} max={30} step={1} value={maxOrderRate} onValueChange={(value) => setMaxOrderRate(normalizeSliderValue(value))} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-md border-slate-200 bg-white shadow-none">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-base">주문 후보</CardTitle>
                    <CardDescription>
                      RSI 기준으로 생성된 후보입니다. 주문 실행은 별도 확정 절차에서 처리해야 합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>종목</TableHead>
                          <TableHead className="text-right">RSI</TableHead>
                          <TableHead className="text-right">판단</TableHead>
                          <TableHead className="text-right">검증 API</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderCandidates.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                              현재 기준에 해당하는 주문 후보가 없습니다.
                            </TableCell>
                          </TableRow>
                        ) : (
                          orderCandidates.map((holding) => {
                            const rsi = getRsi(snapshot, holding.symbol);
                            const signal = getSignal(rsi, buyRsi[0], sellRsi[0]);
                            return (
                              <TableRow key={holding.symbol}>
                                <TableCell>
                                  <div className="font-medium">{holding.name}</div>
                                  <div className="text-xs text-slate-500">{holding.symbol}</div>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {rsi?.toFixed(1)}
                                </TableCell>
                                <TableCell className="text-right">{signal}</TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  buying-power · sellable-quantity · commissions
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="orders" className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-md border-slate-200 bg-white shadow-none">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-base">매수 가능 금액·수수료</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {snapshot?.buyingPower.length ? (
                      snapshot.buyingPower.map((item) => (
                        <div className="flex items-center justify-between rounded-md border border-slate-200 p-3" key={item.currency}>
                          <span>{item.currency}</span>
                          <span className="font-mono font-medium">
                            {formatCurrency(item.cashBuyingPower, item.currency)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                        조회된 매수 가능 금액이 없습니다.
                      </div>
                    )}
                    <Separator />
                    {snapshot?.commissions.map((item) => (
                      <div className="flex items-center justify-between text-sm" key={item.marketCountry}>
                        <span>{item.marketCountry} 수수료</span>
                        <span className="font-mono">{item.commissionRate}%</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="rounded-md border-slate-200 bg-white shadow-none">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-base">진행 중 주문</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>종목</TableHead>
                          <TableHead>방향</TableHead>
                          <TableHead>상태</TableHead>
                          <TableHead className="text-right">시간</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snapshot?.openOrders.length ? (
                          snapshot.openOrders.map((order) => (
                            <TableRow key={order.orderId}>
                              <TableCell className="font-mono">{order.symbol}</TableCell>
                              <TableCell>{order.side}</TableCell>
                              <TableCell>{order.status}</TableCell>
                              <TableCell className="text-right">{formatDateTime(order.orderedAt)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                              진행 중 주문이 없습니다.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {snapshot?.warnings.length ? (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-900 lg:col-span-2">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>일부 조회가 완료되지 않았습니다</AlertTitle>
                    <AlertDescription>{snapshot.warnings.join(" / ")}</AlertDescription>
                  </Alert>
                ) : null}
              </TabsContent>

              <TabsContent value="api" className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <Card className="rounded-md border-slate-200 bg-white shadow-none">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-base">서버 호출 순서</CardTitle>
                    <CardDescription className="break-all">{apiInfo.serverUrl}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    {[
                      "POST /oauth2/token",
                      "GET /api/v1/accounts",
                      "GET /api/v1/holdings",
                      "GET /api/v1/orders?status=OPEN",
                      "GET /api/v1/buying-power",
                      "GET /api/v1/commissions",
                      "GET /api/v1/candles",
                    ].map((step) => (
                      <div className="flex items-center gap-2 rounded-md border border-slate-200 p-2" key={step}>
                        <CheckCircle2 className="size-4 text-slate-500" />
                        <span className="font-mono text-xs">{step}</span>
                      </div>
                    ))}
                    <Alert className="mt-2 border-slate-200 bg-slate-50">
                      <ShieldCheck className="size-4" />
                      <AlertTitle>서버 프록시 사용</AlertTitle>
                      <AlertDescription>
                        브라우저는 Toss API 서버에 직접 연결하지 않고 `/api/toss/snapshot`만 호출합니다.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>

                <Card className="rounded-md border-slate-200 bg-white shadow-none">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-base">스펙에 포함된 API 작업</CardTitle>
                    <CardDescription>로컬 `toss_open_api.json`에서 읽은 엔드포인트입니다.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {Object.entries(groupedEndpoints).map(([tag, items]) => (
                      <div className="rounded-md border border-slate-200" key={tag}>
                        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                          <span className="font-medium">{tag}</span>
                          <Badge variant="outline" className="rounded-md">{items.length}</Badge>
                        </div>
                        <div className="grid divide-y divide-slate-100">
                          {items.map((endpoint) => (
                            <div className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[220px_1fr]" key={getEndpointLabel(endpoint)}>
                              <span className="font-mono text-slate-950">{getEndpointLabel(endpoint)}</span>
                              <span className="text-slate-500">{endpoint.summary}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </section>
    </main>
  );
}
