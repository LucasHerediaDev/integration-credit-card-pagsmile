import type { TradeStatus, WebhookPayload } from "../types/pagsmile.ts";

export interface WebhookEvent {
  tradeNo: string;
  outTradeNo: string;
  status: TradeStatus;
  amount: number;
  currency: string;
  method: string;
}

export interface WebhookHandler {
  processWebhook(payload: WebhookPayload): Promise<WebhookEvent>;
  onPaymentSuccess(event: WebhookEvent): Promise<void>;
  onPaymentFailed(event: WebhookEvent): Promise<void>;
}

export type PaymentEventCallback = (event: WebhookEvent) => Promise<void>;

export interface WebhookHandlerOptions {
  onSuccess?: PaymentEventCallback;
  onFailed?: PaymentEventCallback;
}

const validateWebhookPayload = (payload: WebhookPayload): void => {
  console.log("🔍 Validando payload do webhook...");
  
  const errors: string[] = [];

  if (!payload.trade_no) {
    errors.push("trade_no is required");
  }

  if (!payload.out_trade_no) {
    errors.push("out_trade_no is required");
  }

  if (!payload.trade_status) {
    errors.push("trade_status is required");
  }

  if (errors.length > 0) {
    console.log("❌ Validação do webhook falhou:", errors);
    throw new Error(`Invalid webhook payload: ${errors.join(", ")}`);
  }
  
  console.log("✅ Validação do webhook OK");
};

const mapPayloadToEvent = (payload: WebhookPayload): WebhookEvent => ({
  tradeNo: payload.trade_no,
  outTradeNo: payload.out_trade_no,
  status: payload.trade_status,
  amount: payload.order_amount,
  currency: payload.order_currency,
  method: payload.method,
});

export const createWebhookHandler = (options: WebhookHandlerOptions = {}): WebhookHandler => {
  const defaultCallback: PaymentEventCallback = async (event) => {
    console.log(`Payment event received: ${event.status} for order ${event.outTradeNo}`);
  };

  const onSuccessCallback = options.onSuccess ?? defaultCallback;
  const onFailedCallback = options.onFailed ?? defaultCallback;

  return {
    processWebhook: async (payload: WebhookPayload): Promise<WebhookEvent> => {
      console.log("🔔 WebhookHandler.processWebhook iniciado");
      
      validateWebhookPayload(payload);

      const event = mapPayloadToEvent(payload);
      
      console.log("📊 Evento mapeado:", {
        tradeNo: event.tradeNo,
        outTradeNo: event.outTradeNo,
        status: event.status,
        amount: event.amount,
        currency: event.currency,
        method: event.method,
      });

      if (event.status === "SUCCESS") {
        console.log("✅ Status: SUCCESS - Executando callback de sucesso...");
        await onSuccessCallback(event);
      } else if (event.status === "FAILED" || event.status === "CANCELLED") {
        console.log(`❌ Status: ${event.status} - Executando callback de falha...`);
        await onFailedCallback(event);
      } else {
        console.log(`ℹ️  Status: ${event.status} - Nenhuma ação específica`);
      }

      return event;
    },

    onPaymentSuccess: async (event: WebhookEvent): Promise<void> => {
      console.log("✅ onPaymentSuccess chamado para:", event.outTradeNo);
      await onSuccessCallback(event);
    },

    onPaymentFailed: async (event: WebhookEvent): Promise<void> => {
      console.log("❌ onPaymentFailed chamado para:", event.outTradeNo);
      await onFailedCallback(event);
    },
  };
};
