# Pagsmile Integration

Technical documentation for Pagsmile gateway integration for credit card payments.

## Initial Setup

### Credentials

Add to `.env`:

```bash
PAGSMILE_APP_ID=your_app_id
PAGSMILE_SECURITY_KEY=your_security_key
PAGSMILE_PUBLIC_KEY=your_public_key
PAGSMILE_ENVIRONMENT=sandbox
PAGSMILE_NOTIFY_URL=https://yourdomain.com/api/webhook/payment
PAGSMILE_RETURN_URL=https://yourdomain.com/success
```

**Warning:** `SECURITY_KEY` never goes to frontend.

## Architecture

### Backend Endpoints

```
GET  /api/config                        # Public config (frontend)
POST /api/create-order                  # Create order
GET  /api/query-transaction/:tradeNo    # Query status
POST /api/webhook/payment               # Receive webhooks
```

### Auth

API uses Basic Auth:

```
Authorization: Basic base64(app_id:security_key)
```

## Payment Flow

### 1. Create Order

**Request:**

```http
POST /api/create-order
Content-Type: application/json

{
  "amount": "100.00",
  "customerInfo": {
    "name": "John Doe",
    "email": "john@example.com",
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

Save the `prepay_id` - you'll need it on frontend.

### 2. Initialize SDK (Frontend)

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

SDK creates secure inputs for card. Data never goes through your backend.

### 3. Submit Payment

```typescript
const result = await client.createOrder({
  phone: "11987654321",
  email: "john@example.com",
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

### 4. Query Status

Payment is async. Implement polling:

```typescript
const checkStatus = async (tradeNo) => {
  const res = await fetch(`/api/query-transaction/${tradeNo}`);
  return res.json();
};

// Poll every 2s for up to 30s
const maxAttempts = 15;
for (let i = 0; i < maxAttempts; i++) {
  const status = await checkStatus(tradeNo);
  
  if (status.trade_status === "SUCCESS") {
    // Approved
    break;
  }
  
  if (status.trade_status === "FAILED") {
    // Declined
    break;
  }
  
  await sleep(2000);
}
```

**Possible statuses:**

- `PENDING` - processing
- `SUCCESS` - approved
- `FAILED` - declined
- `CANCELLED` - cancelled

## Webhooks

Pagsmile sends POST notification when status changes:

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

**Your endpoint must:**

1. Validate payload
2. Process based on `trade_status`
3. Return `{ "result": "success" }`
4. Implement idempotency (same webhook may arrive multiple times)

Webhook is the source of truth. Use it to confirm payment, not just polling.

## Device Fingerprint

Always collect browser data for fraud prevention:

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

## Security

### Never expose:

- `PAGSMILE_SECURITY_KEY`
- Card data

### Safe to expose:

- `PAGSMILE_APP_ID`
- `PAGSMILE_PUBLIC_KEY`
- `prepay_id` (order specific)

## Sequence Diagram

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

- [ ] Configure environment variables
- [ ] Implement backend endpoints
- [ ] Integrate SDK on frontend
- [ ] Implement status polling
- [ ] Configure webhook endpoint
- [ ] Test in sandbox
- [ ] Validate webhook reception
- [ ] Logs and error handling
- [ ] Deploy to production

## Environments

**Sandbox:**
- Dashboard: https://sandbox.pagsmile.com
- Test without charging real cards

**Production:**
- Dashboard: https://dashboard.pagsmile.com
- Set `PAGSMILE_ENVIRONMENT=prod`

## Troubleshooting

**Webhook not arriving:**
- Verify URL is publicly accessible
- Test with ngrok/localtunnel in dev
- Check logs in Pagsmile dashboard

**Status stuck on PENDING:**
- Test card may take time
- Polling timeout might be too short
- Use webhook as fallback

**Authentication error:**
- Check if app_id and security_key are correct
- Basic Auth base64 must include both separated by `:`

## Docs

- API: https://docs.pagsmile.com
- SDK: https://docs.pagsmile.com/sdk
