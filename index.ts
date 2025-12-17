import indexHtml from "./public/index.html";
import { loadPagsmileConfig } from "./src/config/pagsmile.ts";
import { createPagsmileClient } from "./src/services/pagsmile-client.ts";
import { createOrderService } from "./src/services/order-service.ts";
import { createTransactionService } from "./src/services/transaction-service.ts";
import { createWebhookHandler } from "./src/services/webhook-handler.ts";
import { createApiRoutes } from "./src/routes/api-routes.ts";

console.log("========================================");
console.log("🚀 Inicializando servidor Pagsmile...");
console.log("========================================");

const config = loadPagsmileConfig();
console.log("✅ Configuração carregada:", {
  appId: config.appId,
  environment: config.environment,
  notifyUrl: config.notifyUrl,
  returnUrl: config.returnUrl,
});

const pagsmileClient = createPagsmileClient(config);
console.log("✅ Cliente Pagsmile criado");

const orderService = createOrderService(pagsmileClient, config);
console.log("✅ Order Service criado");

const transactionService = createTransactionService(pagsmileClient, config);
console.log("✅ Transaction Service criado");

const webhookHandler = createWebhookHandler({
  onSuccess: async (event) => {
    console.log("========================================");
    console.log("✅ PAGAMENTO APROVADO!");
    console.log("========================================");
    console.log("Dados do pagamento:", {
      tradeNo: event.tradeNo,
      outTradeNo: event.outTradeNo,
      amount: event.amount,
      currency: event.currency,
      method: event.method,
      status: event.status,
    });
    console.log("========================================");
  },
  onFailed: async (event) => {
    console.log("========================================");
    console.log("❌ PAGAMENTO FALHOU!");
    console.log("========================================");
    console.log("Dados do pagamento:", {
      tradeNo: event.tradeNo,
      outTradeNo: event.outTradeNo,
      amount: event.amount,
      currency: event.currency,
      method: event.method,
      status: event.status,
    });
    console.log("========================================");
  },
});
console.log("✅ Webhook Handler criado");

const apiRoutes = createApiRoutes({
  config,
  orderService,
  transactionService,
  webhookHandler,
});

const server = Bun.serve({
  port: process.env.PORT ?? 3000,
  routes: {
    "/": indexHtml,

    "/api/config": {
      GET: () => apiRoutes.getConfig(),
    },

    "/api/create-order": {
      POST: (req) => apiRoutes.createOrder(req),
    },

    "/api/query-transaction/:tradeNo": {
      GET: (req) => apiRoutes.queryTransaction(req.params.tradeNo),
    },

    "/api/webhook/payment": {
      POST: (req) => apiRoutes.handleWebhook(req),
    },

    "/success": new Response(
      `<!DOCTYPE html>
      <html>
        <head><title>Pagamento Confirmado</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #22c55e;">Pagamento Confirmado!</h1>
          <p>Seu pagamento foi processado com sucesso.</p>
          <a href="/" style="color: #4f46e5;">Voltar ao início</a>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    ),
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log("========================================");
console.log(`✅ Server rodando em http://localhost:${server.port}`);
console.log(`📍 Ambiente: ${config.environment}`);
console.log("========================================");
console.log("Endpoints disponíveis:");
console.log("  GET  /api/config");
console.log("  POST /api/create-order");
console.log("  GET  /api/query-transaction/:tradeNo");
console.log("  POST /api/webhook/payment");
console.log("========================================");