package br.com.gestpro.plano.mercadopago;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Set;

@Service @RequiredArgsConstructor
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoWebhookInbox {
    public static final Set<String> TOPICS = Set.of("subscription_preapproval", "subscription_authorized_payment", "payment");
    private final MercadoPagoWebhookDeliveryRepository repository;
    private final PlatformTransactionManager transactions;

    public void accept(String topic, String resourceId, String requestId, String timestamp) {
        String key = deliveryKey(topic, resourceId, requestId, timestamp);
        var tx = new TransactionTemplate(transactions);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        try {
            tx.executeWithoutResult(status -> {
                if (repository.existsByDeliveryKey(key)) return;
                var delivery = new MercadoPagoWebhookDelivery();
                delivery.setDeliveryKey(key); delivery.setTopic(topic); delivery.setResourceId(resourceId);
                delivery.setReceivedAt(Instant.now()); delivery.setNextAttemptAt(Instant.now());
                repository.saveAndFlush(delivery);
            });
        } catch (DataIntegrityViolationException duplicate) {
            // A competing insert may win. Only acknowledge if it actually committed.
            if (!repository.existsByDeliveryKey(key)) throw duplicate;
        }
    }

    static String deliveryKey(String topic, String resourceId, String requestId, String timestamp) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(
                    (topic + "|" + resourceId + "|" + requestId + "|" + timestamp).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
