/**
 * Panchved Patient Portal - Billing Engine
 * Dynamically fetches and renders payment records, active package details,
 * and itemized invoice receipts directly from MySQL database schema.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Drawer Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Active Package Elements
  const activePkgTitle = document.getElementById('activePkgTitle');
  const activePkgDesc = document.getElementById('activePkgDesc');
  const activePkgPrice = document.getElementById('activePkgPrice');
  const activePkgDuration = document.getElementById('activePkgDuration');

  // Search & Table Elements
  const billingSearchInput = document.getElementById('billingSearchInput');
  const billingTableBody = document.getElementById('billingTableBody');

  // Pagination Elements
  const btnBillingPrev = document.getElementById('btnBillingPrev');
  const btnBillingNext = document.getElementById('btnBillingNext');
  const billingPageLabel = document.getElementById('billingPageLabel');
  const billingCountText = document.getElementById('billingCountText');

  // Receipt Modal Elements (Screen 2)
  const receiptModal = document.getElementById('receiptModal');
  const closeReceiptModalBtn = document.getElementById('closeReceiptModalBtn');
  const btnPrintReceipt = document.getElementById('btnPrintReceipt');
  const receiptBilledName = document.getElementById('receiptBilledName');
  const receiptBilledGender = document.getElementById('receiptBilledGender');
  const receiptBilledAge = document.getElementById('receiptBilledAge');
  const receiptNumber = document.getElementById('receiptNumber');
  const receiptInvoiceDate = document.getElementById('receiptInvoiceDate');
  const receiptVisitDate = document.getElementById('receiptVisitDate');
  const receiptItemsTableBody = document.getElementById('receiptItemsTableBody');
  const receiptSubtotal = document.getElementById('receiptSubtotal');
  const receiptDiscount = document.getElementById('receiptDiscount');
  const receiptGrandTotal = document.getElementById('receiptGrandTotal');
  const receiptAmountWords = document.getElementById('receiptAmountWords');

  // State
  let loadedPayments = [];
  let filteredPayments = [];
  let currentBillingPage = 1;
  const recordsPerPage = 5;

  // Helper: Toast Message
  const showToast = (message, isError = false) => {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.style.background = isError ? '#ef4444' : '#1e293b';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  };

  // Mobile Menu Drawer Toggle
  const toggleMobileSidebar = (open) => {
    if (!dashboardSidebar || !sidebarOverlay) return;
    const shouldOpen = open !== undefined ? open : !dashboardSidebar.classList.contains('open');
    if (shouldOpen) {
      dashboardSidebar.classList.add('open');
      sidebarOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      dashboardSidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => toggleMobileSidebar());
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      toggleMobileSidebar(false);
      closeReceiptModal();
    });
  }

  // Synchronize authenticated user header details
  const applyUserHeader = (user, patient) => {
    const fullName = patient?.full_name || user?.full_name || 'Rahul Sharma';
    const patientId = patient?.patient_id || ('P00' + (user?.id || 1));

    if (fullName) {
      const userName = document.getElementById('userName');
      if (userName) userName.textContent = fullName;
      const userGreeting = document.getElementById('userGreeting');
      if (userGreeting) userGreeting.textContent = `Good Morning ${fullName}!`;
      const upc = document.getElementById('userProfileCard');
      if (upc) upc.setAttribute('aria-label', `User profile: ${fullName}, Patient ID ${patientId}`);
      const mua = document.querySelector('.mobile-user-avatar');
      if (mua) mua.setAttribute('title', `${fullName} (${patientId})`);
    }
    if (patientId) {
      const patientIdEl = document.getElementById('patientId');
      if (patientIdEl) patientIdEl.textContent = patientId;
    }
  };

  let cachedPhone = '';
  let cachedPatientId = '';
  try {
    const storedUser = JSON.parse(localStorage.getItem('panchved_user') || 'null');
    const storedPatient = JSON.parse(localStorage.getItem('panchved_patient') || 'null');
    if (storedUser || storedPatient) {
      applyUserHeader(storedUser, storedPatient);
      cachedPhone = storedPatient?.phone_number || storedUser?.phone_number || '';
      cachedPatientId = storedPatient?.patient_id || '';
    }
  } catch (err) {}

  const syncHeaderFromDB = async () => {
    try {
      const params = new URLSearchParams();
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);
      const res = await fetch('../api/profile.php' + (params.toString() ? `?${params.toString()}` : ''));
      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.patient || data.user)) {
          applyUserHeader(data.user, data.patient);
        }
      }
    } catch (e) {}
  };
  syncHeaderFromDB();

  // Logout Action
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await fetch('../api/logout.php', { method: 'POST' }); } catch (err) {}
      try {
        localStorage.removeItem('panchved_user');
        localStorage.removeItem('panchved_patient');
        localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
      showToast('Logged out successfully.');
      setTimeout(() => { window.location.href = '../index.html'; }, 350);
    });
  }

  // ========================================================
  // 1. DYNAMIC PAYMENT TABLE & PAGINATION RENDERING
  // ========================================================
  const renderBillingTable = () => {
    if (!billingTableBody) return;

    if (!Array.isArray(filteredPayments) || filteredPayments.length === 0) {
      billingTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 36px 16px; color: #6b7280; font-size: 14px;">
            No payment history records found matching your search.
          </td>
        </tr>
      `;
      if (billingCountText) billingCountText.textContent = 'Showing 0 items';
      if (billingPageLabel) billingPageLabel.textContent = '0 of 0';
      if (btnBillingPrev) btnBillingPrev.disabled = true;
      if (btnBillingNext) btnBillingNext.disabled = true;
      return;
    }

    const totalRecords = filteredPayments.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / recordsPerPage));

    if (currentBillingPage > totalPages) {
      currentBillingPage = totalPages;
    }

    const startIndex = (currentBillingPage - 1) * recordsPerPage;
    const endIndex = Math.min(startIndex + recordsPerPage, totalRecords);
    const currentRows = filteredPayments.slice(startIndex, endIndex);

    billingTableBody.innerHTML = currentRows.map(row => {
      const bId = row.billing_id || ('ABC-' + String(row.id).padStart(3, '0'));
      const rDate = row.date || '2 Sept 2026';
      const rDur = row.duration || '3 months';
      const rDoc = row.doctor_name || 'Dr. Rohit Mishra';
      const rPkg = row.package_name || 'Stress & Sleep Balance';
      const rNo = row.receipt_no || ('EK-' + String(row.id).padStart(3, '0'));
      const rPat = row.patient_name || 'Rahul Sharma';
      const rGen = row.patient_gender || 'Male';
      const rAge = row.patient_age || '34 years';
      const rTime = row.time || '4:00 PM';
      const rSub = row.subtotal || '₹2,700';
      const rDisc = row.discount || '₹500';
      const rTot = row.total || '₹2,200';
      const rWords = row.amount_words || 'Two Thousand Two Hundred Rupees Only';

      return `
        <tr>
          <td class="table-id-cell">${bId}</td>
          <td class="table-date-cell">${rDate}</td>
          <td class="table-duration-cell">${rDur}</td>
          <td class="table-doctor-cell">${rDoc}</td>
          <td>${rPkg}</td>
          <td class="table-action-cell">
            <button 
              type="button" 
              class="btn-download-receipt" 
              data-id="${row.id}" 
              data-billing-id="${bId}"
              data-date="${rDate}" 
              data-time="${rTime}"
              data-patient="${rPat.replace(/"/g, '&quot;')}"
              data-gender="${rGen}"
              data-age="${rAge}"
              data-receipt="${rNo}"
              data-package="${rPkg.replace(/"/g, '&quot;')}"
              data-doctor="${rDoc.replace(/"/g, '&quot;')}"
              data-subtotal="${rSub}"
              data-discount="${rDisc}"
              data-total="${rTot}"
              data-words="${rWords.replace(/"/g, '&quot;')}"
              title="Download / View Receipt"
            >
              <span>Download Reciept</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Update Pagination Labels & Controls
    if (billingCountText) {
      billingCountText.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalRecords} items`;
    }
    if (billingPageLabel) {
      billingPageLabel.textContent = `${currentBillingPage} of ${totalPages}`;
    }
    if (btnBillingPrev) {
      btnBillingPrev.disabled = currentBillingPage <= 1;
    }
    if (btnBillingNext) {
      btnBillingNext.disabled = currentBillingPage >= totalPages;
    }

    bindDownloadReceiptEvents();
  };

  // ========================================================
  // 2. RECEIPT MODAL (Screen 2) - Dynamic DB Fetch
  // ========================================================
  const populateReceiptUI = (receipt) => {
    if (!receipt) return;
    if (receiptBilledName) receiptBilledName.textContent = receipt.billed_to?.name || receipt.patient_name || '--';
    if (receiptBilledGender) receiptBilledGender.textContent = receipt.billed_to?.gender || receipt.patient_gender || '--';
    if (receiptBilledAge) receiptBilledAge.textContent = receipt.billed_to?.age || receipt.patient_age || '--';
    if (receiptNumber) receiptNumber.textContent = receipt.receipt_no || '--';
    if (receiptInvoiceDate) receiptInvoiceDate.textContent = receipt.invoice_date || receipt.date || '--';
    if (receiptVisitDate) receiptVisitDate.textContent = receipt.visit_date || (receipt.date ? `${receipt.date} ${receipt.time || ''}` : '--');

    if (receiptSubtotal) receiptSubtotal.textContent = receipt.subtotal || '₹0';
    if (receiptDiscount) receiptDiscount.textContent = receipt.discount || '₹0';
    if (receiptGrandTotal) receiptGrandTotal.textContent = receipt.grand_total || receipt.total || '₹0';
    if (receiptAmountWords) receiptAmountWords.textContent = receipt.amount_words || '--';

    // Itemized Services Table
    if (receiptItemsTableBody && Array.isArray(receipt.items)) {
      receiptItemsTableBody.innerHTML = receipt.items.map(item => `
        <tr>
          <td>${item.s_no}</td>
          <td>${item.service}</td>
          <td>${item.qty}</td>
          <td>${item.amount}</td>
          <td>${item.discount}</td>
          <td><strong>${item.total}</strong></td>
        </tr>
      `).join('');
    }
  };

  const openReceiptModal = async (btn) => {
    if (!receiptModal || !btn) return;

    const rowId = btn.getAttribute('data-id');
    const billingId = btn.getAttribute('data-billing-id') || '';
    const receiptNo = btn.getAttribute('data-receipt') || '';

    // 1. Initial immediate population from loaded row if available
    const paymentRecord = loadedPayments.find(p => String(p.id) === String(rowId));
    if (paymentRecord) {
      populateReceiptUI({
        receipt_no: paymentRecord.receipt_no,
        invoice_date: paymentRecord.date,
        visit_date: `${paymentRecord.date} ${paymentRecord.time}`,
        billed_to: {
          name: paymentRecord.patient_name,
          gender: paymentRecord.patient_gender,
          age: paymentRecord.patient_age
        },
        items: paymentRecord.items,
        subtotal: paymentRecord.subtotal,
        discount: paymentRecord.discount,
        grand_total: paymentRecord.total,
        amount_words: paymentRecord.amount_words
      });
    }

    // Open Modal
    receiptModal.classList.add('active');
    receiptModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // 2. Dynamic Fetch directly from database backend
    try {
      const params = new URLSearchParams();
      params.append('action', 'receipt_details');
      if (rowId) params.append('id', rowId);
      if (billingId) params.append('billing_id', billingId);
      if (receiptNo) params.append('receipt_no', receiptNo);
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);

      const res = await fetch(`../api/billing.php?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.receipt) {
          populateReceiptUI(data.receipt);
        }
      }
    } catch (err) {
      console.warn('Notice: Error fetching dynamic receipt data from database:', err);
    }
  };

  const closeReceiptModal = () => {
    if (!receiptModal) return;
    receiptModal.classList.remove('active');
    receiptModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const bindDownloadReceiptEvents = () => {
    const downloadButtons = document.querySelectorAll('.btn-download-receipt');
    downloadButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openReceiptModal(btn);
      });
    });
  };

  if (closeReceiptModalBtn) {
    closeReceiptModalBtn.addEventListener('click', () => closeReceiptModal());
  }

  if (receiptModal) {
    receiptModal.addEventListener('click', (e) => {
      if (e.target === receiptModal) {
        closeReceiptModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && receiptModal && receiptModal.classList.contains('active')) {
      closeReceiptModal();
    }
  });

  if (btnPrintReceipt) {
    btnPrintReceipt.addEventListener('click', () => {
      window.print();
    });
  }

  // ========================================================
  // 3. SEARCH FILTERING
  // ========================================================
  if (billingSearchInput) {
    billingSearchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      if (!term) {
        filteredPayments = [...loadedPayments];
      } else {
        filteredPayments = loadedPayments.filter(row => {
          const id = (row.billing_id || '').toLowerCase();
          const date = (row.date || '').toLowerCase();
          const dur = (row.duration || '').toLowerCase();
          const doc = (row.doctor_name || '').toLowerCase();
          const pkg = (row.package_name || '').toLowerCase();
          const pat = (row.patient_name || '').toLowerCase();
          const amt = (row.total || '').toLowerCase();
          return id.includes(term) || date.includes(term) || dur.includes(term) || doc.includes(term) || pkg.includes(term) || pat.includes(term) || amt.includes(term);
        });
      }
      currentBillingPage = 1;
      renderBillingTable();
    });
  }

  // ========================================================
  // 4. PAGINATION CONTROLS
  // ========================================================
  if (btnBillingPrev) {
    btnBillingPrev.addEventListener('click', () => {
      if (currentBillingPage > 1) {
        currentBillingPage--;
        renderBillingTable();
        showToast(`Loaded Billing Page ${currentBillingPage}`);
      }
    });
  }

  if (btnBillingNext) {
    btnBillingNext.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(filteredPayments.length / recordsPerPage));
      if (currentBillingPage < totalPages) {
        currentBillingPage++;
        renderBillingTable();
        showToast(`Loaded Billing Page ${currentBillingPage}`);
      }
    });
  }

  // ========================================================
  // 5. FETCH BILLING DATA DYNAMICALLY FROM DATABASE
  // ========================================================
  const fetchBillingDataFromDB = async () => {
    try {
      const params = new URLSearchParams();
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);

      const res = await fetch('../api/billing.php' + (params.toString() ? `?${params.toString()}` : ''));
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // A. Update Active Package Detail
          if (data.active_package) {
            const pkg = data.active_package;
            if (activePkgTitle && pkg.title) activePkgTitle.textContent = pkg.title;
            if (activePkgDesc && pkg.description) activePkgDesc.textContent = pkg.description;
            if (activePkgPrice && pkg.price_formatted) activePkgPrice.textContent = pkg.price_formatted;
            if (activePkgDuration && pkg.duration) activePkgDuration.textContent = pkg.duration;
          }

          // B. Update Payment History List
          if (Array.isArray(data.payments) && data.payments.length > 0) {
            loadedPayments = data.payments;
            filteredPayments = [...loadedPayments];
            currentBillingPage = 1;
            renderBillingTable();
          }
        }
      }
    } catch (err) {
      console.warn('Notice: Error fetching billing data from API:', err);
    }
  };

  // Initial Data Load from MySQL
  fetchBillingDataFromDB();
});
