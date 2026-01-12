declare const Pagsmile: {
  setPublishableKey(config: PagsmileSetupConfig): Promise<PagsmileClient>;
};

interface PagsmileSetupConfig {
  app_id: string;
  public_key: string;
  env: "sandbox" | "prod";
  region_code: "BRA";
  prepay_id: string;
  fields: {
    card_name: { id_selector: string };
    card_number: { id_selector: string };
    expiration_month: { id_selector: string };
    expiration_year: { id_selector: string };
    cvv: { id_selector: string };
  };
}

interface PagsmileClient {
  createOrder(data: PaymentSubmitData): Promise<PaymentResult>;
}

interface PaymentSubmitData {
  phone: string;
  email: string;
  postal_code: string;
  payer_id: string;
  installments?: { stage: number };
  address: {
    country_code: string;
    zip_code: string;
    state: string;
    city: string;
    street: string;
  };
}

interface PaymentResult {
  status: "success" | "error";
  query?: boolean;
  message?: string;
}

interface SdkConfig {
  app_id: string;
  public_key: string;
  env: "sandbox" | "prod";
  region_code: "BRA";
}

interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  zipCode: string;
  city: string;
  state: string;
  address: string;
}

interface CreateOrderResponse {
  success: boolean;
  prepay_id?: string;
  trade_no?: string;
  out_trade_no?: string;
  error?: string;
}

const elements = {
  form: document.getElementById("payment-form") as HTMLFormElement,
  submitBtn: document.getElementById("submit-btn") as HTMLButtonElement,
  loading: document.getElementById("loading") as HTMLDivElement,
  paymentStatus: document.getElementById("payment-status") as HTMLDivElement,
  statusIcon: document.getElementById("status-icon") as HTMLDivElement,
  statusMessage: document.getElementById("status-message") as HTMLParagraphElement,
};

const showLoading = (show: boolean): void => {
  elements.loading.classList.toggle("hidden", !show);
  elements.submitBtn.disabled = show;
};

const showStatus = (type: "success" | "error" | "processing", message: string): void => {
  elements.paymentStatus.classList.remove("hidden", "success", "error", "processing");
  elements.paymentStatus.classList.add(type);

  const iconMap = {
    success: "✓",
    error: "✗",
    processing: "⋯",
  };

  elements.statusIcon.textContent = iconMap[type];
  elements.statusMessage.textContent = message;
};

const hideStatus = (): void => {
  elements.paymentStatus.classList.add("hidden");
};

const getFormData = (): { amount: string; customerInfo: CustomerInfo; installments: number } => {
  const formData = new FormData(elements.form);

  return {
    amount: formData.get("amount") as string,
    installments: parseInt(formData.get("installments") as string, 10),
    customerInfo: {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      cpf: formData.get("cpf") as string,
      zipCode: formData.get("zipCode") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      address: formData.get("address") as string,
    },
  };
};

const fetchSdkConfig = async (): Promise<SdkConfig> => {
  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error("Failed to fetch SDK configuration");
  }
  return response.json() as Promise<SdkConfig>;
};

const getDeviceInfo = () => {
  // O timezone deve ser em minutos e positivo (não negativo)
  // getTimezoneOffset() retorna negativo, então usamos Math.abs()
  const timezoneOffset = Math.abs(new Date().getTimezoneOffset());
  
  return {
    userAgent: navigator.userAgent,
    browserLanguage: navigator.language || navigator.languages?.[0] || "pt-BR",
    browserColorDepth: screen.colorDepth.toString(),
    browserScreenHeight: screen.height.toString(),
    browserScreenWidth: screen.width.toString(),
    browserTimeZone: timezoneOffset.toString(), // Formato positivo em minutos
  };
};

