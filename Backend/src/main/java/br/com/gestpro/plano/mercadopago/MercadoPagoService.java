package br.com.gestpro.plano.mercadopago;

import br.com.gestpro.auth.model.Usuario;
import br.com.gestpro.auth.repository.UsuarioRepository;
import br.com.gestpro.plano.StatusAcesso;
import br.com.gestpro.plano.TipoPlano;
import br.com.gestpro.plano.stripe.PlanoTipo;
import br.com.gestpro.plano.stripe.model.Assinatura;
import br.com.gestpro.plano.stripe.repository.AssinaturaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.net.URI;
import java.time.*;
import java.util.*;

@Service
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoService {
    private final MercadoPagoClient client;
    private final MercadoPagoSubscriptionRepository subscriptions;
    private final AssinaturaRepository assinaturas;
    private final UsuarioRepository usuarios;
    private final String frontend;
    public MercadoPagoService(MercadoPagoClient client, MercadoPagoSubscriptionRepository subscriptions,
            AssinaturaRepository assinaturas, UsuarioRepository usuarios, @Value("${app.frontend.url}") String frontend) {
        this.client = client; this.subscriptions = subscriptions; this.assinaturas = assinaturas;
        this.usuarios = usuarios; this.frontend = frontend.replaceAll("/+$", "");
    }
    static BigDecimal price(PlanoTipo plano) {
        return new BigDecimal(switch (plano) { case BASICO -> "79.90"; case PRO -> "149.90"; case PREMIUM -> "299.90"; });
    }
    private Usuario lock(String email) {
        return usuarios.findByEmailForUpdate(email).orElseThrow(() -> error(HttpStatus.UNAUTHORIZED, "Entre novamente."));
    }
    private static ResponseStatusException error(HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }
    @Transactional
    public String checkout(String email, PlanoTipo plano) {
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email).orElse(null);
        if (local != null && local.getPreapprovalId() != null) {
            JsonNode current = remote(local);
            String status = current.path("status").asText();
            if ("authorized".equals(status) || "paused".equals(status))
                throw error(HttpStatus.CONFLICT, "Você já possui uma assinatura. Gerencie ou cancele a renovação antes de contratar outro plano.");
            if ("pending".equals(status)) {
                if (local.getPlano() == plano) return checkoutUrl(current);
                client.request("PUT", "/preapproval/" + MercadoPagoClient.validId(local.getPreapprovalId()), Map.of("status", "cancelled"));
            }
        }
        Assinatura access = assinaturas.findByUsuarioEmail(email).orElse(null);
        if (access != null && "ATIVO".equals(access.getStatus())
                && !access.getDataVencimento().isBefore(LocalDate.now(ZoneId.of("America/Sao_Paulo"))))
            throw error(HttpStatus.CONFLICT, "Seu período pago ainda está ativo. Você pode contratar outro plano após o vencimento.");
        // Stable reference permits recovery if a remote creation succeeded but the local transaction failed.
        String reference = "gevyro-" + usuario.getId() + "-" + plano.name();
        JsonNode recovered = null;
        int offset = 0;
        do {
            JsonNode page = client.request("GET", "/preapproval/search?external_reference=" + reference + "&limit=100&offset=" + offset, null);
            for (JsonNode candidate : page.path("results")) {
                if (reference.equals(candidate.path("external_reference").asText())
                        && !"cancelled".equals(candidate.path("status").asText())) {
                    if (recovered != null) throw error(HttpStatus.CONFLICT, "Há mais de uma assinatura em aberto. Entre em contato com o suporte.");
                    recovered = candidate;
                }
            }
            offset += 100;
            if (offset >= page.path("paging").path("total").asInt()) break;
        } while (true);
        if (recovered == null) {
            recovered = client.request("POST", "/preapproval", Map.of(
                    "reason", "Gevyro - Plano " + plano.name(), "external_reference", reference,
                    "payer_email", usuario.getEmail(), "status", "pending",
                    "back_url", frontend + "/payment/sucesso",
                    "auto_recurring", Map.of("frequency", 1, "frequency_type", "months",
                            "transaction_amount", price(plano), "currency_id", "BRL")));
        } else {
            recovered = client.request("GET", "/preapproval/" + MercadoPagoClient.validId(recovered.path("id").asText()), null);
        }
        if (local == null) local = new MercadoPagoSubscription();
        local.setUsuario(usuario); local.setPlano(plano); local.setExternalReference(reference);
        local.setPreapprovalId(MercadoPagoClient.validId(recovered.path("id").asText()));
        subscriptions.saveAndFlush(local);
        return "pending".equals(recovered.path("status").asText()) ? checkoutUrl(recovered) : frontend + "/payment/sucesso";
    }
    private String checkoutUrl(JsonNode remote) {
        String url = remote.path("init_point").asText();
        URI uri;
        try { uri = URI.create(url); } catch (Exception e) { throw error(HttpStatus.BAD_GATEWAY, "Checkout inválido."); }
        if (!"https".equals(uri.getScheme()) || !"www.mercadopago.com.br".equals(uri.getHost()) || uri.getUserInfo() != null)
            throw error(HttpStatus.BAD_GATEWAY, "O Mercado Pago não retornou um checkout brasileiro seguro.");
        return url;
    }
    private JsonNode remote(MercadoPagoSubscription local) {
        JsonNode result = client.request("GET", "/preapproval/" + MercadoPagoClient.validId(local.getPreapprovalId()), null);
        if (!local.getExternalReference().equals(result.path("external_reference").asText())
                || !local.getPreapprovalId().equals(result.path("id").asText()))
            throw error(HttpStatus.BAD_GATEWAY, "A assinatura não corresponde à conta.");
        return result;
    }
    @Transactional
    public Map<String, Object> status(String email, String preapprovalId) {
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email).orElse(null);
        if (local == null) return Map.of("status", "none", "paid", false);
        if (preapprovalId != null && !preapprovalId.equals(local.getPreapprovalId()))
            throw error(HttpStatus.FORBIDDEN, "A assinatura não pertence à sua conta.");
        return sync(usuario, local);
    }
    @Transactional
    public Map<String, Object> cancel(String email) {
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Assinatura não encontrada."));
        JsonNode current = remote(local);
        if (!"cancelled".equals(current.path("status").asText()))
            client.request("PUT", "/preapproval/" + MercadoPagoClient.validId(local.getPreapprovalId()), Map.of("status", "cancelled"));
        return sync(usuario, local);
    }
    @Transactional
    public void webhook(String type, String id) {
        MercadoPagoClient.validId(id);
        if ("subscription_preapproval".equals(type)) {
            syncId(id);
        } else if ("subscription_authorized_payment".equals(type)) {
            JsonNode invoice = client.request("GET", "/authorized_payments/" + id, null);
            syncId(invoice.path("preapproval_id").asText());
        } else if ("payment".equals(type)) {
            JsonNode page = client.request("GET", "/authorized_payments/search?payment_id=" + id, null);
            for (JsonNode invoice : page.path("results")) syncId(invoice.path("preapproval_id").asText());
        }
    }
    private void syncId(String id) {
        String email = subscriptions.findEmailByPreapprovalId(id).orElse(null);
        if (email == null) return;
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email).orElseThrow();
        if (id.equals(local.getPreapprovalId())) sync(usuario, local);
    }
    private Map<String, Object> sync(Usuario usuario, MercadoPagoSubscription local) {
        JsonNode remote = remote(local);
        JsonNode recurrence = remote.path("auto_recurring");
        if (!"BRL".equals(recurrence.path("currency_id").asText())
                || recurrence.path("frequency").asInt() != 1
                || !"months".equals(recurrence.path("frequency_type").asText())
                || price(local.getPlano()).compareTo(recurrence.path("transaction_amount").decimalValue()) != 0)
            throw error(HttpStatus.BAD_GATEWAY, "As condições da assinatura não correspondem ao plano.");
        LocalDate paidUntil = null;
        int offset = 0;
        do {
            JsonNode page = client.request("GET", "/authorized_payments/search?preapproval_id="
                    + MercadoPagoClient.validId(local.getPreapprovalId()) + "&limit=100&offset=" + offset, null);
            for (JsonNode invoice : page.path("results")) {
                if (!local.getPreapprovalId().equals(invoice.path("preapproval_id").asText())) continue;
                if (!"approved".equals(invoice.path("payment").path("status").asText())) continue;
                // Consult the actual payment as invoices can lag refunds/chargebacks.
                JsonNode payment = client.request("GET", "/v1/payments/"
                        + MercadoPagoClient.validId(invoice.path("payment").path("id").asText()), null);
                if (!"approved".equals(payment.path("status").asText())
                        || !"BRL".equals(payment.path("currency_id").asText())
                        || price(local.getPlano()).compareTo(payment.path("transaction_amount").decimalValue()) != 0
                        || payment.path("transaction_amount_refunded").decimalValue().signum() > 0) continue;
                // Use the billed cycle, never 'now + a month': retries and duplicate events cannot extend access.
                String debitDate = invoice.path("debit_date").asText();
                LocalDate end = OffsetDateTime.parse(debitDate).atZoneSameInstant(ZoneId.of("America/Sao_Paulo"))
                        .toLocalDate().plusMonths(1).minusDays(1);
                if (paidUntil == null || end.isAfter(paidUntil)) paidUntil = end;
            }
            offset += 100;
            if (offset >= page.path("paging").path("total").asInt()) break;
        } while (true);
        String status = remote.path("status").asText();
        boolean paid = paidUntil != null && !paidUntil.isBefore(LocalDate.now(ZoneId.of("America/Sao_Paulo")));
        Assinatura assinatura = assinaturas.findByUsuarioEmail(usuario.getEmail()).orElse(null);
        // A new pending checkout must not erase a previously paid period or interrupt the free trial.
        if (paid || paidUntil != null || (assinatura != null && assinatura.getPlano() == local.getPlano())) {
            if (assinatura == null) assinatura = new Assinatura();
            assinatura.setUsuario(usuario); assinatura.setPlano(local.getPlano());
            assinatura.setDataVencimento(paidUntil != null ? paidUntil : LocalDate.now().minusDays(1));
            assinatura.setStatus(paid ? "ATIVO" : "VENCIDO");
            assinatura.setUltimaAtualizacao(LocalDateTime.now());
            assinaturas.save(assinatura);
            usuario.setTipoPlano(TipoPlano.fromPlanoTipo(local.getPlano()));
            usuario.setStatusAcesso(paid ? StatusAcesso.ATIVO : StatusAcesso.INATIVO);
            usuarios.save(usuario);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plano", local.getPlano().name()); result.put("status", status); result.put("paid", paid);
        result.put("paidUntil", paidUntil == null ? "" : paidUntil.toString());
        return result;
    }
}
