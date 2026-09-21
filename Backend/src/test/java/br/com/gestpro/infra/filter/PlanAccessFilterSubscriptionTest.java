package br.com.gestpro.infra.filter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.assertj.core.api.Assertions.*;

class PlanAccessFilterSubscriptionTest {
    @Test void expiredPlanCanReachSubscriptionManagementButNotOtherRoutes() {
        var filter = new PlanAccessFilter();
        for (String path : new String[] {"/api/subscriptions/abc123", "/api/subscriptions/abc123/lifecycle"}) {
            var request = new MockHttpServletRequest(); request.setServletPath(path);
            assertThat(filter.shouldNotFilter(request)).isTrue();
        }
        for (String path : new String[] {"/api/subscriptions", "/api/subscriptions/abc123/admin", "/api/produtos"}) {
            var request = new MockHttpServletRequest(); request.setServletPath(path);
            assertThat(filter.shouldNotFilter(request)).isFalse();
        }
    }
}
