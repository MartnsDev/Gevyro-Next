package br.com.gestpro.plano.mercadopago;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;

@Service @RequiredArgsConstructor
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoWebhookProcessor {
    private final MercadoPagoWebhookDeliveryRepository repository;
    private final MercadoPagoService subscriptions;

    @Transactional
    public void process(Long id) {
        var delivery = repository.lockById(id).orElseThrow();
        if (!"PENDING".equals(delivery.getStatus()) || delivery.getNextAttemptAt().isAfter(Instant.now())) return;
        // State changes and completion commit together. Crash/failure rolls back both.
        subscriptions.webhook(delivery.getTopic(), delivery.getResourceId());
        delivery.setAttempts(delivery.getAttempts() + 1);
        delivery.setStatus("DONE"); delivery.setProcessedAt(Instant.now()); delivery.setFailureCode(null);
        repository.save(delivery);
    }

    @Transactional
    public String retry(Long id) {
        var delivery = repository.lockById(id).orElseThrow();
        if (!"PENDING".equals(delivery.getStatus()) || delivery.getNextAttemptAt().isAfter(Instant.now())) return delivery.getStatus();
        int attempts = delivery.getAttempts() + 1;
        delivery.setAttempts(attempts); delivery.setFailureCode("RECONCILIATION_FAILED");
        if (attempts >= 12) delivery.setStatus("FAILED");
        else delivery.setNextAttemptAt(Instant.now().plusSeconds(Math.min(3600, 15L << Math.min(attempts - 1, 8))));
        repository.save(delivery);
        return delivery.getStatus();
    }
}
