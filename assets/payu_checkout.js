/**
 * Ocayur / Panchved - PayU Client-Side Payment Gateway Connector
 * 
 * Securely communicates with backend API to initialize PayU transaction,
 * build signed hash parameters, and auto-submit to PayU Hosted Checkout.
 */
window.PayUCheckout = {
  /**
   * Process PayU payment
   * @param {Object} payload 
   * @param {Function} onFallback 
   */
  async processPayment(payload, onFallback = null) {
    const apiEndpoint = (window.location.pathname.includes('/panchved/') && !window.location.pathname.includes('panchved-patient'))
      ? '../api/payu_initiate.php'
      : '../api/payu_initiate.php';

    try {
      // Pass client browser origin so backend configures exact callback URLs
      payload.origin_url = window.location.origin;
      payload.client_origin = window.location.origin;

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const err = new Error(data?.message || 'Payment initiation failed.');
        err.data = data;
        throw err;
      }

      // 1. If PayU credentials are set in App Service variables, auto-submit to PayU Gateway
      if (data && data.payu_configured && data.action_url && data.params) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.action_url;
        form.style.display = 'none';

        for (const [key, value] of Object.entries(data.params)) {
          if (value !== undefined && value !== null) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value;
            form.appendChild(input);
          }
        }

        document.body.appendChild(form);
        form.submit();
        return { redirected: true, data };
      }

      // 2. If PayU credentials are NOT yet set in App Service variables:
      if (data && data.payu_configured === false) {
        console.info('PayU Notice: Test credentials pending in App Service variables. Executing fallback flow:', data);
        if (typeof onFallback === 'function') {
          return await onFallback(data);
        }
        throw new Error(data.message || 'PayU credentials not yet configured.');
      }

      return data;
    } catch (err) {
      console.error('PayU Checkout Error:', err);
      throw err;
    }
  }
};
