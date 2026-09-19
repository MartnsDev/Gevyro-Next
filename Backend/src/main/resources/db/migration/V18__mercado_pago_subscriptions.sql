CREATE TABLE mercado_pago_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL UNIQUE REFERENCES usuarios(id),
    external_reference VARCHAR(255) NOT NULL UNIQUE,
    preapproval_id VARCHAR(255) UNIQUE,
    plano VARCHAR(255) NOT NULL
);
