package br.com.gestpro.plano.mercadopago;

import com.mercadopago.webhook.WebhookSignatureValidator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.Locale;

@Component
public class MercadoPagoWebhookSignature {
    private final String secret;
    public MercadoPagoWebhookSignature(@Value("${mercadopago.webhook-secret:}") String secret) { this.secret = secret; }

    public boolean valid(String dataId, String requestId, String signature) {
        if (secret.isBlank() || dataId == null || !dataId.matches("[a-zA-Z0-9_-]{1,100}")
                || requestId == null || !requestId.matches("[a-zA-Z0-9_-]{1,128}")
                || signature == null || signature.length() > 512) return false;
        var parts = new HashMap<String, String>();
        for (String part : signature.split(",", -1)) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length != 2 || parts.putIfAbsent(pair[0].trim(), pair[1].trim()) != null) return false;
        }
        if (!parts.getOrDefault("ts", "").matches("[0-9]{1,13}")
                || !parts.getOrDefault("v1", "").matches("[a-fA-F0-9]{64}")) return false;
        try {
            // The signed resource ID is taken from the query, never from body state.
            WebhookSignatureValidator.validate("ts=" + parts.get("ts") + ",v1=" + parts.get("v1").toLowerCase(Locale.ROOT),
                    requestId, dataId.toLowerCase(Locale.ROOT), secret);
            return true;
        } catch (Exception ignored) {
            // Do not disclose SDK exceptions, signatures or the secret.
            return false;
        }
    }

    public String timestamp(String signature) {
        for (String part : signature.split(",")) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length == 2 && pair[0].trim().equals("ts")) return pair[1].trim();
        }
        throw new IllegalArgumentException("Assinatura inválida.");
    }
}
