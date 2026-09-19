package br.com.gestpro.plano.mercadopago;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class MercadoPagoWebhookSignature {
    private final String secret;
    public MercadoPagoWebhookSignature(@Value("${mercadopago.webhook-secret:}") String secret) { this.secret = secret; }
    public boolean valid(String dataId, String requestId, String signature) {
        if (secret.isBlank() || dataId == null || requestId == null || signature == null) return false;
        String ts = null, hash = null;
        for (String part : signature.split(",")) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length != 2) continue;
            if (pair[0].equals("ts")) ts = pair[1];
            if (pair[0].equals("v1")) hash = pair[1];
        }
        if (ts == null || !ts.matches("[0-9]{10,13}") || hash == null || !hash.matches("[a-fA-F0-9]{64}")) return false;
        // Replays re-read current provider state under the user's database lock.
        String manifest = "id:" + dataId.toLowerCase(Locale.ROOT) + ";request-id:" + requestId + ";ts:" + ts + ";";
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return MessageDigest.isEqual(mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8)), HexFormat.of().parseHex(hash));
        } catch (Exception e) { return false; }
    }
}
