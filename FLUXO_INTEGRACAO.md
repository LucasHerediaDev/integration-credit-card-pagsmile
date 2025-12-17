# Fluxo de Integração Pagsmile

Documentação simplificada do fluxo completo de integração com o gateway de pagamento Pagsmile, desde a configuração inicial até a confirmação da transação.

---

## 📋 Índice

1. [Configuração Inicial](#1-configuração-inicial)
2. [Inicialização do Sistema](#2-inicialização-do-sistema)
3. [Fluxo de Pagamento](#3-fluxo-de-pagamento)
4. [Processamento e Confirmação](#4-processamento-e-confirmação)
5. [Webhook de Notificação](#5-webhook-de-notificação)

---

## 1. Configuração Inicial

### Variáveis de Ambiente Necessárias

Antes de começar, você precisa configurar as credenciais fornecidas pela Pagsmile:

```bash
PAGSMILE_APP_ID=seu_app_id
PAGSMILE_SECURITY_KEY=sua_security_key
PAGSMILE_PUBLIC_KEY=sua_public_key
PAGSMILE_ENVIRONMENT=sandbox  # ou "prod" para produção
PAGSMILE_NOTIFY_URL=https://seudominio.com/api/webhook/payment
PAGSMILE_RETURN_URL=https://seudominio.com/success
```

**O que cada uma faz:**
- **APP_ID**: Identificador único da sua aplicação
- **SECURITY_KEY**: Chave secreta para autenticação (nunca expor no frontend!)
- **PUBLIC_KEY**: Chave pública para o SDK do frontend
- **ENVIRONMENT**: `sandbox` para testes, `prod` para produção
- **NOTIFY_URL**: URL onde a Pagsmile enviará webhooks de status
- **RETURN_URL**: Página para onde o usuário é redirecionado após pagamento

---

## 2. Inicialização do Sistema

### Backend (Node.js/Bun)

O sistema inicializa os seguintes componentes na ordem:

```
1. Carrega configurações das variáveis de ambiente
   ↓
2. Cria cliente HTTP autenticado (Basic Auth)
   ↓
3. Inicializa serviços:
   - OrderService (criar pedidos)
   - TransactionService (consultar status)
   - WebhookHandler (processar notificações)
   ↓
4. Expõe endpoints da API
```

### Endpoints Disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/config` | Retorna configuração pública para o frontend |
| POST | `/api/create-order` | Cria novo pedido na Pagsmile |
| GET | `/api/query-transaction/:tradeNo` | Consulta status de uma transação |
| POST | `/api/webhook/payment` | Recebe notificações da Pagsmile |

---

## 3. Fluxo de Pagamento

### Passo a Passo do Processo

#### **ETAPA 1: Usuário preenche o formulário**

O cliente preenche os dados no frontend:
- Valor do pagamento
- Dados pessoais (nome, email, CPF, telefone)
- Endereço completo
- Quantidade de parcelas

```typescript
// Dados capturados automaticamente pelo navegador
{
  userAgent: "Mozilla/5.0...",
  browserLanguage: "pt-BR",
  browserColorDepth: "24",
  browserScreenHeight: "1080",
  browserScreenWidth: "1920",
  browserTimeZone: "180"
}
```

---

#### **ETAPA 2: Frontend busca configurações**

```http
GET /api/config
```

Retorna:
```json
{
  "app_id": "seu_app_id",
  "public_key": "sua_public_key",
  "env": "sandbox",
  "region_code": "BRA"
}
```

---

#### **ETAPA 3: Backend cria pedido na Pagsmile**

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
  ...
}
```

**O que acontece internamente:**

1. **Valida dados do cliente** (CPF com 11 dígitos, email válido, etc.)
2. **Gera ID único do pedido** (formato: `ORDER_timestamp_random`)
3. **Monta requisição completa** incluindo:
   - Dados do pedido
   - Informações do cliente
   - Dados antifraude (device_info)
   - URLs de retorno e notificação
4. **Envia para API Pagsmile** via POST para `/trade/create`
5. **Retorna resposta**:

```json
{
  "success": true,
  "prepay_id": "abc123xyz",
  "trade_no": "PG123456789",
  "out_trade_no": "ORDER_1234567890_abc"
}
```

**Importante:** O `prepay_id` é necessário para inicializar o SDK no frontend!

---

#### **ETAPA 4: Frontend inicializa SDK da Pagsmile**

Com o `prepay_id` recebido, o frontend inicializa o SDK:

```typescript
const pagsmileClient = await Pagsmile.setPublishableKey({
  app_id: "seu_app_id",
  public_key: "sua_public_key",
  env: "sandbox",
  region_code: "BRA",
  prepay_id: "abc123xyz",  // Recebido do backend
  fields: {
    card_name: { id_selector: "card-name" },
    card_number: { id_selector: "card-number" },
    expiration_month: { id_selector: "exp-month" },
    expiration_year: { id_selector: "exp-year" },
    cvv: { id_selector: "card-cvv" }
  }
});
```

O SDK da Pagsmile:
- Cria campos seguros para dados do cartão (PCI Compliant)
- Encripta os dados sensíveis
- Nunca expõe dados do cartão para seu servidor

---

#### **ETAPA 5: Usuário preenche dados do cartão e submete**

Usuário insere:
- Nome no cartão
- Número do cartão
- Validade (mês/ano)
- CVV

Frontend envia pagamento:

```typescript
const result = await pagsmileClient.createOrder({
  phone: "11987654321",
  email: "joao@example.com",
  postal_code: "01310100",
  payer_id: "12345678901",  // CPF
  installments: { stage: 1 },  // Número de parcelas
  address: {
    country_code: "BRA",
    zip_code: "01310100",
    state: "SP",
    city: "São Paulo",
    street: "Av Paulista, 1000"
  }
});
```

**Resposta do SDK:**
```json
{
  "status": "success",
  "query": true  // Indica que deve consultar o status
}
```

---

## 4. Processamento e Confirmação

### Polling de Status

Como o processamento pode levar alguns segundos, o frontend faz consultas periódicas:

```typescript
// A cada 2 segundos, por até 10 tentativas
GET /api/query-transaction/PG123456789
```

O backend consulta a Pagsmile:
```http
POST https://gateway.pagsmile.com/trade/query
Authorization: Basic base64(app_id:security_key)

{
  "app_id": "seu_app_id",
  "timestamp": "2024-12-17 10:30:45",
  "trade_no": "PG123456789"
}
```

**Possíveis status retornados:**

| Status | Descrição | Ação |
|--------|-----------|------|
| `PENDING` | Processando | Continuar consultando |
| `SUCCESS` | Aprovado ✅ | Mostrar sucesso ao usuário |
| `FAILED` | Recusado ❌ | Informar falha |
| `CANCELLED` | Cancelado | Informar cancelamento |

---

## 5. Webhook de Notificação

### Como funciona

Independente do polling, a Pagsmile envia uma notificação HTTP para seu servidor quando o status muda:

```http
POST https://seudominio.com/api/webhook/payment
Content-Type: application/json

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

### Processamento do Webhook

1. **Valida payload** (campos obrigatórios presentes)
2. **Mapeia para evento interno**
3. **Executa callback apropriado**:
   - `onSuccess`: Se status = SUCCESS
   - `onFailed`: Se status = FAILED ou CANCELLED
4. **Retorna resposta para Pagsmile**:
   ```json
   { "result": "success" }
   ```

**⚠️ Importante:**
- Sempre retorne sucesso para a Pagsmile (mesmo se houver erro interno)
- Use webhooks como fonte definitiva de verdade
- Implemente idempotência (mesmo webhook pode chegar várias vezes)

---

## 📊 Diagrama do Fluxo Completo

```
┌─────────────┐
│  FRONTEND   │
└──────┬──────┘
       │ 1. Usuário preenche formulário
       ↓
┌──────────────────────────────────────┐
│ GET /api/config                      │
│ ← { app_id, public_key, env }        │
└──────────────────────────────────────┘
       │ 2. Obtém configuração
       ↓
┌──────────────────────────────────────┐
│ POST /api/create-order               │
│ { amount, customerInfo, deviceInfo } │
│ ← { prepay_id, trade_no }            │
└──────┬───────────────────────────────┘
       │                    ┌──────────┐
       │ 3. Backend ────────► PAGSMILE │
       │    cria pedido     │   API    │
       ↓                    └──────────┘
┌──────────────────────────────────────┐
│ SDK Pagsmile.setPublishableKey()     │
│ (inicializa campos seguros)          │
└──────────────────────────────────────┘
       │ 4. Usuário preenche cartão
       ↓
┌──────────────────────────────────────┐
│ pagsmileClient.createOrder()         │──────┐
│ (envia pagamento criptografado)      │      │
└──────────────────────────────────────┘      │ 5. Processa
       │                                       │    pagamento
       │ ← { status: "success", query: true }  │
       ↓                                       │
┌──────────────────────────────────────┐      │
│ Loop: GET /api/query-transaction     │      │
│ (consulta status a cada 2s)          │◄─────┘
│ ← { trade_status: "SUCCESS" }        │
└──────────────────────────────────────┘
       │ 6. Exibe confirmação
       ↓
┌──────────────┐
│  ✅ SUCESSO  │
└──────────────┘

       ╔════════════════════════════════╗
       ║  WEBHOOK (assíncrono)          ║
       ╠════════════════════════════════╣
       ║  POST /api/webhook/payment     ║
       ║  ← Pagsmile envia notificação  ║
       ║  → { result: "success" }       ║
       ╚════════════════════════════════╝
              │ 7. Atualiza sistema
              ↓
       ┌────────────────────┐
       │ onSuccess callback │
       │ (salva no banco,   │
       │  envia email, etc) │
       └────────────────────┘
```

---

## 🔐 Segurança

### Dados Sensíveis

**NUNCA expor no frontend:**
- ❌ `PAGSMILE_SECURITY_KEY`
- ❌ Dados completos do cartão

**Pode expor:**
- ✅ `PAGSMILE_APP_ID`
- ✅ `PAGSMILE_PUBLIC_KEY`
- ✅ `prepay_id` (gerado por pedido)

### Autenticação na API

O backend usa **Basic Authentication**:
```
Authorization: Basic base64(app_id:security_key)
```

### Device Fingerprint

Para segurança antifraude, sempre colete e envie:
- User Agent do navegador
- IP do cliente
- Resolução de tela
- Idioma do navegador
- Fuso horário

Esses dados ajudam a Pagsmile a detectar transações fraudulentas.

---

## ✅ Checklist de Integração

- [ ] Configurar variáveis de ambiente
- [ ] Implementar endpoints do backend
- [ ] Criar formulário de pagamento no frontend
- [ ] Integrar SDK da Pagsmile
- [ ] Implementar consulta de status (polling)
- [ ] Configurar webhook endpoint
- [ ] Testar fluxo completo em sandbox
- [ ] Validar recebimento de webhooks
- [ ] Implementar tratamento de erros
- [ ] Configurar logs e monitoramento
- [ ] Migrar para produção

---

## 🔗 Links Úteis

- [Documentação Oficial Pagsmile](https://docs.pagsmile.com)
- [Ambiente Sandbox](https://sandbox.pagsmile.com)
- [Dashboard de Transações](https://dashboard.pagsmile.com)

---

## 📝 Resumo

1. **Configure** as credenciais da Pagsmile
2. **Backend cria** o pedido e retorna `prepay_id`
3. **Frontend inicializa** SDK com `prepay_id`
4. **Usuário preenche** dados do cartão nos campos seguros
5. **SDK envia** pagamento de forma criptografada
6. **Frontend consulta** status periodicamente
7. **Webhook notifica** seu sistema quando status muda
8. **Sistema processa** confirmação final

---

**Dúvidas?** Consulte a documentação técnica completa em `TECHNICAL_README.md`

