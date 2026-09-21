package br.com.gestpro.plano.mercadopago;

import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Collections;
import java.util.Locale;

@RestController @RequiredArgsConstructor
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoWebhookController {
    private static final int MAX_BODY = 16 * 1024;
    private static final ObjectMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private final MercadoPagoWebhookSignature signatures;
    private final MercadoPagoWebhookInbox inbox;

    @PostMapping(value = "/api/payments/webhook", consumes = "application/json")
    public ResponseEntity<String> receive(HttpServletRequest request) {
        String[] ids = request.getParameterValues("data.id");
        String signature = singleHeader(request, "x-signature");
        String requestId = singleHeader(request, "x-request-id");
        if (ids == null || ids.length != 1 || !signatures.valid(ids[0], requestId, signature))
            return ResponseEntity.status(401).body("Notificação não autenticada.");
        String id = ids[0].toLowerCase(Locale.ROOT);
        String topic;
        try {
            if (request.getContentLengthLong() > MAX_BODY) return ResponseEntity.status(413).body("Notificação muito grande.");
            byte[] bytes = request.getInputStream().readNBytes(MAX_BODY + 1);
            if (bytes.length > MAX_BODY) return ResponseEntity.status(413).body("Notificação muito grande.");
            var body = JSON.readTree(bytes);
            if (body == null || !body.isObject() || !id.equals(body.path("data").path("id").asText().toLowerCase(Locale.ROOT)))
                return ResponseEntity.badRequest().body("Notificação inválida.");
            topic = body.path("type").asText();
            if (!MercadoPagoWebhookInbox.TOPICS.contains(topic)) return ResponseEntity.ok("");
        } catch (Exception invalidBody) {
            return ResponseEntity.badRequest().body("Notificação inválida.");
        }
        try {
            // Acknowledge only after durable storage; no provider call on the HTTP thread.
            inbox.accept(topic, id, requestId, signatures.timestamp(signature));
            return ResponseEntity.ok("");
        } catch (RuntimeException unavailable) {
            return ResponseEntity.status(503).body("Recebimento temporariamente indisponível.");
        }
    }

    private static String singleHeader(HttpServletRequest request, String name) {
        var values = Collections.list(request.getHeaders(name));
        return values.size() == 1 ? values.get(0) : null;
    }
}
