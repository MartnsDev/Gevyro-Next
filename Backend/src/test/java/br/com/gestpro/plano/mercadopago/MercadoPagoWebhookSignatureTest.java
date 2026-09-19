package br.com.gestpro.plano.mercadopago;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class MercadoPagoWebhookSignatureTest {
    @Test void rejectsMissingOrMalformedSignatures() {
        var verifier = new MercadoPagoWebhookSignature("secret");
        assertThat(verifier.valid("abc", "req", null)).isFalse();
        assertThat(verifier.valid("abc", "req", "ts=1234567890,v1=invalid")).isFalse();
        assertThat(new MercadoPagoWebhookSignature("").valid("abc", "req", "anything")).isFalse();
    }
    @Test void acceptsValidSignatureAndRejectsTamperedId() {
        var verifier = new MercadoPagoWebhookSignature("secret");
        String signature = "ts=1234567890,v1=f1dffa8d1185ef347681dc6388beb62cd219cc96f4a45cfd8598abb82de44724";
        assertThat(verifier.valid("ABC", "req", signature)).isTrue();
        assertThat(verifier.valid("other", "req", signature)).isFalse();
        assertThat(verifier.valid("abc", "another-request", signature)).isFalse();
    }
}
