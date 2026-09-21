ALTER TABLE mercado_pago_subscriptions ADD COLUMN provider_status VARCHAR(32) NOT NULL DEFAULT 'pending';
ALTER TABLE mercado_pago_subscriptions ADD COLUMN payment_status VARCHAR(32) NOT NULL DEFAULT 'none';
ALTER TABLE mercado_pago_subscriptions ADD COLUMN last_payment_id VARCHAR(100);
ALTER TABLE mercado_pago_subscriptions ADD COLUMN paid_until DATE;
ALTER TABLE mercado_pago_subscriptions ADD COLUMN last_synced_at TIMESTAMP(6) NULL;

CREATE TABLE mercado_pago_webhook_deliveries (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    delivery_key VARCHAR(64) NOT NULL UNIQUE,
    topic VARCHAR(64) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempts INT NOT NULL,
    received_at TIMESTAMP(6) NOT NULL,
    next_attempt_at TIMESTAMP(6) NOT NULL,
    processed_at TIMESTAMP(6) NULL,
    failure_code VARCHAR(64)
);
CREATE INDEX idx_mp_delivery_due ON mercado_pago_webhook_deliveries (status, next_attempt_at);
