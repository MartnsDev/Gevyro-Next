package br.com.gestpro.plano.mercadopago;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MercadoPagoWebhookWorkerTest {
    @Test void dedicatedWorkerStartsAndStopsWithApplicationLifecycle() throws Exception {
        var repository = mock(MercadoPagoWebhookDeliveryRepository.class);
        var processor = mock(MercadoPagoWebhookProcessor.class);
        CountDownLatch polled = new CountDownLatch(1);
        when(repository.findDue(any(), any())).thenAnswer(call -> { polled.countDown(); return List.of(); });
        var worker = new MercadoPagoWebhookWorker(repository, processor, 100);
        try {
            worker.start();
            assertThat(worker.isRunning()).isTrue();
            assertThat(polled.await(3, TimeUnit.SECONDS)).isTrue();
        } finally { worker.stop(); }
        assertThat(worker.isRunning()).isFalse();
        verifyNoInteractions(processor);
    }
}
