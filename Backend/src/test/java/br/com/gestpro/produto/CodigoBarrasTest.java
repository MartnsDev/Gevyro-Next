package br.com.gestpro.produto;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CodigoBarrasTest {
    @Test void preservaZerosEAlfanumericos() {
        assertThat(CodigoBarras.normalizar(" 0012345678905 ")).isEqualTo("0012345678905");
        assertThat(CodigoBarras.normalizar("  LOJA-A01 ")).isEqualTo("LOJA-A01");
    }

    @Test void codigoVazioViraNulo() {
        assertThat(CodigoBarras.normalizar(null)).isNull();
        assertThat(CodigoBarras.normalizar("   ")).isNull();
    }
}
