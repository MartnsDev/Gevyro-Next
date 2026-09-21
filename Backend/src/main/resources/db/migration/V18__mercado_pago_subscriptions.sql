CREATE TABLE mercado_pago_subscriptions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT NOT NULL UNIQUE,
    external_reference VARCHAR(255) NOT NULL UNIQUE,
    preapproval_id VARCHAR(255) UNIQUE,
    plano VARCHAR(255) NOT NULL,
    CONSTRAINT fk_mercado_pago_subscriptions_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
