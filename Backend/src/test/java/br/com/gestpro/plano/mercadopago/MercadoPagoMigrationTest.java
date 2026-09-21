package br.com.gestpro.plano.mercadopago;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class MercadoPagoMigrationTest {
    @Test void mysqlCompatibleMigrationEnforcesOwnerAndReferenceUniqueness() throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL", "sa", "")) {
            var sql = connection.createStatement();
            sql.execute("CREATE TABLE usuarios (id BIGINT PRIMARY KEY)");
            sql.execute("INSERT INTO usuarios VALUES (1), (2)");
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V18__mercado_pago_subscriptions.sql"));
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V19__mercado_pago_webhook_deliveries.sql"));
            sql.execute("INSERT INTO mercado_pago_subscriptions (usuario_id, external_reference, plano) VALUES (1, 'first', 'PRO')");
            assertThatThrownBy(() -> sql.execute("INSERT INTO mercado_pago_subscriptions (usuario_id, external_reference, plano) VALUES (1, 'second', 'PRO')"))
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> sql.execute("INSERT INTO mercado_pago_subscriptions (usuario_id, external_reference, plano) VALUES (2, 'first', 'PRO')"))
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> sql.execute("INSERT INTO mercado_pago_subscriptions (usuario_id, external_reference, plano) VALUES (999, 'third', 'PRO')"))
                    .isInstanceOf(SQLException.class);
            try (var rows = sql.executeQuery("SELECT id, preapproval_id FROM mercado_pago_subscriptions")) {
                assertThat(rows.next()).isTrue(); assertThat(rows.getLong(1)).isPositive(); assertThat(rows.getString(2)).isNull();
            }
        }
    }
}
