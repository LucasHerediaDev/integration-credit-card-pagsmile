import type { PagsmileConfig, PagsmileEnvironment } from "../types/pagsmile.ts";

const requiredEnvVars = [
  "PAGSMILE_APP_ID",
  "PAGSMILE_SECURITY_KEY",
  "PAGSMILE_PUBLIC_KEY",
] as const;

const validateEnvironment = (): void => {
  console.log("🔍 Validando variáveis de ambiente...");
  
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    console.error("❌ Variáveis de ambiente faltando:", missing);
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  
  console.log("✅ Todas as variáveis de ambiente obrigatórias estão presentes");
};

const getEnvironment = (): PagsmileEnvironment => {
  const env = process.env.PAGSMILE_ENVIRONMENT ?? "sandbox";
  console.log("🌍 Ambiente configurado:", env);
  
  if (env !== "sandbox" && env !== "prod") {
    console.error(`❌ Ambiente inválido: ${env}`);
    throw new Error(`Invalid PAGSMILE_ENVIRONMENT: ${env}. Must be "sandbox" or "prod"`);
  }
  
  return env;
};

const validateProductionUrls = (notifyUrl: string, returnUrl: string, environment: PagsmileEnvironment): void => {
  if (environment !== "prod") {
    return;
  }

  const isLocalUrl = (url: string): boolean =>
    url.includes("localhost") || url.includes("127.0.0.1") || url.startsWith("http://");

  if (isLocalUrl(notifyUrl)) {
    console.error("========================================");
    console.error("🚨 ERRO CRÍTICO: PAGSMILE_NOTIFY_URL inválida para produção!");
    console.error("🚨 URLs localhost ou HTTP não funcionam com 3DS em produção.");
    console.error("🚨 Use uma URL HTTPS pública (ex: https://seu-dominio.com/api/webhook/payment)");
    console.error("========================================");
  }

  if (isLocalUrl(returnUrl)) {
    console.error("========================================");
    console.error("🚨 ERRO CRÍTICO: PAGSMILE_RETURN_URL inválida para produção!");
    console.error("🚨 URLs localhost ou HTTP não funcionam com 3DS em produção.");
    console.error("🚨 Use uma URL HTTPS pública (ex: https://seu-dominio.com/)");
    console.error("========================================");
  }
};

export const loadPagsmileConfig = (): PagsmileConfig => {
  console.log("⚙️  Carregando configuração do Pagsmile...");

  validateEnvironment();

  const environment = getEnvironment();
  const notifyUrl = process.env.PAGSMILE_NOTIFY_URL ?? "http://localhost:3000/api/webhook/payment";
  const returnUrl = process.env.PAGSMILE_RETURN_URL ?? "http://localhost:3000/success";

  validateProductionUrls(notifyUrl, returnUrl, environment);

  const config = {
    appId: process.env.PAGSMILE_APP_ID!,
    securityKey: process.env.PAGSMILE_SECURITY_KEY!,
    publicKey: process.env.PAGSMILE_PUBLIC_KEY!,
    environment,
    notifyUrl,
    returnUrl,
  };

  console.log("📋 Configuração carregada (valores sensíveis omitidos):", {
    appId: config.appId.substring(0, 10) + "...",
    environment: config.environment,
    notifyUrl: config.notifyUrl,
    returnUrl: config.returnUrl,
  });

  return config;
};

export const PAGSMILE_API_BASE_URL = "https://gateway.pagsmile.com";
