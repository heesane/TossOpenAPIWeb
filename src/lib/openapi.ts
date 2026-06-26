import spec from "../../toss_open_api.json";

export type ApiEndpoint = {
  method: string;
  path: string;
  summary: string;
  tag: string;
};

type OpenApiOperation = {
  summary?: string;
  operationId?: string;
  tags?: string[];
};

type OpenApiSpec = {
  info?: {
    title?: string;
    version?: string;
  };
  servers?: Array<{
    url?: string;
  }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

const typedSpec = spec as OpenApiSpec;

export const openApiInfo = {
  title: typedSpec.info?.title ?? "토스증권 Open API",
  version: typedSpec.info?.version ?? "1.0.0",
  serverUrl: typedSpec.servers?.[0]?.url ?? "https://openapi.tossinvest.com",
};

export const apiEndpoints: ApiEndpoint[] = Object.entries(
  typedSpec.paths ?? {}
).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({
    method: method.toUpperCase(),
    path,
    summary: operation.summary ?? operation.operationId ?? path,
    tag: operation.tags?.[0] ?? "API",
  }))
);

export const endpointStats = {
  total: apiEndpoints.length,
  marketData: apiEndpoints.filter((endpoint) =>
    ["Market Data", "Market Info", "Stock Info"].includes(endpoint.tag)
  ).length,
  account: apiEndpoints.filter((endpoint) =>
    ["Account", "Asset"].includes(endpoint.tag)
  ).length,
  order: apiEndpoints.filter((endpoint) =>
    ["Order", "Order History", "Order Info"].includes(endpoint.tag)
  ).length,
};

export const apiGroups = apiEndpoints.reduce<Record<string, ApiEndpoint[]>>(
  (groups, endpoint) => {
    groups[endpoint.tag] = [...(groups[endpoint.tag] ?? []), endpoint];
    return groups;
  },
  {}
);
