package br.com.gestpro.plano.mercadopago;

import br.com.gestpro.auth.model.Usuario;
import br.com.gestpro.auth.repository.UsuarioRepository;
import br.com.gestpro.plano.stripe.PlanoTipo;
import br.com.gestpro.plano.stripe.repository.AssinaturaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(showSql = false)
@ActiveProfiles("test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class MercadoPagoCheckoutPersistenceTest {
    @Autowired UsuarioRepository usuarios;
    @Autowired MercadoPagoSubscriptionRepository subscriptions;
    @Autowired AssinaturaRepository assinaturas;
    @Autowired PlatformTransactionManager transactions;
    MercadoPagoClient client;
    MercadoPagoService service;
    final ObjectMapper mapper = new ObjectMapper();
    String email;

    @BeforeEach void setup() throws Exception {
        client = mock(MercadoPagoClient.class, withSettings().mockMaker(org.mockito.MockMakers.SUBCLASS));
        service = new MercadoPagoService(client, subscriptions, assinaturas, usuarios, "http://localhost:3000", transactions);
        email = UUID.randomUUID() + "@example.com";
        Usuario usuario = new Usuario(); usuario.setEmail(email); usuario.setNome("Comprador de teste");
        usuarios.saveAndFlush(usuario);
        when(client.request(eq("GET"), startsWith("/preapproval/search?"), isNull()))
                .thenReturn(mapper.readTree("{\"results\":[],\"paging\":{\"total\":0}}"));
    }

    JsonNode remote(String reference, String id, String amount) throws Exception {
        return mapper.readTree("""
                {"id":"%s","status":"pending","external_reference":"%s",
                 "init_point":"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=%s",
                 "auto_recurring":{"frequency":1,"frequency_type":"months","currency_id":"BRL","transaction_amount":%s}}
                """.formatted(id, reference, id, amount));
    }

    @Test void timeoutLeavesCommittedReservationAndRetryNeverCreatesAgain() {
        when(client.request(eq("POST"), eq("/preapproval"), any())).thenAnswer(invocation -> {
            var saved = subscriptions.findByUsuarioEmail(email).orElseThrow();
            assertThat(saved.getExternalReference()).startsWith("gevyro-");
            assertThat(saved.getPreapprovalId()).isNull();
            assertThat(((Map<?, ?>) invocation.getArgument(2)).get("external_reference")).isEqualTo(saved.getExternalReference());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Timeout simulado");
        });
        assertThatThrownBy(() -> service.checkout(email, PlanoTipo.PRO)).isInstanceOf(ResponseStatusException.class);
        String reference = subscriptions.findByUsuarioEmail(email).orElseThrow().getExternalReference();
        assertThatThrownBy(() -> service.checkout(email, PlanoTipo.PRO)).hasMessageContaining("409");
        assertThat(subscriptions.findByUsuarioEmail(email).orElseThrow().getExternalReference()).isEqualTo(reference);
        verify(client, times(1)).request(eq("POST"), eq("/preapproval"), any());
    }

    @Test void recoversCommittedAttemptAfterRestartWithoutAnotherPost() throws Exception {
        when(client.request(eq("POST"), eq("/preapproval"), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Timeout simulado"));
        assertThatThrownBy(() -> service.checkout(email, PlanoTipo.PRO)).isInstanceOf(ResponseStatusException.class);
        String reference = subscriptions.findByUsuarioEmail(email).orElseThrow().getExternalReference();
        JsonNode recovered = remote(reference, "recovered", "149.90");
        when(client.request(eq("GET"), startsWith("/preapproval/search?"), isNull()))
                .thenReturn(mapper.createObjectNode().set("results", mapper.createArrayNode().add(recovered)));
        when(client.request("GET", "/preapproval/recovered", null)).thenReturn(recovered);
        var restarted = new MercadoPagoService(client, subscriptions, assinaturas, usuarios, "http://localhost:3000", transactions);
        assertThat(restarted.checkout(email, PlanoTipo.PRO)).contains("preapproval_id=recovered");
        assertThat(subscriptions.findByUsuarioEmail(email).orElseThrow().getPreapprovalId()).isEqualTo("recovered");
        verify(client, times(1)).request(eq("POST"), eq("/preapproval"), any());
    }

    @Test void simultaneousClickCannotPostWhileFirstRequestIsInFlight() throws Exception {
        CountDownLatch posting = new CountDownLatch(1), finish = new CountDownLatch(1);
        when(client.request(eq("POST"), eq("/preapproval"), any())).thenAnswer(invocation -> {
            posting.countDown();
            if (!finish.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out");
            return remote(((Map<?, ?>) invocation.getArgument(2)).get("external_reference").toString(), "created", "149.90");
        });
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<String> first = executor.submit(() -> service.checkout(email, PlanoTipo.PRO));
            assertThat(posting.await(10, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> service.checkout(email, PlanoTipo.PRO)).hasMessageContaining("409");
            finish.countDown();
            assertThat(first.get(10, TimeUnit.SECONDS)).contains("preapproval_id=created");
            verify(client, times(1)).request(eq("POST"), eq("/preapproval"), any());
        } finally { finish.countDown(); executor.shutdownNow(); }
    }

    @Test void mismatchedRecoveredAmountCannotAttachToBuyer() throws Exception {
        when(client.request(eq("POST"), eq("/preapproval"), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Timeout simulado"));
        assertThatThrownBy(() -> service.checkout(email, PlanoTipo.PRO)).isInstanceOf(ResponseStatusException.class);
        String reference = subscriptions.findByUsuarioEmail(email).orElseThrow().getExternalReference();
        JsonNode wrong = remote(reference, "wrong", "0.01");
        when(client.request(eq("GET"), startsWith("/preapproval/search?"), isNull()))
                .thenReturn(mapper.createObjectNode().set("results", mapper.createArrayNode().add(wrong)));
        when(client.request("GET", "/preapproval/wrong", null)).thenReturn(wrong);
        assertThatThrownBy(() -> service.checkout(email, PlanoTipo.PRO)).hasMessageContaining("502");
        assertThat(subscriptions.findByUsuarioEmail(email).orElseThrow().getPreapprovalId()).isNull();
        verify(client, times(1)).request(eq("POST"), eq("/preapproval"), any());
    }

    @Test void unresolvedReservationIsVisibleAsProcessingAndBlocksPlanChange() {
        when(client.request(eq("POST"), eq("/preapproval"), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Timeout simulado"));
        assertThatThrownBy(() -> service.checkout(email, PlanoTipo.PRO)).isInstanceOf(ResponseStatusException.class);
        var result = new TransactionTemplate(transactions).execute(tx -> service.status(email, null));
        assertThat(result).containsEntry("status", "processing").containsEntry("paid", false);
        assertThatThrownBy(() -> service.checkout(email, PlanoTipo.PREMIUM)).hasMessageContaining("409");
        verify(client, times(1)).request(eq("POST"), eq("/preapproval"), any());
    }
}
