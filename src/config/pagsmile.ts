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

export const loadPagsmileConfig = (): PagsmileConfig => {
  console.log("⚙️  Carregando configuração do Pagsmile...");
  
  validateEnvironment();

  const config = {
    appId: process.env.PAGSMILE_APP_ID!,
    securityKey: process.env.PAGSMILE_SECURITY_KEY!,
    publicKey: process.env.PAGSMILE_PUBLIC_KEY!,
    environment: getEnvironment(),
    notifyUrl: process.env.PAGSMILE_NOTIFY_URL ?? "http://localhost:3000/api/webhook/payment",
    returnUrl: process.env.PAGSMILE_RETURN_URL ?? "http://localhost:3000/success",
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
