package br.com.gestpro.plano.mercadopago;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.SmartLifecycle;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Component;
import java.time.Duration;
import java.time.Instant;

@Slf4j @Component
@ConditionalOnExpression("'${billing.provider:mercadopago}' == 'mercadopago' && ${mercadopago.webhooks.worker-enabled:true}")
public class MercadoPagoWebhookWorker implements SmartLifecycle {
    private final MercadoPagoWebhookDeliveryRepository repository;
    private final MercadoPagoWebhookProcessor processor;
    private final long pollDelay;
    private ThreadPoolTaskScheduler scheduler;
    private volatile boolean running;

    @Autowired
    public MercadoPagoWebhookWorker(MercadoPagoWebhookDeliveryRepository repository,
            MercadoPagoWebhookProcessor processor, @Value("${mercadopago.webhooks.poll-delay-ms:5000}") long pollDelay) {
        if (pollDelay < 100) throw new IllegalArgumentException("O intervalo do worker deve ser de pelo menos 100 ms.");
        this.repository = repository; this.processor = processor; this.pollDelay = pollDelay;
    }
    MercadoPagoWebhookWorker(MercadoPagoWebhookDeliveryRepository repository, MercadoPagoWebhookProcessor processor) {
        this(repository, processor, 5000);
    }

    @Override public synchronized void start() {
        if (running) return;
        // Dedicated scheduler: provider latency cannot block fiscal/checkout-independent jobs.
        scheduler = new ThreadPoolTaskScheduler(); scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("mercadopago-webhooks-"); scheduler.setAwaitTerminationSeconds(25);
        scheduler.setErrorHandler(failure -> log.error("Mercado Pago: worker temporariamente indisponível; fila preservada"));
        scheduler.initialize(); running = true;
        scheduler.scheduleWithFixedDelay(this::poll, Duration.ofMillis(pollDelay));
    }
    @Override public synchronized void stop() {
        running = false;
        if (scheduler != null) { scheduler.shutdown(); scheduler = null; }
    }
    @Override public boolean isRunning() { return running; }

    public void poll() {
        for (Long id : repository.findDue(Instant.now(), PageRequest.of(0, 10))) {
            try { processor.process(id); }
            catch (RuntimeException failure) {
                String state = processor.retry(id);
                log.warn("Mercado Pago: entrega {} com falha de reconciliação; estado={}", id, state);
            }
        }
    }
}
