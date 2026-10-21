/**
 * Ocayur Patient Portal - Billing Engine
 * Dynamically fetches and renders payment records, active package details,
 * and itemized invoice receipts directly from MySQL database schema.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Page Loader Overlay Logic
  const pageLoader = document.getElementById('pageLoader');
  const hidePageLoader = () => {
    if (!pageLoader) return;
    pageLoader.classList.add('hidden');
    setTimeout(() => {
      pageLoader.style.display = 'none';
    }, 450);
  };
  setTimeout(hidePageLoader, 2500);

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
  const activePkgDoctor = document.getElementById('activePkgDoctor');
  const activePkgDoctorItem = document.getElementById('activePkgDoctorItem');
  const activePkgActionLink = document.getElementById('activePkgActionLink');

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
  let cachedUserObj = null;
  let cachedPatientObj = null;

  const applyUserHeader = (user, patient) => {
    cachedUserObj = user;
    cachedPatientObj = patient;
    const fullName = patient?.full_name || user?.full_name || '';
    const patientId = patient?.patient_id || (user?.id ? ('P00' + user.id) : '');

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
    const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
    const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
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
          if (data.patient?.phone_number) cachedPhone = data.patient.phone_number;
          if (data.patient?.patient_id) cachedPatientId = data.patient.patient_id;
        }
      }
    } catch (e) {}
  };
  syncHeaderFromDB();

  // Logout Modal Handlers
  const logoutBtn = document.getElementById('logoutBtn');
  const logoutModal = document.getElementById('logoutModal');
  const closeLogoutModalBtn = document.getElementById('closeLogoutModalBtn');
  const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');
  const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

  const openLogoutModal = () => {
    if (logoutModal) {
      logoutModal.classList.add('active');
      logoutModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeLogoutModal = () => {
    if (logoutModal) {
      logoutModal.classList.remove('active');
      logoutModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  };

  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openLogoutModal();
    });
  }

  if (closeLogoutModalBtn) closeLogoutModalBtn.addEventListener('click', closeLogoutModal);
  if (cancelLogoutBtn) cancelLogoutBtn.addEventListener('click', closeLogoutModal);

  if (logoutModal) {
    logoutModal.addEventListener('click', (e) => {
      if (e.target === logoutModal) closeLogoutModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && logoutModal && logoutModal.classList.contains('active')) {
      closeLogoutModal();
    }
  });

  if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener('click', async () => {
      confirmLogoutBtn.disabled = true;
      confirmLogoutBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite; margin-right: 6px;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25" stroke="currentColor"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path>
        </svg>
        <span>Logging out...</span>
      `;
      try { await fetch('../api/logout.php', { method: 'POST' }); } catch (err) {}
      try {
        localStorage.removeItem('ocayur_user'); localStorage.removeItem('panchved_user');
        localStorage.removeItem('ocayur_patient'); localStorage.removeItem('panchved_patient');
        localStorage.removeItem('ocayur_prakruti_result'); localStorage.removeItem('panchved_prakruti_result');
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
      const rDate = row.date || row.payment_date || '--';
      const rDur = row.duration || '--';
      const rDoc = row.doctor_name || '--';
      const rPkg = row.package_name || row.title || 'Consultation / Package';
      const rNo = row.receipt_no || ('EK-' + String(row.id).padStart(3, '0'));
      const rPat = row.patient_name || cachedPatientObj?.full_name || cachedUserObj?.full_name || 'Patient';
      const rGen = row.patient_gender || cachedPatientObj?.gender || '--';
      const rAge = row.patient_age || (cachedPatientObj?.age ? `${cachedPatientObj.age} years` : '--');
      const rTime = row.time || '--';
      const rSub = row.subtotal || ('₹' + (row.amount || '0'));
      const rDisc = row.discount || '₹0';
      const rTot = row.total || ('₹' + (row.amount || '0'));
      const rWords = row.amount_words || '';

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
    const paymentRecord = loadedPayments.find(p => 
      (rowId && String(p.id) === String(rowId)) ||
      (receiptNo && p.receipt_no === receiptNo) ||
      (billingId && p.billing_id === billingId)
    );

    if (paymentRecord) {
      populateReceiptUI({
        receipt_no: paymentRecord.receipt_no,
        invoice_date: paymentRecord.date,
        visit_date: paymentRecord.time ? `${paymentRecord.date} ${paymentRecord.time}` : paymentRecord.date,
        billed_to: {
          name: paymentRecord.patient_name || cachedPatientObj?.full_name || cachedUserObj?.full_name || 'Patient',
          gender: paymentRecord.patient_gender || cachedPatientObj?.gender || '--',
          age: paymentRecord.patient_age || (cachedPatientObj?.age ? `${cachedPatientObj.age} years` : '--')
        },
        items: paymentRecord.items || [
          {
            s_no: '01',
            service: paymentRecord.package_name || paymentRecord.service_type || 'Ayurveda Service',
            qty: '01',
            amount: paymentRecord.total,
            discount: paymentRecord.discount || '₹0',
            total: paymentRecord.total
          }
        ],
        subtotal: paymentRecord.subtotal || paymentRecord.total,
        discount: paymentRecord.discount || '₹0',
        grand_total: paymentRecord.total,
        amount_words: paymentRecord.amount_words
      });
    } else {
      const btnPat = btn.getAttribute('data-patient') || cachedPatientObj?.full_name || cachedUserObj?.full_name || 'Patient';
      const btnTot = btn.getAttribute('data-total') || '₹0';
      const btnSub = btn.getAttribute('data-subtotal') || btnTot;
      const btnDisc = btn.getAttribute('data-discount') || '₹0';
      const btnDate = btn.getAttribute('data-date') || '--';
      const btnTime = btn.getAttribute('data-time') || '';
      const btnPkg = btn.getAttribute('data-package') || 'Ayurveda Service';
      const btnWords = btn.getAttribute('data-words') || '';

      populateReceiptUI({
        receipt_no: receiptNo,
        invoice_date: btnDate,
        visit_date: btnTime ? `${btnDate} ${btnTime}` : btnDate,
        billed_to: {
          name: btnPat,
          gender: btn.getAttribute('data-gender') || '--',
          age: btn.getAttribute('data-age') || '--'
        },
        items: [
          {
            s_no: '01',
            service: btnPkg,
            qty: '01',
            amount: btnSub,
            discount: btnDisc === '₹0' ? '0' : btnDisc,
            total: btnTot
          }
        ],
        subtotal: btnSub,
        discount: btnDisc,
        grand_total: btnTot,
        amount_words: btnWords
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

      let res;
      try {
        res = await fetch(`../api/billing.php?${params.toString()}`);
      } catch (e) {}
      if (!res || !res.ok) {
        res = await fetch(`../api/billings.php?${params.toString()}`);
      }

      if (res && res.ok) {
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
      const origTitle = document.title;
      const receiptNoText = receiptNumber ? receiptNumber.textContent.trim() : '';
      if (receiptNoText && receiptNoText !== '--') {
        document.title = `Receipt_${receiptNoText}`;
      }
      document.body.classList.add('printing-active-receipt');
      window.print();
      setTimeout(() => {
        document.title = origTitle;
        document.body.classList.remove('printing-active-receipt');
      }, 1000);
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

      const qs = params.toString() ? `?${params.toString()}` : '';
      let res;
      try {
        res = await fetch(`../api/billing.php${qs}`);
      } catch (e) {}
      if (!res || !res.ok) {
        res = await fetch(`../api/billings.php${qs}`);
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data.success) {
          // A. Update Active Package Detail
          const pkgBanner = document.querySelector('.active-package-banner');
          if (data.active_package) {
            const pkg = data.active_package;
            if (activePkgTitle) activePkgTitle.textContent = pkg.title || 'Subscribed Package';
            if (activePkgDesc) activePkgDesc.textContent = pkg.description || 'Personalized wellness and healthcare routine.';
            if (activePkgPrice) activePkgPrice.textContent = pkg.price_formatted || (pkg.price ? `₹${pkg.price}` : '--');
            if (activePkgDuration) activePkgDuration.textContent = pkg.duration || '--';
            if (pkgDoctor && pkg.doctor_name) {
              pkgDoctor.textContent = pkg.doctor_name;
              if (activePkgDoctorItem) activePkgDoctorItem.style.display = 'inline-flex';
            }
            if (pkgBanner) pkgBanner.style.display = 'flex';
            if (activePkgActionLink) {
              activePkgActionLink.textContent = 'View Package Details';
              activePkgActionLink.href = '../packages/package.html';
              activePkgActionLink.style.display = 'inline-flex';
            }
          } else {
            if (activePkgTitle) activePkgTitle.textContent = 'No Active Package';
            if (activePkgDesc) activePkgDesc.textContent = 'You currently have no active wellness package. Visit the Packages section to explore customized programs.';
            if (pkgBanner) pkgBanner.style.display = 'none';
            if (activePkgDoctorItem) activePkgDoctorItem.style.display = 'none';
            if (activePkgActionLink) {
              activePkgActionLink.textContent = 'Explore Packages';
              activePkgActionLink.href = '../packages/package.html';
              activePkgActionLink.style.display = 'inline-flex';
            }
          }

          // B. Update Payment History List
          loadedPayments = Array.isArray(data.payments) ? data.payments : [];
          filteredPayments = [...loadedPayments];
          currentBillingPage = 1;
          renderBillingTable();
        }
      }
    } catch (err) {
      console.warn('Notice: Error fetching billing data from API:', err);
    } finally {
      hidePageLoader();
    }
  };

  // Initial Data Load from MySQL
  fetchBillingDataFromDB();
});
