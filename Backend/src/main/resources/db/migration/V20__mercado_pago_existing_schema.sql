CREATE TABLE IF NOT EXISTS mercado_pago_subscriptions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT NOT NULL UNIQUE,
    external_reference VARCHAR(255) NOT NULL UNIQUE,
    preapproval_id VARCHAR(255) UNIQUE,
    plano VARCHAR(255) NOT NULL,
    provider_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    payment_status VARCHAR(32) NOT NULL DEFAULT 'none',
    last_payment_id VARCHAR(100),
    paid_until DATE,
    last_synced_at TIMESTAMP(6) NULL,
    CONSTRAINT fk_mp_existing_subscription_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS mercado_pago_webhook_deliveries (
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
