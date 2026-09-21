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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.net.URI;
import java.time.*;
import java.util.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Service
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoService {
    private static final Map<PlanoTipo, Map<String, Object>> SUBSCRIPTION_OFFERS = Map.of(
            PlanoTipo.BASICO, Map.of("reason", "Gevyro - Plano BASICO", "amount", new BigDecimal("79.90")),
            PlanoTipo.PRO, Map.of("reason", "Gevyro - Plano PRO", "amount", new BigDecimal("149.90")),
            PlanoTipo.PREMIUM, Map.of("reason", "Gevyro - Plano PREMIUM", "amount", new BigDecimal("299.90")));
    private final MercadoPagoClient client;
    private final MercadoPagoSubscriptionRepository subscriptions;
    private final AssinaturaRepository assinaturas;
    private final UsuarioRepository usuarios;
    private final String frontend;
    private final TransactionTemplate checkoutTransactions;
    @Value("${mercadopago.webhook-url:http://localhost:8080/api/payments/webhook}")
    private String webhookUrl;
    public MercadoPagoService(MercadoPagoClient client, MercadoPagoSubscriptionRepository subscriptions,
            AssinaturaRepository assinaturas, UsuarioRepository usuarios, @Value("${app.frontend.url}") String frontend, PlatformTransactionManager transactionManager) {
        this.client = client; this.subscriptions = subscriptions; this.assinaturas = assinaturas;
        this.usuarios = usuarios; this.frontend = validateFrontend(frontend);
        this.checkoutTransactions = new TransactionTemplate(transactionManager);
        this.checkoutTransactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    private static String validateFrontend(String value) {
        URI uri = URI.create(value);
        boolean local = Set.of("localhost", "127.0.0.1", "[::1]").contains(Objects.toString(uri.getHost(), ""));
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                || !("https".equals(uri.getScheme()) || (local && "http".equals(uri.getScheme()))))
            throw new IllegalArgumentException("app.frontend.url deve ser uma origem HTTPS pública ou HTTP localhost para desenvolvimento.");
        return value.replaceAll("/+$", "");
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
    private record Attempt(String reference, String email, PlanoTipo plano, boolean creator, String url) {}

    public String checkout(String email, PlanoTipo plano) {
        client.ensureConfigured();
        // This transaction must commit before the external POST. Only its owner may create.
        Attempt attempt = Objects.requireNonNull(checkoutTransactions.execute(tx -> reserve(email, plano)));
        if (attempt.url() != null) return attempt.url();
        JsonNode result;
        if (attempt.creator()) {
            Map<String, Object> offer = SUBSCRIPTION_OFFERS.get(attempt.plano());
            result = client.request("POST", "/preapproval", Map.of(
                    "reason", offer.get("reason"), "external_reference", attempt.reference(),
                    "payer_email", attempt.email(), "status", "pending",
                    "back_url", frontend + "/payment/sucesso",
                    "notification_url", notificationUrl(),
                    "auto_recurring", Map.of("frequency", 1, "frequency_type", "months",
                            "transaction_amount", offer.get("amount"), "currency_id", "BRL")));
        } else {
            result = recover(attempt.reference());
            if (result == null) throw error(HttpStatus.CONFLICT,
                    "A contratação anterior está em verificação. Atualize o status da assinatura; não inicie outra cobrança.");
        }
        JsonNode remote = result;
        return Objects.requireNonNull(checkoutTransactions.execute(tx -> {
            lock(email);
            MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email).orElseThrow();
            if (!attempt.reference().equals(local.getExternalReference()))
                throw error(HttpStatus.CONFLICT, "A contratação foi alterada. Consulte sua assinatura.");
            attach(local, remote);
            return "pending".equals(remote.path("status").asText()) ? checkoutUrl(remote) : frontend + "/payment/sucesso";
        }));
    }

    private String notificationUrl() {
        // Instâncias criadas diretamente em testes não passam pela injeção do Spring.
        if (webhookUrl == null) webhookUrl = "http://localhost:8080/api/payments/webhook";
        if (webhookUrl.isBlank())
            throw error(HttpStatus.SERVICE_UNAVAILABLE, "O webhook de assinaturas não está configurado.");
        URI uri;
        try { uri = URI.create(webhookUrl.trim()); }
        catch (IllegalArgumentException ex) { throw error(HttpStatus.SERVICE_UNAVAILABLE, "O webhook de assinaturas está mal configurado."); }
        boolean local = Set.of("localhost", "127.0.0.1", "[::1]").contains(Objects.toString(uri.getHost(), ""));
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || !("https".equalsIgnoreCase(uri.getScheme()) || (local && "http".equalsIgnoreCase(uri.getScheme())))
                || !"/api/payments/webhook".equals(uri.getPath()))
            throw error(HttpStatus.SERVICE_UNAVAILABLE, "O webhook de assinaturas deve ser uma URL HTTPS pública.");
        return webhookUrl.trim();
    }

    private Attempt reserve(String email, PlanoTipo plano) {
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email).orElse(null);
        if (local != null && local.getPreapprovalId() == null) {
            if (local.getPlano() != plano) throw error(HttpStatus.CONFLICT,
                    "Há uma contratação anterior em verificação. Consulte sua assinatura antes de trocar o plano.");
            return new Attempt(local.getExternalReference(), usuario.getEmail(), plano, false, null);
        }
        if (local != null) {
            JsonNode current = remote(local);
            String status = current.path("status").asText();
            if ("authorized".equals(status) || "paused".equals(status))
                throw error(HttpStatus.CONFLICT, "Você já possui uma assinatura. Gerencie ou cancele a renovação antes de contratar outro plano.");
            if ("pending".equals(status)) {
                if (local.getPlano() == plano)
                    return new Attempt(local.getExternalReference(), usuario.getEmail(), plano, false, checkoutUrl(current));
                // Uma tentativa abandonada ainda fica pendente no Mercado Pago.
                // Cancele-a antes de reservar o novo plano para evitar duas cobranças.
                client.request("PUT", "/preapproval/" + MercadoPagoClient.validId(local.getPreapprovalId()),
                        Map.of("status", "cancelled"));
                local.setExternalReference("gevyro-" + UUID.randomUUID());
                local.setPreapprovalId(null);
                local.setPlano(plano);
                local.setProviderStatus("pending");
                local.setPaymentStatus("none");
                local.setLastPaymentId(null);
                local.setPaidUntil(null);
                local.setLastSyncedAt(null);
                subscriptions.saveAndFlush(local);
                return new Attempt(local.getExternalReference(), usuario.getEmail(), plano, true, null);
            }
            if (!"cancelled".equals(status)) throw error(HttpStatus.CONFLICT, "Consulte o status da assinatura antes de contratar novamente.");
        }
        Assinatura access = assinaturas.findByUsuarioEmail(email).orElse(null);
        if (access != null && "ATIVO".equals(access.getStatus())
                && !access.getDataVencimento().isBefore(LocalDate.now(ZoneId.of("America/Sao_Paulo"))))
            throw error(HttpStatus.CONFLICT, "Seu período pago ainda está ativo. Você pode contratar outro plano após o vencimento.");
        if (local == null) {
            // Recover attempts from the former deterministic-reference implementation first.
            JsonNode legacy = recover("gevyro-" + usuario.getId() + "-" + plano.name());
            if (legacy != null) {
                local = new MercadoPagoSubscription(); local.setUsuario(usuario); local.setPlano(plano);
                local.setExternalReference("gevyro-" + usuario.getId() + "-" + plano.name());
                attach(local, legacy);
                return new Attempt(local.getExternalReference(), usuario.getEmail(), plano, false,
                        "pending".equals(legacy.path("status").asText()) ? checkoutUrl(legacy) : frontend + "/payment/sucesso");
            }
            local = new MercadoPagoSubscription();
        }
        String reference = "gevyro-" + UUID.randomUUID();
        local.setUsuario(usuario); local.setPlano(plano); local.setExternalReference(reference);
        local.setPreapprovalId(null);
        subscriptions.saveAndFlush(local);
        return new Attempt(reference, usuario.getEmail(), plano, true, null);
    }

    private JsonNode recover(String reference) {
        JsonNode recovered = null;
        int offset = 0;
        do {
            JsonNode page = client.request("GET", "/preapproval/search?external_reference="
                    + URLEncoder.encode(reference, StandardCharsets.UTF_8) + "&limit=100&offset=" + offset, null);
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
        return recovered == null ? null : client.request("GET", "/preapproval/"
                + MercadoPagoClient.validId(recovered.path("id").asText()), null);
    }

    private void attach(MercadoPagoSubscription local, JsonNode remote) {
        String id = MercadoPagoClient.validId(remote.path("id").asText());
        if (!local.getExternalReference().equals(remote.path("external_reference").asText())
                || (local.getPreapprovalId() != null && !local.getPreapprovalId().equals(id)))
            throw error(HttpStatus.BAD_GATEWAY, "A assinatura não corresponde à contratação.");
        validateTerms(local, remote);
        if (!Set.of("pending", "authorized", "paused", "cancelled").contains(remote.path("status").asText()))
            throw error(HttpStatus.BAD_GATEWAY, "O Mercado Pago retornou um status de assinatura desconhecido.");
        local.setPreapprovalId(id);
        subscriptions.saveAndFlush(local);
    }

    private String checkoutUrl(JsonNode remote) {
        String url = remote.path("init_point").asText();
        URI uri;
        try { uri = URI.create(url); } catch (Exception e) { throw error(HttpStatus.BAD_GATEWAY, "Checkout inválido."); }
        if (!"https".equals(uri.getScheme()) || !"www.mercadopago.com.br".equals(uri.getHost()) || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443))
            throw error(HttpStatus.BAD_GATEWAY, "O Mercado Pago não retornou um checkout brasileiro seguro.");
        return url;
    }
    private JsonNode remote(MercadoPagoSubscription local) {
        JsonNode result = client.request("GET", "/preapproval/" + MercadoPagoClient.validId(local.getPreapprovalId()), null);
        if (!local.getExternalReference().equals(result.path("external_reference").asText())
                || !local.getPreapprovalId().equals(result.path("id").asText()))
            throw error(HttpStatus.BAD_GATEWAY, "A assinatura não corresponde à conta.");
        validateTerms(local, result);
        return result;
    }
    @Transactional
    public Map<String, Object> status(String email, String preapprovalId) {
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email).orElse(null);
        if (local == null) return Map.of("status", "none", "paid", false);
        if (preapprovalId != null && !preapprovalId.equals(local.getPreapprovalId()))
            throw error(HttpStatus.FORBIDDEN, "A assinatura não pertence à sua conta.");
        if (local.getPreapprovalId() == null) {
            JsonNode recovered = recover(local.getExternalReference());
            if (recovered == null) return Map.of("status", "processing", "plano", local.getPlano().name(), "paid", false);
            attach(local, recovered);
        }
        return sync(usuario, local);
    }
    @Transactional
    public Map<String, Object> cancel(String email) {
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Assinatura não encontrada."));
        if (local.getPreapprovalId() == null) throw error(HttpStatus.CONFLICT, "A contratação ainda está em verificação.");
        JsonNode current = remote(local);
        if (!"cancelled".equals(current.path("status").asText()))
            client.request("PUT", "/preapproval/" + MercadoPagoClient.validId(local.getPreapprovalId()), Map.of("status", "cancelled"));
        return sync(usuario, local);
    }
    @Transactional
    public Map<String, Object> lifecycle(String email, String id, String action) {
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Assinatura não encontrada."));
        if (!MercadoPagoClient.validId(id).equals(local.getPreapprovalId()))
            throw error(HttpStatus.FORBIDDEN, "A assinatura não pertence à sua conta.");
        String providerStatus = switch (action) {
            case "pause" -> "paused";
            case "reactivate" -> "authorized";
            case "cancel" -> "cancelled";
            default -> throw error(HttpStatus.BAD_REQUEST, "Ação de assinatura inválida.");
        };
        client.request("PUT", "/preapproval/" + MercadoPagoClient.validId(id), Map.of("status", providerStatus));
        return sync(usuario, local);
    }
    @Transactional
    public void webhook(String type, String id) {
        MercadoPagoClient.validId(id);
        switch (type) {
            case "subscription_preapproval" -> syncId(id);
            case "subscription_authorized_payment" -> {
                JsonNode invoice = client.request("GET", "/authorized_payments/" + id, null);
                verifyResourceId(invoice, id);
                syncId(MercadoPagoClient.validId(invoice.path("preapproval_id").asText()), id);
            }
            case "payment" -> {
                // Query the actual payment, not a status supplied in the notification.
                JsonNode payment = client.request("GET", "/v1/payments/" + id, null);
                verifyResourceId(payment, id);
                Map<String, String> contracts = new TreeMap<>();
                int offset = 0;
                do {
                    JsonNode page = client.request("GET", "/authorized_payments/search?payment_id="
                            + id + "&limit=100&offset=" + offset, null);
                    requireResults(page);
                    for (JsonNode invoice : page.path("results")) {
                        if (id.equals(invoice.path("payment").path("id").asText()))
                            contracts.put(MercadoPagoClient.validId(invoice.path("preapproval_id").asText()),
                                    MercadoPagoClient.validId(invoice.path("id").asText()));
                    }
                    offset += 100;
                    if (offset >= page.path("paging").path("total").asInt()) break;
                } while (true);
                if (contracts.isEmpty()) throw error(HttpStatus.BAD_GATEWAY,
                        "O vínculo entre pagamento e assinatura ainda não está disponível.");
                for (var contract : contracts.entrySet()) syncId(contract.getKey(), contract.getValue());
            }
            default -> throw error(HttpStatus.BAD_REQUEST, "Tipo de notificação não suportado.");
        }
    }

    private void syncId(String id) { syncId(id, null); }

    private void syncId(String id, String expectedInvoiceId) {
        String email = subscriptions.findEmailByPreapprovalId(id).orElse(null);
        if (email == null) {
            // The notification can arrive before the checkout response is saved.
            JsonNode notified = client.request("GET", "/preapproval/" + id, null);
            verifyResourceId(notified, id);
            email = subscriptions.findEmailByExternalReference(notified.path("external_reference").asText()).orElse(null);
            if (email == null) return; // An unrelated subscription from the same seller is not a Gevyro purchase.
        }
        Usuario usuario = lock(email);
        MercadoPagoSubscription local = subscriptions.findByUsuarioEmail(email).orElseThrow();
        if (local.getPreapprovalId() == null) {
            JsonNode current = client.request("GET", "/preapproval/" + id, null);
            attach(local, current);
        }
        if (id.equals(local.getPreapprovalId())) sync(usuario, local, expectedInvoiceId);
    }

    private static void verifyResourceId(JsonNode resource, String expected) {
        if (!expected.equals(resource.path("id").asText()))
            throw error(HttpStatus.BAD_GATEWAY, "O recurso consultado não corresponde à notificação.");
    }

    private static void requireResults(JsonNode page) {
        if (!page.path("results").isArray())
            throw error(HttpStatus.BAD_GATEWAY, "O Mercado Pago retornou uma consulta incompleta.");
    }
    private void validateTerms(MercadoPagoSubscription local, JsonNode remote) {
        JsonNode recurrence = remote.path("auto_recurring");
        if (!"BRL".equals(recurrence.path("currency_id").asText())
                || recurrence.path("frequency").asInt() != 1
                || !"months".equals(recurrence.path("frequency_type").asText())
                || price(local.getPlano()).compareTo(recurrence.path("transaction_amount").decimalValue()) != 0)
            throw error(HttpStatus.BAD_GATEWAY, "As condições da assinatura não correspondem ao plano.");
    }
    private Map<String, Object> sync(Usuario usuario, MercadoPagoSubscription local) {
        return sync(usuario, local, null);
    }
    private Map<String, Object> sync(Usuario usuario, MercadoPagoSubscription local, String expectedInvoiceId) {
        boolean foundExpectedInvoice = expectedInvoiceId == null;
        JsonNode remote = remote(local);
        String status = remote.path("status").asText();
        if (!Set.of("pending", "authorized", "paused", "cancelled").contains(status))
            throw error(HttpStatus.BAD_GATEWAY, "Estado de assinatura desconhecido.");
        String collector = remote.path("collector_id").asText();
        if (!collector.matches("[1-9][0-9]*")) throw error(HttpStatus.BAD_GATEWAY, "Assinatura sem vendedor válido.");
        LocalDate today = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
        LocalDate paidUntil = null;
        Instant latestDebit = Instant.MIN;
        String paymentStatus = "none", lastPaymentId = null;
        int offset = 0;
        do {
            JsonNode page = client.request("GET", "/authorized_payments/search?preapproval_id="
                    + MercadoPagoClient.validId(local.getPreapprovalId()) + "&limit=100&offset=" + offset, null);
            requireResults(page);
            for (JsonNode invoice : page.path("results")) {
                if (Objects.equals(expectedInvoiceId, invoice.path("id").asText())) foundExpectedInvoice = true;
                if (!local.getPreapprovalId().equals(invoice.path("preapproval_id").asText()))
                    throw error(HttpStatus.BAD_GATEWAY, "Fatura vinculada a outra assinatura.");
                OffsetDateTime debit;
                try { debit = OffsetDateTime.parse(invoice.path("debit_date").asText()); }
                catch (RuntimeException invalid) { throw error(HttpStatus.BAD_GATEWAY, "Fatura sem período de cobrança válido."); }
                LocalDate start = debit.atZoneSameInstant(ZoneId.of("America/Sao_Paulo")).toLocalDate();
                String paymentId = invoice.path("payment").path("id").asText();
                String currentStatus = "pending";
                JsonNode payment = null;
                if (!paymentId.isBlank()) {
                    payment = client.request("GET", "/v1/payments/" + MercadoPagoClient.validId(paymentId), null);
                    verifyResourceId(payment, paymentId);
                    if (!collector.equals(payment.path("collector_id").asText())
                            || !"BRL".equals(payment.path("currency_id").asText())
                            || price(local.getPlano()).compareTo(payment.path("transaction_amount").decimalValue()) != 0)
                        throw error(HttpStatus.BAD_GATEWAY, "Pagamento não corresponde ao vendedor, valor ou moeda da assinatura.");
                    currentStatus = payment.path("status").asText();
                    if (!Set.of("approved", "pending", "in_process", "in_mediation", "rejected", "cancelled", "refunded", "charged_back", "authorized").contains(currentStatus))
                        throw error(HttpStatus.BAD_GATEWAY, "Estado de pagamento desconhecido.");
                    if (payment.path("transaction_amount_refunded").decimalValue().signum() > 0) currentStatus = "refunded";
                }
                // Scheduled future invoices cannot grant access or replace this cycle's payment state.
                if (start.isAfter(today)) continue;
                if (debit.toInstant().isAfter(latestDebit)
                        || (debit.toInstant().equals(latestDebit) && "approved".equals(currentStatus))) {
                    latestDebit = debit.toInstant(); paymentStatus = currentStatus;
                    lastPaymentId = paymentId.isBlank() ? null : paymentId;
                }
                if (payment != null && "approved".equals(currentStatus)) {
                    LocalDate end = start.plusMonths(1).minusDays(1);
                    if (paidUntil == null || end.isAfter(paidUntil)) paidUntil = end;
                }
            }
            offset += 100;
            if (offset >= page.path("paging").path("total").asInt()) break;
        } while (true);
        if (!foundExpectedInvoice) throw error(HttpStatus.BAD_GATEWAY, "A fatura notificada ainda não consta na consulta da assinatura.");
        boolean paid = paidUntil != null && !paidUntil.isBefore(today);
        local.setProviderStatus(status); local.setPaymentStatus(paymentStatus);
        local.setLastPaymentId(lastPaymentId); local.setPaidUntil(paidUntil); local.setLastSyncedAt(Instant.now());
        subscriptions.save(local);

        Assinatura assinatura = assinaturas.findByUsuarioEmail(usuario.getEmail()).orElse(null);
        // Pending/declined authorization must not erase an ongoing trial or unmigrated Stripe entitlement.
        boolean managedAccess = assinatura != null && assinatura.getStripeSubscriptionId() == null
                && assinatura.getPlano() == local.getPlano();
        if (paid || paidUntil != null || managedAccess) {
            if (assinatura == null) assinatura = new Assinatura();
            assinatura.setUsuario(usuario); assinatura.setPlano(local.getPlano());
            assinatura.setDataVencimento(paidUntil != null ? paidUntil : today.minusDays(1));
            String accessStatus = paid ? "ATIVO" : switch (status) {
                case "cancelled" -> "CANCELADO";
                case "paused" -> "PAUSADO";
                default -> "rejected".equals(paymentStatus) ? "INADIMPLENTE" : "pending".equals(status) ? "PENDENTE" : "VENCIDO";
            };
            assinatura.setStatus(accessStatus); assinatura.setUltimaAtualizacao(LocalDateTime.now());
            assinaturas.save(assinatura);
            usuario.setTipoPlano(TipoPlano.fromPlanoTipo(local.getPlano()));
            usuario.setStatusAcesso(paid ? StatusAcesso.ATIVO : StatusAcesso.INATIVO);
            usuarios.save(usuario);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", local.getPreapprovalId()); result.put("plano", local.getPlano().name());
        result.put("status", status); result.put("paymentStatus", paymentStatus); result.put("paid", paid);
        result.put("paidUntil", paidUntil == null ? "" : paidUntil.toString());
        return result;
    }
}
