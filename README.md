# Integração Pagsmile

Documentação técnica da integração com gateway Pagsmile para pagamentos com cartão de crédito.

## Setup Inicial

### Credenciais

Adicione no `.env`:

```bash
PAGSMILE_APP_ID=seu_app_id
PAGSMILE_SECURITY_KEY=sua_security_key
PAGSMILE_PUBLIC_KEY=sua_public_key
PAGSMILE_ENVIRONMENT=sandbox
PAGSMILE_NOTIFY_URL=https://seudominio.com/api/webhook/payment
PAGSMILE_RETURN_URL=https://seudominio.com/success
```

**Atenção:** `SECURITY_KEY` nunca vai pro frontend.

## Arquitetura

### Endpoints Backend

```
GET  /api/config                        # Config pública (frontend)
POST /api/create-order                  # Cria pedido
GET  /api/query-transaction/:tradeNo    # Consulta status
POST /api/webhook/payment               # Recebe webhooks
```

### Auth

API usa Basic Auth:

```
Authorization: Basic base64(app_id:security_key)
```

## Fluxo de Pagamento

### 1. Criar Pedido

**Request:**

```http
POST /api/create-order
Content-Type: application/json

{
  "amount": "100.00",
  "customerInfo": {
    "name": "João Silva",
    "email": "joao@example.com",
    "cpf": "12345678901",
    "phone": "11987654321",
    "zipCode": "01310100",
    "city": "São Paulo",
    "state": "SP",
    "address": "Av Paulista, 1000"
  },
  "userAgent": "Mozilla/5.0...",
  "browserLanguage": "pt-BR",
  "browserColorDepth": "24",
  "browserScreenHeight": "1080",
  "browserScreenWidth": "1920",
  "browserTimeZone": "180"
}
```

**Response:**

```json
{
  "success": true,
  "prepay_id": "abc123xyz",
  "trade_no": "PG123456789",
  "out_trade_no": "ORDER_1234567890_abc"
}
```

Guarda o `prepay_id` - vai precisar dele no frontend.

### 2. Inicializar SDK (Frontend)

```typescript
const client = await Pagsmile.setPublishableKey({
  app_id: config.app_id,
  public_key: config.public_key,
  env: config.env,
  region_code: "BRA",
  prepay_id: "abc123xyz",
  fields: {
    card_name: { id_selector: "card-name" },
    card_number: { id_selector: "card-number" },
    expiration_month: { id_selector: "exp-month" },
    expiration_year: { id_selector: "exp-year" },
    cvv: { id_selector: "card-cvv" }
  }
});
```

SDK cria inputs seguros pro cartão. Dados nunca passam pelo seu backend.

### 3. Submeter Pagamento

```typescript
const result = await client.createOrder({
  phone: "11987654321",
  email: "joao@example.com",
  postal_code: "01310100",
  payer_id: "12345678901",
  installments: { stage: 1 },
  address: {
    country_code: "BRA",
    zip_code: "01310100",
    state: "SP",
    city: "São Paulo",
    street: "Av Paulista, 1000"
  }
});

// result: { status: "success", query: true }
```

### 4. Consultar Status

Pagamento é assíncrono. Implementa polling:

```typescript
const checkStatus = async (tradeNo) => {
  const res = await fetch(`/api/query-transaction/${tradeNo}`);
  return res.json();
};

// Poll a cada 2s por até 30s
const maxAttempts = 15;
for (let i = 0; i < maxAttempts; i++) {
  const status = await checkStatus(tradeNo);
  
  if (status.trade_status === "SUCCESS") {
    // Aprovado
    break;
  }
  
  if (status.trade_status === "FAILED") {
    // Recusado
    break;
  }
  
  await sleep(2000);
}
```

**Status possíveis:**

- `PENDING` - processando
- `SUCCESS` - aprovado
- `FAILED` - recusado
- `CANCELLED` - cancelado

## Webhooks

Pagsmile envia notificação POST quando status muda:

```json
{
  "trade_no": "PG123456789",
  "out_trade_no": "ORDER_1234567890_abc",
  "trade_status": "SUCCESS",
  "order_amount": 100.00,
  "order_currency": "BRL",
  "method": "CreditCard",
  "timestamp": "2024-12-17 10:31:00"
}
```

**Seu endpoint deve:**

1. Validar payload
2. Processar baseado no `trade_status`
3. Retornar `{ "result": "success" }`
4. Implementar idempotência (mesmo webhook pode chegar múltiplas vezes)

Webhook é a fonte da verdade. Usa ele pra confirmar pagamento, não só o polling.

## Device Fingerprint

Sempre coleta dados do navegador pra antifraude:

```javascript
{
  userAgent: navigator.userAgent,
  browserLanguage: navigator.language,
  browserColorDepth: screen.colorDepth,
  browserScreenHeight: screen.height,
  browserScreenWidth: screen.width,
  browserTimeZone: new Date().getTimezoneOffset()
}
```

## Segurança

### Nunca expor:

- `PAGSMILE_SECURITY_KEY`
- Dados do cartão

### Pode expor:

- `PAGSMILE_APP_ID`
- `PAGSMILE_PUBLIC_KEY`
- `prepay_id` (específico de cada pedido)

## Diagrama de Sequência

```
Frontend          Backend           Pagsmile
   |                 |                 |
   |--GET /config--->|                 |
   |<----config------|                 |
   |                 |                 |
   |--POST /create-->|                 |
   |                 |--create order-->|
   |                 |<--prepay_id-----|
   |<--prepay_id-----|                 |
   |                 |                 |
   |--SDK init-------|                 |
   |--submit card----|---------------->|
   |                 |                 | (processing)
   |                 |                 |
   |--query status-->|--query-------->|
   |<---PENDING------|<---PENDING-----|
   |                 |                 |
   | (2s later)      |                 |
   |--query status-->|--query-------->|
   |<---SUCCESS------|<---SUCCESS-----|
   |                 |                 |
   |                 |<--webhook-------|
   |                 | (async)         |
```

## Checklist

- [ ] Configurar variáveis de ambiente
- [ ] Implementar endpoints backend
- [ ] Integrar SDK no frontend
- [ ] Implementar polling de status
- [ ] Configurar endpoint de webhook
- [ ] Testar em sandbox
- [ ] Validar recebimento de webhooks
- [ ] Logs e error handling
- [ ] Deploy em produção

## Ambientes

**Sandbox:**
- Dashboard: https://sandbox.pagsmile.com
- Testar sem cobrar cartão real

**Produção:**
- Dashboard: https://dashboard.pagsmile.com
- Mudar `PAGSMILE_ENVIRONMENT=prod`

## Troubleshooting

**Webhook não chega:**
- Verifica se URL é acessível publicamente
- Testa com ngrok/localtunnel no dev
- Checa logs no dashboard Pagsmile

**Status fica PENDING:**
- Cartão de teste pode demorar
- Timeout no polling pode ser curto demais
- Usa webhook como fallback

**Erro de autenticação:**
- Confere se app_id e security_key estão corretos
- Base64 do Basic Auth tem que incluir os dois separados por `:`

## Docs

- API: https://docs.pagsmile.com
- SDK: https://docs.pagsmile.com/sdk
