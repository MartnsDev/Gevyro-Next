package br.com.gestpro.plano.mercadopago;

import br.com.gestpro.auth.model.Usuario;
import br.com.gestpro.auth.repository.UsuarioRepository;
import br.com.gestpro.plano.StatusAcesso;
import br.com.gestpro.plano.TipoPlano;
import br.com.gestpro.plano.stripe.PlanoTipo;
import br.com.gestpro.plano.stripe.repository.AssinaturaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DataJpaTest(showSql = false, properties = "billing.provider=mercadopago")
@ActiveProfiles("test")
@Import({MercadoPagoService.class, MercadoPagoWebhookInbox.class, MercadoPagoWebhookProcessor.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class MercadoPagoWebhookIntegrationTest {
    static final String SECRET = "local-webhook-test-secret";
    @Autowired UsuarioRepository users;
    @Autowired AssinaturaRepository access;
    @Autowired MercadoPagoSubscriptionRepository subscriptions;
    @Autowired MercadoPagoWebhookDeliveryRepository deliveries;
    @Autowired MercadoPagoWebhookInbox inbox;
    @Autowired MercadoPagoWebhookProcessor processor;
    @MockBean MercadoPagoClient client;
    final ObjectMapper json = new ObjectMapper();
    MockMvc mvc;
    String email, contract, reference;
    LocalDate today = LocalDate.now(ZoneId.of("America/Sao_Paulo"));

    @BeforeEach void setup() throws Exception {
        deliveries.deleteAll();
        email = UUID.randomUUID() + "@example.com";
        contract = UUID.randomUUID().toString(); reference = "gevyro-" + UUID.randomUUID();
        Usuario buyer = new Usuario(); buyer.setEmail(email); buyer.setNome("Comprador"); users.saveAndFlush(buyer);
        var local = new MercadoPagoSubscription(); local.setUsuario(buyer); local.setPlano(PlanoTipo.PRO);
        local.setPreapprovalId(contract); local.setExternalReference(reference); subscriptions.saveAndFlush(local);
        mvc = MockMvcBuilders.standaloneSetup(new MercadoPagoWebhookController(new MercadoPagoWebhookSignature(SECRET), inbox)).build();
        provider("authorized", "approved", today, 99);
    }

    String signature(String id, String request) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return "ts=1700000000,v1=" + HexFormat.of().formatHex(mac.doFinal(
                ("id:" + id.toLowerCase(Locale.ROOT) + ";request-id:" + request + ";ts:1700000000;").getBytes(StandardCharsets.UTF_8)));
    }

    void provider(String state, String paymentState, LocalDate cycle, long collector) throws Exception {
        when(client.request("GET", "/preapproval/" + contract, null)).thenReturn(json.readTree("""
                {"id":"%s","external_reference":"%s","status":"%s","collector_id":99,
                 "auto_recurring":{"frequency":1,"frequency_type":"months","currency_id":"BRL","transaction_amount":149.90}}
                """.formatted(contract, reference, state)));
        JsonNode invoice = json.readTree("""
                {"id":202,"preapproval_id":"%s","debit_date":"%sT12:00:00-03:00","payment":{"id":101,"status":"pending"}}
                """.formatted(contract, cycle));
        var page = json.createObjectNode(); page.set("results", json.createArrayNode().add(invoice));
        page.set("paging", json.createObjectNode().put("total", 1));
        when(client.request("GET", "/authorized_payments/search?preapproval_id=" + contract + "&limit=100&offset=0", null)).thenReturn(page);
        when(client.request("GET", "/authorized_payments/search?payment_id=101&limit=100&offset=0", null)).thenReturn(page);
        when(client.request("GET", "/authorized_payments/202", null)).thenReturn(invoice);
        when(client.request("GET", "/v1/payments/101", null)).thenReturn(json.readTree("""
                {"id":101,"collector_id":%s,"status":"%s","transaction_amount":149.90,"currency_id":"BRL","transaction_amount_refunded":0}
                """.formatted(collector, paymentState)));
    }

    Long receive(String topic, String id, String request) throws Exception {
        mvc.perform(post("/api/payments/webhook").queryParam("data.id", id).contentType("application/json")
                .header("x-request-id", request).header("x-signature", signature(id, request))
                // Forged status is intentionally ignored. Only the API can grant access.
                .content("{\"type\":\"" + topic + "\",\"status\":\"approved\",\"data\":{\"id\":\"" + id + "\"}}"))
                .andExpect(status().isOk());
        return deliveries.findByDeliveryKey(MercadoPagoWebhookInbox.deliveryKey(topic, id, request, "1700000000")).orElseThrow().getId();
    }
    void notify(String topic, String id, String request) throws Exception { processor.process(receive(topic, id, request)); }
    MercadoPagoSubscription local() { return subscriptions.findByUsuarioEmail(email).orElseThrow(); }

    @Test void acknowledgesDurablyBeforeAnyApiCallAndProcessesDuplicatesOnce() throws Exception {
        Long id = receive("subscription_preapproval", contract, "first");
        verifyNoInteractions(client);
        assertThat(deliveries.findById(id).orElseThrow().getStatus()).isEqualTo("PENDING");
        processor.process(id);
        assertThat(access.findByUsuarioEmail(email).orElseThrow().getDataVencimento()).isEqualTo(today.plusMonths(1).minusDays(1));
        assertThat(local().getPaymentStatus()).isEqualTo("approved");
        assertThat(users.findByEmail(email).orElseThrow().getStatusAcesso()).isEqualTo(StatusAcesso.ATIVO);
        assertThat(receive("subscription_preapproval", contract, "first")).isEqualTo(id);
        processor.process(id);
        assertThat(deliveries.count()).isEqualTo(1);
        verify(client, times(1)).request("GET", "/preapproval/" + contract, null);
        // A different delivery for the same resource must not be permanently deduplicated.
        notify("subscription_preapproval", contract, "second");
        assertThat(deliveries.count()).isEqualTo(2);
        assertThat(access.findByUsuarioEmail(email).orElseThrow().getDataVencimento()).isEqualTo(today.plusMonths(1).minusDays(1));
    }

    @Test void pendingAndRejectedPaymentsNeverActivateAndPreserveTrial() throws Exception {
        provider("pending", "pending", today, 99);
        notify("subscription_authorized_payment", "202", "pending");
        assertThat(local().getProviderStatus()).isEqualTo("pending");
        assertThat(local().getPaymentStatus()).isEqualTo("pending");
        assertThat(access.findByUsuarioEmail(email)).isEmpty();
        provider("authorized", "rejected", today, 99);
        notify("payment", "101", "rejected");
        assertThat(local().getPaymentStatus()).isEqualTo("rejected");
        assertThat(access.findByUsuarioEmail(email)).isEmpty();
        assertThat(users.findByEmail(email).orElseThrow().getTipoPlano()).isEqualTo(TipoPlano.EXPERIMENTAL);
    }

    @Test void pauseReactivateAndCancelPreserveConfirmedPaidPeriod() throws Exception {
        for (String state : List.of("authorized", "paused", "authorized", "cancelled")) {
            provider(state, "approved", today, 99);
            notify("subscription_preapproval", contract, UUID.randomUUID().toString());
            assertThat(local().getProviderStatus()).isEqualTo(state);
            assertThat(access.findByUsuarioEmail(email).orElseThrow().getStatus()).isEqualTo("ATIVO");
            assertThat(local().getPaidUntil()).isEqualTo(today.plusMonths(1).minusDays(1));
        }
        // A late notification cannot restore an older state from its payload.
        notify("subscription_preapproval", contract, "late-authorized");
        assertThat(local().getProviderStatus()).isEqualTo("cancelled");
    }

    @Test void failedApiCallRollsBackAndSurvivesWorkerRestart() throws Exception {
        Long id = receive("subscription_preapproval", contract, "retry");
        when(client.request("GET", "/v1/payments/101", null))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "simulated private provider failure"));
        new MercadoPagoWebhookWorker(deliveries, processor).poll();
        var failed = deliveries.findById(id).orElseThrow();
        assertThat(failed.getStatus()).isEqualTo("PENDING"); assertThat(failed.getAttempts()).isEqualTo(1);
        assertThat(failed.getFailureCode()).isEqualTo("RECONCILIATION_FAILED");
        assertThat(local().getPaymentStatus()).isEqualTo("none"); assertThat(access.findByUsuarioEmail(email)).isEmpty();
        failed.setNextAttemptAt(Instant.now().minusSeconds(1)); deliveries.saveAndFlush(failed);
        reset(client); provider("authorized", "approved", today, 99);
        new MercadoPagoWebhookWorker(deliveries, processor).poll();
        assertThat(deliveries.findById(id).orElseThrow().getStatus()).isEqualTo("DONE");
        assertThat(deliveries.findById(id).orElseThrow().getAttempts()).isEqualTo(2);
        assertThat(access.findByUsuarioEmail(email).orElseThrow().getStatus()).isEqualTo("ATIVO");
    }

    @Test void notificationBeforeCheckoutResponseRecoversByTrustedReference() throws Exception {
        var local = local(); local.setPreapprovalId(null); subscriptions.saveAndFlush(local);
        notify("subscription_preapproval", contract, "early");
        assertThat(local().getPreapprovalId()).isEqualTo(contract);
        assertThat(local().getPaymentStatus()).isEqualTo("approved");
        verify(client, never()).request(eq("POST"), anyString(), any());
    }

    @Test void anotherCollectorCannotActivateSubscription() throws Exception {
        provider("authorized", "approved", today, 888);
        Long id = receive("payment", "101", "wrong-collector");
        assertThatThrownBy(() -> processor.process(id)).isInstanceOf(ResponseStatusException.class);
        assertThat(deliveries.findById(id).orElseThrow().getStatus()).isEqualTo("PENDING");
        assertThat(local().getLastSyncedAt()).isNull(); assertThat(access.findByUsuarioEmail(email)).isEmpty();
    }

    @Test void refundedAndChargedBackPaymentsRemoveUnpaidEntitlement() throws Exception {
        notify("payment", "101", "paid");
        provider("authorized", "refunded", today, 99);
        notify("payment", "101", "refund");
        assertThat(local().getPaymentStatus()).isEqualTo("refunded");
        assertThat(users.findByEmail(email).orElseThrow().getStatusAcesso()).isEqualTo(StatusAcesso.INATIVO);
        provider("authorized", "charged_back", today, 99);
        notify("payment", "101", "dispute");
        assertThat(local().getPaymentStatus()).isEqualTo("charged_back");
        assertThat(access.findByUsuarioEmail(email).orElseThrow().getStatus()).isEqualTo("VENCIDO");
    }

    @Test void futureApprovedInvoiceDoesNotGrantAccessEarly() throws Exception {
        provider("authorized", "approved", today.plusMonths(1), 99);
        notify("subscription_preapproval", contract, "future");
        assertThat(local().getPaidUntil()).isNull(); assertThat(access.findByUsuarioEmail(email)).isEmpty();
    }

    @Test void missingPaymentLinkIsRetriedInsteadOfSilentlyDiscarded() throws Exception {
        when(client.request("GET", "/authorized_payments/search?payment_id=101&limit=100&offset=0", null))
                .thenReturn(json.readTree("{\"results\":[],\"paging\":{\"total\":0}}"));
        Long id = receive("payment", "101", "missing-link");
        new MercadoPagoWebhookWorker(deliveries, processor).poll();
        assertThat(deliveries.findById(id).orElseThrow().getStatus()).isEqualTo("PENDING");
        assertThat(access.findByUsuarioEmail(email)).isEmpty();
        verify(client).request("GET", "/v1/payments/101", null);
    }

    @Test void simultaneousProcessingOfOneDeliveryCommitsOnlyOnce() throws Exception {
        Long id = receive("subscription_preapproval", contract, "parallel");
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> processor.process(id));
            var b = executor.submit(() -> processor.process(id));
            a.get(15, TimeUnit.SECONDS); b.get(15, TimeUnit.SECONDS);
            assertThat(deliveries.findById(id).orElseThrow().getAttempts()).isEqualTo(1);
            verify(client, times(1)).request("GET", "/preapproval/" + contract, null);
        } finally { executor.shutdownNow(); }
    }

    @Test void simultaneousDeliveryInsertionIsDeduplicatedByDatabase() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> inbox.accept("payment", "101", "same-request", "1700000000"));
            var b = executor.submit(() -> inbox.accept("payment", "101", "same-request", "1700000000"));
            a.get(15, TimeUnit.SECONDS); b.get(15, TimeUnit.SECONDS);
            assertThat(deliveries.count()).isEqualTo(1);
        } finally { executor.shutdownNow(); }
    }

    @Test void failedDeliveryStopsAfterBoundedRetriesAndRetainsAudit() throws Exception {
        Long id = receive("subscription_preapproval", contract, "exhausted");
        for (int i = 0; i < 12; i++) {
            var delivery = deliveries.findById(id).orElseThrow();
            delivery.setNextAttemptAt(Instant.now().minusSeconds(1)); deliveries.saveAndFlush(delivery);
            processor.retry(id);
        }
        var failed = deliveries.findById(id).orElseThrow();
        assertThat(failed.getStatus()).isEqualTo("FAILED"); assertThat(failed.getAttempts()).isEqualTo(12);
        processor.process(id); verifyNoInteractions(client);
    }

    @Test void unauthenticatedMismatchedOversizedAndAmbiguousNotificationsAreRejected() throws Exception {
        var route = "/api/payments/webhook";
        mvc.perform(post(route).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post(route).queryParam("data.id", contract).contentType("application/json")
                .header("x-request-id", "valid").header("x-signature", signature(contract, "valid"))
                .content("{\"type\":\"payment\",\"data\":{\"id\":\"other\"}}")).andExpect(status().isBadRequest());
        mvc.perform(post(route).queryParam("data.id", contract).contentType("application/json")
                .header("x-request-id", "valid").header("x-signature", signature(contract, "valid"))
                .content("x".repeat(17000))).andExpect(status().isPayloadTooLarge());
        mvc.perform(post(route).queryParam("data.id", contract, "other").contentType("application/json")
                .header("x-request-id", "valid").header("x-signature", signature(contract, "valid"))
                .content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post(route).queryParam("data.id", contract).contentType("application/json")
                .header("x-request-id", "valid", "other").header("x-signature", signature(contract, "valid"))
                .content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post(route).queryParam("data.id", contract).contentType("application/json")
                .header("x-request-id", "valid").header("x-signature", signature(contract, "valid"))
                .content("{\"type\":\"payment\",\"type\":\"subscription_preapproval\"}")).andExpect(status().isBadRequest());
        assertThat(deliveries.count()).isZero(); verifyNoInteractions(client);
    }

    @Test void databaseFailureReturns503WithoutExposingInternalError() throws Exception {
        var unavailable = mock(MercadoPagoWebhookInbox.class);
        doThrow(new IllegalStateException("private database secret")).when(unavailable).accept(anyString(), anyString(), anyString(), anyString());
        var controller = MockMvcBuilders.standaloneSetup(new MercadoPagoWebhookController(new MercadoPagoWebhookSignature(SECRET), unavailable)).build();
        var result = controller.perform(post("/api/payments/webhook").queryParam("data.id", "101").contentType("application/json")
                .header("x-request-id", "db").header("x-signature", signature("101", "db"))
                .content("{\"type\":\"payment\",\"data\":{\"id\":101}}"))
                .andExpect(status().isServiceUnavailable()).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("private", "secret");
    }

    @Test void invoiceNotYetSearchableIsRetriedWithoutRevokingExistingAccess() throws Exception {
        notify("payment", "101", "initial");
        when(client.request("GET", "/authorized_payments/search?preapproval_id=" + contract + "&limit=100&offset=0", null))
                .thenReturn(json.readTree("{\"results\":[],\"paging\":{\"total\":0}}"));
        Long id = receive("subscription_authorized_payment", "202", "eventual-consistency");
        assertThatThrownBy(() -> processor.process(id)).isInstanceOf(ResponseStatusException.class);
        assertThat(access.findByUsuarioEmail(email).orElseThrow().getStatus()).isEqualTo("ATIVO");
        assertThat(local().getPaymentStatus()).isEqualTo("approved");
    }

    @Test void renewalExtendsOnlyToItsCycleAndDeclinePreservesPreviouslyPaidDays() throws Exception {
        provider("authorized", "approved", today.minusDays(10), 99);
        notify("payment", "101", "first-cycle");
        LocalDate initialEnd = today.minusDays(10).plusMonths(1).minusDays(1);
        JsonNode oldInvoice = json.readTree("""
                {"id":202,"preapproval_id":"%s","debit_date":"%sT12:00:00-03:00","payment":{"id":101,"status":"approved"}}
                """.formatted(contract, today.minusDays(10)));
        JsonNode failedInvoice = json.readTree("""
                {"id":203,"preapproval_id":"%s","debit_date":"%sT12:00:00-03:00","payment":{"id":102,"status":"rejected"}}
                """.formatted(contract, today));
        var page = json.createObjectNode(); page.set("results", json.createArrayNode().add(failedInvoice).add(oldInvoice));
        page.set("paging", json.createObjectNode().put("total", 2));
        when(client.request("GET", "/authorized_payments/search?preapproval_id=" + contract + "&limit=100&offset=0", null)).thenReturn(page);
        when(client.request("GET", "/v1/payments/102", null)).thenReturn(json.readTree("""
                {"id":102,"collector_id":99,"status":"rejected","transaction_amount":149.90,"currency_id":"BRL","transaction_amount_refunded":0}
                """));
        notify("subscription_preapproval", contract, "declined-renewal");
        assertThat(local().getPaymentStatus()).isEqualTo("rejected");
        assertThat(local().getPaidUntil()).isEqualTo(initialEnd);
        assertThat(access.findByUsuarioEmail(email).orElseThrow().getStatus()).isEqualTo("ATIVO");
        when(client.request("GET", "/v1/payments/102", null)).thenReturn(json.readTree("""
                {"id":102,"collector_id":99,"status":"approved","transaction_amount":149.90,"currency_id":"BRL","transaction_amount_refunded":0}
                """));
        notify("subscription_preapproval", contract, "approved-renewal");
        notify("subscription_preapproval", contract, "duplicate-renewal");
        assertThat(local().getPaidUntil()).isEqualTo(today.plusMonths(1).minusDays(1));
    }

    @Test void wrongReferenceAndWrongPaymentAmountCannotMutateAccount() throws Exception {
        JsonNode wrong = json.readTree("""
                {"id":"%s","external_reference":"another-account","status":"authorized","collector_id":99,
                 "auto_recurring":{"frequency":1,"frequency_type":"months","currency_id":"BRL","transaction_amount":149.90}}
                """.formatted(contract));
        when(client.request("GET", "/preapproval/" + contract, null)).thenReturn(wrong);
        Long id = receive("subscription_preapproval", contract, "wrong-reference");
        assertThatThrownBy(() -> processor.process(id)).isInstanceOf(ResponseStatusException.class);
        assertThat(access.findByUsuarioEmail(email)).isEmpty();
        provider("authorized", "approved", today, 99);
        when(client.request("GET", "/v1/payments/101", null)).thenReturn(json.readTree("""
                {"id":101,"collector_id":99,"status":"approved","transaction_amount":0.01,"currency_id":"BRL","transaction_amount_refunded":0}
                """));
        assertThatThrownBy(() -> processor.process(id)).isInstanceOf(ResponseStatusException.class);
        assertThat(local().getPaymentStatus()).isEqualTo("none");
    }
}
