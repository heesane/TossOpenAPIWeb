import { TradingConsole } from "@/components/trading-console";
import { apiEndpoints, endpointStats, openApiInfo } from "@/lib/openapi";

export default function Home() {
  return (
    <TradingConsole
      apiInfo={openApiInfo}
      endpoints={apiEndpoints}
      stats={endpointStats}
    />
  );
}
