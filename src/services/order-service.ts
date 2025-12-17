import type {
  CreateOrderRequest,
  CreateOrderResponse,
  CreatePaymentInput,
  CustomerInfo,
  PagsmileConfig,
} from "../types/pagsmile.ts";
import type { PagsmileHttpClient } from "./pagsmile-client.ts";

export interface OrderService {
  createOrder(input: CreatePaymentInput): Promise<CreateOrderResponse>;
}

const generateOrderId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `ORDER_${timestamp}_${random}`;
};

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

const extractStreetNumber = (address: string): string => {
  const match = address.match(/\d+/);
  return match?.[0] ?? "1";
};

const buildOrderRequest = (
  input: CreatePaymentInput,
  config: PagsmileConfig
): CreateOrderRequest => {
  const { 
    amount, 
    customerInfo, 
    userAgent, 
    ipAddress,
    browserLanguage,
    browserColorDepth,
    browserScreenHeight,
    browserScreenWidth,
    browserTimeZone,
  } = input;

  const request: CreateOrderRequest = {
    app_id: config.appId,
    out_trade_no: generateOrderId(),
    method: "CreditCard",
    order_amount: amount,
    order_currency: "BRL",
    subject: "Pagamento de Produto",
    content: "Pagamento via cartão de crédito",
    trade_type: "API",
    timestamp: formatTimestamp(),
    notify_url: config.notifyUrl,
    return_url: config.returnUrl,
    timeout_express: "1d",
    version: "2.0",
    buyer_id: customerInfo.email,
    customer: {
      identify: {
        type: "CPF",
        number: customerInfo.cpf,
      },
      name: customerInfo.name,
      email: customerInfo.email,
      phone: customerInfo.phone,
    },
    address: {
      zip_code: customerInfo.zipCode,
      state: customerInfo.state,
      city: customerInfo.city,
      street_name: customerInfo.address,
      street_number: extractStreetNumber(customerInfo.address),
    },
  };

  // Adiciona device_info se userAgent estiver presente
  if (userAgent) {
    request.device_info = {
      user_agent: userAgent,
      ip_address: ipAddress,
      // Formato Pagsmile (browser_*)
      browser_language: browserLanguage,
      browser_color_depth: browserColorDepth,
      browser_screen_height: browserScreenHeight,
      browser_screen_width: browserScreenWidth,
      browser_time_zone: browserTimeZone,
      // Formato A55 (http_browser_*) - para compatibilidade
      http_browser_language: browserLanguage,
      http_browser_color_depth: browserColorDepth,
      http_browser_screen_height: browserScreenHeight,
      http_browser_screen_width: browserScreenWidth,
      http_browser_time_difference: browserTimeZone,
      http_accept_content: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      http_browser_java_enabled: false,
      http_browser_javascript_enabled: true,
    };
    console.log("🔒 Device info COMPLETO incluído para validação 3DS/antifraude:", {
      user_agent: userAgent.substring(0, 50) + "...",
      ip_address: ipAddress || "não fornecido",
      browser_language: browserLanguage,
      browser_color_depth: browserColorDepth,
      screen_resolution: `${browserScreenWidth}x${browserScreenHeight}`,
      time_zone: browserTimeZone,
      formats: "browser_* + http_browser_* (compatibilidade Pagsmile + A55)",
    });
  } else {
    console.log("⚠️ ATENÇÃO: device_info não foi incluído (userAgent ausente)");
  }

  return request;
};

const validateCustomerInfo = (customerInfo: CustomerInfo): void => {
  console.log("🔍 Validando informações do cliente...");
  
  const errors: string[] = [];

  if (!customerInfo.name || customerInfo.name.trim().length < 3) {
    errors.push("Name must have at least 3 characters");
  }

  if (!customerInfo.email || !customerInfo.email.includes("@")) {
    errors.push("Invalid email format");
  }

  if (!customerInfo.cpf || customerInfo.cpf.length !== 11) {
    errors.push("CPF must have 11 digits");
  }

  if (!customerInfo.phone || customerInfo.phone.length < 10) {
    errors.push("Phone must have at least 10 digits");
  }

  if (!customerInfo.zipCode || customerInfo.zipCode.length !== 8) {
    errors.push("ZIP code must have 8 digits");
  }

  if (!customerInfo.state || customerInfo.state.length !== 2) {
    errors.push("State must be a 2-letter code");
  }

  if (!customerInfo.city || customerInfo.city.trim().length < 2) {
    errors.push("City is required");
  }

  if (!customerInfo.address || customerInfo.address.trim().length < 5) {
    errors.push("Address must have at least 5 characters");
  }

  if (errors.length > 0) {
    console.log("❌ Validação falhou:", errors);
    throw new Error(`Validation errors: ${errors.join(", ")}`);
  }
  
  console.log("✅ Validação do cliente OK");
};

export const createOrderService = (
  client: PagsmileHttpClient,
  config: PagsmileConfig
): OrderService => ({
  createOrder: async (input: CreatePaymentInput): Promise<CreateOrderResponse> => {
    console.log("💳 OrderService.createOrder iniciado");
    
    validateCustomerInfo(input.customerInfo);

    const orderRequest = buildOrderRequest(input, config);
    const orderId = orderRequest.out_trade_no;
    
    console.log("📋 Order Request gerado:", {
      out_trade_no: orderId,
      amount: orderRequest.order_amount,
      currency: orderRequest.order_currency,
      method: orderRequest.method,
      customer_email: orderRequest.customer.email,
      customer_cpf: orderRequest.customer.identify.number,
    });
    
    console.log("🌐 Enviando requisição para Pagsmile API...");
    console.log("📤 Request completo:", JSON.stringify(orderRequest, null, 2));
    
    const response = await client.post<CreateOrderRequest, CreateOrderResponse>(
      "/trade/create",
      orderRequest
    );

    console.log("📥 Resposta da Pagsmile API:", JSON.stringify(response, null, 2));

    if (response.code !== "10000") {
      console.log(`❌ Erro da Pagsmile: ${response.code} - ${response.msg}`);
      throw new Error(`Pagsmile error: ${response.code} - ${response.msg}`);
    }

    console.log("✅ Pedido criado com sucesso na Pagsmile");
    return response;
  },
});
