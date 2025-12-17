import type { PagsmileConfig, QueryTransactionResponse } from "../types/pagsmile.ts";
import type { PagsmileHttpClient } from "./pagsmile-client.ts";

export interface TransactionService {
  queryTransaction(tradeNo: string): Promise<QueryTransactionResponse>;
}

interface QueryRequest {
  app_id: string;
  timestamp: string;
  trade_no: string;
}

const formatTimestamp = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const createTransactionService = (
  client: PagsmileHttpClient,
  config: PagsmileConfig
): TransactionService => ({
  queryTransaction: async (tradeNo: string): Promise<QueryTransactionResponse> => {
    console.log("🔍 TransactionService.queryTransaction iniciado");
    console.log("  Trade No:", tradeNo);
    
    if (!tradeNo || tradeNo.trim().length === 0) {
      console.log("❌ Trade number não fornecido");
      throw new Error("Trade number is required");
    }

    const queryRequest: QueryRequest = {
      app_id: config.appId,
      timestamp: formatTimestamp(),
      trade_no: tradeNo,
    };

    console.log("📋 Query Request:", JSON.stringify(queryRequest, null, 2));
    console.log("🌐 Consultando transação na Pagsmile API...");

    const response = await client.post<QueryRequest, QueryTransactionResponse>(
      "/trade/query",
      queryRequest
    );

    console.log("📥 Resposta da query:", JSON.stringify(response, null, 2));

    if (response.code !== "10000") {
      console.log(`❌ Erro da Pagsmile: ${response.code} - ${response.msg}`);
      throw new Error(`Pagsmile error: ${response.code} - ${response.msg}`);
    }

    console.log("✅ Transação consultada com sucesso");
    return response;
  },
});
