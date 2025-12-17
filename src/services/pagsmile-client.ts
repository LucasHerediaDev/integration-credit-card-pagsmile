import { PAGSMILE_API_BASE_URL } from "../config/pagsmile.ts";
import type { PagsmileConfig } from "../types/pagsmile.ts";

export interface PagsmileHttpClient {
  post<TRequest, TResponse>(endpoint: string, body: TRequest): Promise<TResponse>;
  get<TResponse>(endpoint: string): Promise<TResponse>;
}

const createAuthHeader = (appId: string, securityKey: string): string => {
  const credentials = `${appId}:${securityKey}`;
  const encoded = Buffer.from(credentials).toString("base64");
  return `Basic ${encoded}`;
};

export const createPagsmileClient = (config: PagsmileConfig): PagsmileHttpClient => {
  const authHeader = createAuthHeader(config.appId, config.securityKey);

  const request = async <TResponse>(
    endpoint: string,
    options: RequestInit
  ): Promise<TResponse> => {
    const url = `${PAGSMILE_API_BASE_URL}${endpoint}`;

    console.log("🔗 PagsmileClient fazendo requisição:");
    console.log("  URL:", url);
    console.log("  Method:", options.method);
    console.log("  Headers:", {
      "Content-Type": "application/json",
      Authorization: authHeader.substring(0, 20) + "...",
    });

    const startTime = Date.now();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...options.headers,
      },
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️  Resposta recebida em ${duration}ms`);
    console.log("  Status:", response.status, response.statusText);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("❌ Erro na resposta da API:");
      console.error("  Status:", response.status);
      console.error("  Body:", errorBody);
      throw new Error(`Pagsmile API error: ${response.status} - ${errorBody}`);
    }

    const jsonResponse = await response.json() as TResponse;
    console.log("✅ Resposta OK da API Pagsmile");
    
    return jsonResponse;
  };

  return {
    post: <TRequest, TResponse>(endpoint: string, body: TRequest): Promise<TResponse> =>
      request<TResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    get: <TResponse>(endpoint: string): Promise<TResponse> =>
      request<TResponse>(endpoint, {
        method: "GET",
      }),
  };
};