const createBackendOrder = async (
  amount: string,
  customerInfo: CustomerInfo
): Promise<CreateOrderResponse> => {
  const deviceInfo = getDeviceInfo();
  
  // Para o SDK, não precisamos de return_url pois ele gerencia o 3DS internamente
  // Usamos uma URL vazia ou a URL atual sem parâmetros
  const returnUrl = window.location.origin + window.location.pathname;
  
  console.log("📤 Criando pedido no backend com returnUrl:", returnUrl);
  
  const response = await fetch("/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      amount, 
      customerInfo,
      returnUrl, // Envia a URL atual para o backend usar como return_url
      ...deviceInfo,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<CreateOrderResponse>;
};

const initializePagsmileSdk = async (
  sdkConfig: SdkConfig,
  prepayId: string
): Promise<PagsmileClient> => {
  return Pagsmile.setPublishableKey({
    ...sdkConfig,
    prepay_id: prepayId,
    fields: {
      card_name: { id_selector: "card-name" },
      card_number: { id_selector: "card-number" },
      expiration_month: { id_selector: "exp-month" },
      expiration_year: { id_selector: "exp-year" },
      cvv: { id_selector: "card-cvv" },
    },
  });
};

const submitPayment = async (
  client: PagsmileClient,
  customerInfo: CustomerInfo,
  installments: number
): Promise<PaymentResult> => {
  const paymentData: PaymentSubmitData = {
    phone: customerInfo.phone,
    email: customerInfo.email,
    postal_code: customerInfo.zipCode,
    payer_id: customerInfo.cpf,
    installments: { stage: installments },
    address: {
      country_code: "BRA",
      zip_code: customerInfo.zipCode,
      state: customerInfo.state,
      city: customerInfo.city,
      street: customerInfo.address,
    },
  };

  try {
    console.log("💳 Enviando pagamento para SDK...");
    console.log("📋 Dados do pagamento:", {
      email: paymentData.email,
      phone: paymentData.phone,
      postal_code: paymentData.postal_code,
      payer_id: paymentData.payer_id,
      installments: paymentData.installments?.stage,
    });
    
    // Adiciona timeout para evitar que fique travado
    const timeoutPromise = new Promise<PaymentResult>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout ao processar pagamento (60s)")), 60000);
    });
    
    const result = await Promise.race([
      client.createOrder(paymentData),
      timeoutPromise,
    ]);
    
    console.log("📥 Resposta completa do SDK:", JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error("❌ Erro detalhado ao enviar pagamento:", error);
    console.error("❌ Stack trace:", error instanceof Error ? error.stack : "N/A");
    
    // Se o erro ocorrer após o 3DS, ainda precisamos verificar o status
    // Retorna um resultado que força a verificação do status mesmo em caso de erro
    return {
      status: "error",
      query: true, // Força a verificação do status mesmo em caso de erro
      message: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

interface TransactionQueryResponse {
  trade_status: string;
}

const pollTransactionStatus = async (
  tradeNo: string,
  maxAttempts = 15, // Aumenta para 15 tentativas (30 segundos)
  intervalMs = 2000
): Promise<string> => {
  console.log(`🔄 Iniciando polling para trade_no: ${tradeNo}`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`📡 Tentativa ${attempt + 1}/${maxAttempts} - Consultando status...`);
      const response = await fetch(`/api/query-transaction/${tradeNo}`);
      
      if (!response.ok) {
        console.error(`❌ Erro HTTP: ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }
      
      const data = (await response.json()) as TransactionQueryResponse;
      console.log(`📥 Status recebido: ${data.trade_status}`);

      if (data.trade_status === "SUCCESS") {
        console.log("✅ Pagamento aprovado!");
        return "SUCCESS";
      }

      if (data.trade_status === "FAILED" || data.trade_status === "CANCELLED") {
        console.log(`❌ Pagamento ${data.trade_status}`);
        return data.trade_status;
      }

      // Se ainda está PENDING, continua tentando
      if (data.trade_status === "PENDING") {
        console.log("⏳ Status ainda PENDING, aguardando...");
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      // Status desconhecido, aguarda e tenta novamente
      console.log(`⚠️ Status desconhecido: ${data.trade_status}`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.error(`❌ Erro na tentativa ${attempt + 1}:`, error);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  console.log("⏱️ Timeout após todas as tentativas");
  return "TIMEOUT";
};

const handlePaymentSubmit = async (event: Event): Promise<void> => {
  event.preventDefault();
  hideStatus();
  showLoading(true);

  try {
    const { amount, customerInfo, installments } = getFormData();

    showStatus("processing", "Criando pedido...");
    const sdkConfig = await fetchSdkConfig();
    const orderResponse = await createBackendOrder(amount, customerInfo);

    if (!orderResponse.success || !orderResponse.prepay_id) {
      throw new Error(orderResponse.error ?? "Falha ao criar pedido");
    }

    if (!orderResponse.trade_no) {
      throw new Error("trade_no não retornado pelo backend");
    }

    showStatus("processing", "Inicializando pagamento...");
    const pagsmileClient = await initializePagsmileSdk(sdkConfig, orderResponse.prepay_id);

    showStatus("processing", "Processando pagamento...");
    let paymentResult: PaymentResult;
    
    try {
      paymentResult = await submitPayment(pagsmileClient, customerInfo, installments);
      console.log("✅ Resultado do pagamento recebido:", JSON.stringify(paymentResult, null, 2));
    } catch (error) {
      console.error("❌ Erro durante submitPayment:", error);
      console.error("❌ Tipo do erro:", typeof error);
      console.error("❌ Erro completo:", error);
      
      // Mesmo com erro, tenta verificar o status (pode ter sido aprovado no 3DS)
      paymentResult = {
        status: "error",
        query: true,
        message: error instanceof Error ? error.message : "Erro durante processamento",
      };
    }
    
    console.log("🔍 Análise do resultado:", {
      status: paymentResult.status,
      query: paymentResult.query,
      message: paymentResult.message,
      trade_no: orderResponse.trade_no,
    });

    // Se precisa verificar status OU se houve erro mas temos trade_no
    if ((paymentResult.query || paymentResult.status === "error") && orderResponse.trade_no) {
      showStatus("processing", "Aguardando confirmação do pagamento...");
      
      // Aguarda mais tempo antes de começar a verificar (3DS pode estar processando)
      // O 3DS pode levar alguns segundos para processar e atualizar o status
      console.log("⏳ Aguardando 5 segundos antes de verificar status (3DS pode estar processando)...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      
      console.log("🔍 Iniciando verificação de status para trade_no:", orderResponse.trade_no);
      const finalStatus = await pollTransactionStatus(orderResponse.trade_no);

      if (finalStatus === "SUCCESS") {
        showStatus("success", "Pagamento realizado com sucesso!");
        elements.form.reset();
      } else if (finalStatus === "TIMEOUT") {
        showStatus("processing", "Pagamento em processamento. Verifique seu e-mail para confirmação.");
      } else if (finalStatus === "PENDING") {
        showStatus("processing", "Pagamento ainda em processamento. Aguarde...");
      } else {
        showStatus("error", `Pagamento ${finalStatus.toLowerCase()}. ${paymentResult.message || ""}`);
      }
    } else if (paymentResult.status === "success") {
      showStatus("success", "Pagamento realizado com sucesso!");
      elements.form.reset();
    } else {
      throw new Error(paymentResult.message ?? "Falha no pagamento");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    showStatus("error", `Erro: ${message}`);
    console.error("Payment error:", error);
  } finally {
    showLoading(false);
  }
};

elements.form.addEventListener("submit", handlePaymentSubmit);

// Verifica se há parâmetros de callback do 3DS na URL
const check3DSCallback = (): void => {
  const urlParams = new URLSearchParams(window.location.search);
  const tradeNo = urlParams.get("trade_no");
  const status = urlParams.get("status");
  
  if (tradeNo || status) {
    console.log("🔄 Callback do 3DS detectado na URL:", { tradeNo, status });
    
    // Se há trade_no, verifica o status da transação
    if (tradeNo) {
      showLoading(true);
      showStatus("processing", "Verificando status do pagamento...");
      
      pollTransactionStatus(tradeNo)
        .then((finalStatus) => {
          if (finalStatus === "SUCCESS") {
            showStatus("success", "Pagamento realizado com sucesso!");
            elements.form.reset();
          } else if (finalStatus === "TIMEOUT") {
            showStatus("processing", "Pagamento em processamento. Verifique seu e-mail para confirmação.");
          } else if (finalStatus === "PENDING") {
            showStatus("processing", "Pagamento ainda em processamento. Aguarde...");
          } else {
            showStatus("error", `Pagamento ${finalStatus.toLowerCase()}. Tente novamente.`);
          }
        })
        .catch((error) => {
          console.error("Erro ao verificar status:", error);
          showStatus("error", "Erro ao verificar status do pagamento.");
        })
        .finally(() => {
          showLoading(false);
          // Remove os parâmetros da URL para limpar
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }
};

// Executa quando a página carrega
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", check3DSCallback);
} else {
  check3DSCallback();
}
