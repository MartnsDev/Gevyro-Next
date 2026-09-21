package br.com.gestpro.plano.mercadopago;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;

@Entity
@Table(name = "mercado_pago_webhook_deliveries", indexes = @Index(name = "idx_mp_delivery_due", columnList = "status,next_attempt_at"))
@Getter @Setter
public class MercadoPagoWebhookDelivery {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 64) private String deliveryKey;
    @Column(nullable = false, length = 64) private String topic;
    @Column(nullable = false, length = 100) private String resourceId;
    @Column(nullable = false, length = 16) private String status = "PENDING";
    @Column(nullable = false) private int attempts;
    @Column(nullable = false) private Instant receivedAt;
    @Column(nullable = false) private Instant nextAttemptAt;
    private Instant processedAt;
    @Column(length = 64) private String failureCode;
}
