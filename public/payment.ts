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

const getDeviceInfo = () => ({
  userAgent: navigator.userAgent,
  browserLanguage: navigator.language,
  browserColorDepth: screen.colorDepth.toString(),
  browserScreenHeight: screen.height.toString(),
  browserScreenWidth: screen.width.toString(),
  browserTimeZone: new Date().getTimezoneOffset().toString(),
});

const createBackendOrder = async (
  amount: string,
  customerInfo: CustomerInfo
): Promise<CreateOrderResponse> => {
  const deviceInfo = getDeviceInfo();
  
  const response = await fetch("/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      amount, 
      customerInfo,
      ...deviceInfo,
    }),
  });

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

  return client.createOrder(paymentData);
};

interface TransactionQueryResponse {
  trade_status: string;
}

const pollTransactionStatus = async (
  tradeNo: string,
  maxAttempts = 10,
  intervalMs = 2000
): Promise<string> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`/api/query-transaction/${tradeNo}`);
    const data = (await response.json()) as TransactionQueryResponse;

    if (data.trade_status === "SUCCESS") {
      return "SUCCESS";
    }

    if (data.trade_status === "FAILED" || data.trade_status === "CANCELLED") {
      return data.trade_status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

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

    showStatus("processing", "Inicializando pagamento...");
    const pagsmileClient = await initializePagsmileSdk(sdkConfig, orderResponse.prepay_id);

    showStatus("processing", "Processando pagamento...");
    const paymentResult = await submitPayment(pagsmileClient, customerInfo, installments);

    if (paymentResult.status === "success" && paymentResult.query && orderResponse.trade_no) {
      showStatus("processing", "Verificando status do pagamento...");
      const finalStatus = await pollTransactionStatus(orderResponse.trade_no);

      if (finalStatus === "SUCCESS") {
        showStatus("success", "Pagamento realizado com sucesso!");
        elements.form.reset();
      } else if (finalStatus === "TIMEOUT") {
        showStatus("processing", "Pagamento em processamento. Verifique seu e-mail para confirmação.");
      } else {
        showStatus("error", `Pagamento ${finalStatus.toLowerCase()}. Tente novamente.`);
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
