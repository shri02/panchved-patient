/**
 * Ocayur Patient Portal - Unified Checkout & Payment Engine
 * Handles both Consultation/Package Booking and Workshop Registration Checkout.
 * Connected directly with PHP backend APIs.
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
  setTimeout(hidePageLoader, 350);

  // Navigation & Drawer
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Consultation / Workshop Summary Elements
  const consultDetailsHeading = document.getElementById('consultDetailsHeading');
  const checkoutDoctorName = document.getElementById('checkoutDoctorName');
  const checkoutDoctorRole = document.getElementById('checkoutDoctorRole');
  const checkoutDate = document.getElementById('checkoutDate');
  const checkoutTime = document.getElementById('checkoutTime');
  const checkoutDoctorBadgeRow = document.getElementById('checkoutDoctorBadgeRow');

  // Patient Details & Edit Form Elements
  const displayPatientName = document.getElementById('displayPatientName');
  const displayPatientEmail = document.getElementById('displayPatientEmail');
  const displayPatientPhone = document.getElementById('displayPatientPhone');
  const editDetailsBtn = document.getElementById('editDetailsBtn');
  const patientDetailsView = document.getElementById('patientDetailsView');
  const patientDetailsEditForm = document.getElementById('patientDetailsEditForm');
  const editPatientName = document.getElementById('editPatientName');
  const editPatientEmail = document.getElementById('editPatientEmail');
  const editPatientPhone = document.getElementById('editPatientPhone');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  // Payment Selection Elements
  const paymentMethodItems = document.querySelectorAll('.payment-method-item');
  const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');

  // Summary Card Elements
  const checkoutSummaryFeeLabel = document.getElementById('checkoutSummaryFeeLabel');
  const checkoutSummaryFee = document.getElementById('checkoutSummaryFee') || document.querySelector('.summary-amount-teal');
  const checkoutSummaryTotal = document.getElementById('checkoutSummaryTotal') || document.querySelector('.total-amount');

  // Success Modal Elements (Screen 5)
  const bookingSuccessModal = document.getElementById('bookingSuccessModal');
  const continueToDashboardBtn = document.getElementById('continueToDashboardBtn');
  const receiptBookingId = document.getElementById('receiptBookingId');
  const receiptWorkshopRow = document.getElementById('receiptWorkshopRow');
  const receiptWorkshopTitle = document.getElementById('receiptWorkshopTitle');
  const receiptAmount = document.getElementById('receiptAmount');
  const successServiceType = document.getElementById('successServiceType');
  const successEventDate = document.getElementById('successEventDate');
  const successPaymentAmount = document.getElementById('successPaymentAmount');

  let isWorkshopCheckout = false;
  let isPackageCheckout = false;
  let activeBookingData = null;

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
    sidebarOverlay.addEventListener('click', () => toggleMobileSidebar(false));
  }

  // Update Patient Details in the "Your Details" Section from User Profile Data
  const updateCheckoutPatientDetailsUI = (user, patient) => {
    const fullName = patient?.full_name || user?.full_name;
    const email = patient?.email || user?.email;
    const phone = patient?.phone_number || user?.phone_number;

    if (fullName) {
      if (displayPatientName) displayPatientName.textContent = fullName;
      if (editPatientName) editPatientName.value = fullName;
    }
    if (email) {
      if (displayPatientEmail) displayPatientEmail.textContent = email;
      if (editPatientEmail) editPatientEmail.value = email;
    }
    if (phone) {
      if (displayPatientPhone) displayPatientPhone.textContent = phone;
      if (editPatientPhone) editPatientPhone.value = phone;
    }

    if (activeBookingData) {
      if (fullName) activeBookingData.patientName = fullName;
      if (email) activeBookingData.patientEmail = email;
      if (phone) activeBookingData.patientPhone = phone;
    }
  };

  // Synchronize authenticated user header details & Your Details section
  const applyUserHeader = (user, patient) => {
    const fullName = patient?.full_name || user?.full_name;
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

    // Automatically update the "Your Details" section with the user profile
    updateCheckoutPatientDetailsUI(user, patient);
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

  // Helper: Sanitize package title to completely remove any '- Consultation' or 'Consultation' suffix
  const cleanPackageTitle = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name
      .replace(/\s*-\s*consultation\s*$/i, '')
      .replace(/\s*consultation\s*$/i, '')
      .replace(/\s*-\s*consultation\b/i, '')
      .trim();
  };

  // DOM Elements for Package / Doctor / Meta
  const checkoutPriceVal = document.getElementById('checkoutPriceVal');
  const checkoutDurationVal = document.getElementById('checkoutDurationVal');
  const checkoutAvatarText = document.getElementById('checkoutAvatarText');
  const checkoutPriceRow = document.getElementById('checkoutPriceRow');
  const checkoutDurationRow = document.getElementById('checkoutDurationRow');

  // Helper: Format amount to Indian Rupees format with 2 decimals
  const formatAmount = (num) => {
    if (typeof num === 'string') {
      const cleaned = num.replace(/[^0-9.]/g, '');
      if (cleaned && !isNaN(parseFloat(cleaned))) {
        num = parseFloat(cleaned);
      }
    }
    const val = parseFloat(num);
    if (isNaN(val)) return '₹0.00';
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getNumericAmount = (val) => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Helper: Update Payment Summary & Modal Confirmation amounts dynamically
  const updatePaymentSummaryUI = (amountVal, feeLabel = 'Package fee') => {
    const formatted = formatAmount(amountVal);
    if (checkoutSummaryFeeLabel) checkoutSummaryFeeLabel.textContent = feeLabel;
    if (checkoutSummaryFee) checkoutSummaryFee.textContent = formatted;
    if (checkoutSummaryTotal) checkoutSummaryTotal.textContent = formatted;
    if (successPaymentAmount) successPaymentAmount.textContent = formatted;
    if (receiptAmount) receiptAmount.textContent = formatted;
  };

  // Helper: Normalize package name for robust comparison
  const normalizePackageName = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .replace(/\s*-\s*consultation\s*$/i, '')
      .replace(/\s*consultation\s*$/i, '')
      .replace(/\s*-\s*consultation\b/i, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  // Helper: Check if current patient is already enrolled in target package
  const checkPackageAlreadyEnrolled = async (pkgName, pkgId) => {
    const targetName = normalizePackageName(pkgName);
    const targetId = pkgId ? String(pkgId) : null;

    // 1. Check local storage
    try {
      const localBooked = JSON.parse(localStorage.getItem('ocayur_booked_packages') || '[]');
      if (Array.isArray(localBooked) && localBooked.length > 0) {
        const found = localBooked.some(lb => {
          if (!lb) return false;
          const lbName = normalizePackageName(lb.package_name || lb.packageTitle);
          const lbId = lb.package_id || lb.packageDbId || lb.id ? String(lb.package_id || lb.packageDbId || lb.id) : null;
          if (targetId && lbId && (targetId === lbId || targetId.toUpperCase() === lbId.toUpperCase())) return true;
          if (targetName && lbName) {
            if (targetName === lbName) return true;
            if ((targetName.length >= 6 && lbName.includes(targetName)) || (lbName.length >= 6 && targetName.includes(lbName))) return true;
          }
          return false;
        });
        if (found) return true;
      }
    } catch (e) {}

    // 2. Check backend API
    try {
      const params = new URLSearchParams();
      params.append('action', 'my_packages');
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);
      const res = await fetch(`../api/packages.php?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.packages)) {
          const found = data.packages.some(bp => {
            if (!bp) return false;
            const bpName = normalizePackageName(bp.package_name || bp.packageTitle);
            const bpId = bp.package_id || bp.id ? String(bp.package_id || bp.id) : null;
            if (targetId && bpId && (targetId === bpId || targetId.toUpperCase() === bpId.toUpperCase())) return true;
            if (targetName && bpName) {
              if (targetName === bpName) return true;
              if ((targetName.length >= 6 && bpName.includes(targetName)) || (bpName.length >= 6 && targetName.includes(bpName))) return true;
            }
            return false;
          });
          if (found) return true;
        }
      }
    } catch (e) {}

    return false;
  };

  // Helper: Show Already Enrolled UI on Checkout
  const showAlreadyEnrolledCheckoutUI = (pkgTitle) => {
    const existingBanner = document.getElementById('checkoutAlreadyEnrolledBanner');
    if (!existingBanner) {
      const banner = document.createElement('div');
      banner.id = 'checkoutAlreadyEnrolledBanner';
      banner.className = 'checkout-already-registered-alert';
      banner.style.cssText = 'background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; display: flex; gap: 14px; align-items: flex-start;';
      banner.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" style="flex-shrink: 0; margin-top: 2px;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <div>
          <strong style="color: #065f46; font-size: 15px; display: block; margin-bottom: 4px;">You are already enrolled in this health package!</strong>
          <p style="color: #047857; font-size: 13.5px; margin: 0 0 12px 0;">Your active treatment protocol for <strong>${pkgTitle || 'this package'}</strong> is already confirmed. Re-enrolling or paying again is not permitted.</p>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <a href="package.html#my-packages" class="btn-package-action" style="padding: 8px 16px; font-size: 13px; text-decoration: none; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
              <span>View in My Packages</span>
            </a>
            <a href="package.html" class="btn-package-secondary" style="padding: 8px 16px; font-size: 13px; text-decoration: none; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
              <span>Back to Packages</span>
            </a>
          </div>
        </div>
      `;
      const container = document.querySelector('.checkout-container') || document.querySelector('.checkout-layout-grid') || document.querySelector('.checkout-grid') || document.querySelector('main');
      if (container) {
        container.insertBefore(banner, container.firstChild);
      }
    }

    if (confirmPaymentBtn) {
      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.style.backgroundColor = '#15803d';
      confirmPaymentBtn.style.opacity = '0.92';
      confirmPaymentBtn.style.cursor = 'not-allowed';
      confirmPaymentBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span style="margin-left: 8px;">Already Enrolled</span>
      `;
    }
  };

  // 1. Synchronize Package & Doctor Details Dynamically from Database
  const applyPackageData = (pkg) => {
    if (!pkg) return;
    const cleanTitle = cleanPackageTitle(pkg.package_name) || 'Health Package';

    if (isPackageCheckout) {
      checkPackageAlreadyEnrolled(cleanTitle, pkg.id || pkg.package_id).then(isEnrolled => {
        if (isEnrolled) {
          showAlreadyEnrolledCheckoutUI(cleanTitle);
        }
      });
    }
    activeBookingData = activeBookingData || {};
    activeBookingData.packageDbId = pkg.id;
    activeBookingData.packageId = pkg.package_id;
    activeBookingData.packageTitle = cleanTitle;
    activeBookingData.doctorName = pkg.doctor?.name || pkg.assigned_doctor || 'Dr. Nidhi Jha';
    activeBookingData.doctorRole = pkg.doctor?.role || pkg.doctor?.expertise || 'Ayurveda Physician';
    activeBookingData.doctorInitials = pkg.doctor?.initials || 'DR';
    activeBookingData.startingPrice = pkg.price_formatted || ('₹' + pkg.price);
    activeBookingData.duration = pkg.duration || '3 Months';
    activeBookingData.price = pkg.price;
    activeBookingData.amount = pkg.price;

    // Package Name Heading (Without 'Consultation')
    if (consultDetailsHeading) {
      consultDetailsHeading.textContent = cleanTitle;
    }

    // Doctor Details
    if (checkoutDoctorName) {
      checkoutDoctorName.textContent = activeBookingData.doctorName;
    }
    if (checkoutDoctorRole) {
      checkoutDoctorRole.textContent = activeBookingData.doctorRole;
    }
    if (checkoutAvatarText) {
      checkoutAvatarText.textContent = activeBookingData.doctorInitials;
    }

    // Starting Price & Duration
    if (checkoutPriceVal) {
      checkoutPriceVal.textContent = activeBookingData.startingPrice;
    }
    if (checkoutDurationVal) {
      checkoutDurationVal.textContent = activeBookingData.duration;
    }

    // Update Summary Card & Modal Confirmation amounts dynamically
    updatePaymentSummaryUI(pkg.price, 'Package fee');

    // Success Modal
    if (successServiceType) successServiceType.textContent = 'package';
    if (receiptWorkshopRow) receiptWorkshopRow.style.display = 'none';
    const receiptPackageTitle = document.getElementById('receiptPackageTitle');
    if (receiptPackageTitle) {
      receiptPackageTitle.textContent = cleanTitle;
    }
  };

  // Fetch package details from SQL Backend
  const fetchPackageFromDB = async (targetId, targetPkgCode, targetName) => {
    let queryParam = '';
    const cleanTargetName = cleanPackageTitle(targetName);
    if (targetId) {
      queryParam = `id=${encodeURIComponent(targetId)}`;
    } else if (targetPkgCode) {
      queryParam = `package_id=${encodeURIComponent(targetPkgCode)}`;
    } else if (cleanTargetName) {
      queryParam = `name=${encodeURIComponent(cleanTargetName)}`;
    } else {
      queryParam = 'id=2'; // default to active package
    }

    try {
      const res = await fetch(`../api/packages.php?action=details&${queryParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.package) {
          applyPackageData(data.package);
        }
      }
    } catch (err) {
      console.warn('Notice: Error fetching checkout package from DB:', err);
    }
  };

  // 2. Initialize Checkout Data from URL & LocalStorage
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qId = urlParams.get('id');
    const qPkgId = urlParams.get('package_id');
    const qName = cleanPackageTitle(urlParams.get('name') || '');

    const checkoutType = (localStorage.getItem('ocayur_checkout_type') || localStorage.getItem('panchved_checkout_type'));
    const workshopStored = (localStorage.getItem('ocayur_workshop_booking') || localStorage.getItem('panchved_workshop_booking'));
    const consultStored = (localStorage.getItem('ocayur_consultation_booking') || localStorage.getItem('panchved_consultation_booking'));

    // Get current profile details from localStorage
    const storedUserObj = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
    const storedPatientObj = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
    const currentProfileName = storedPatientObj?.full_name || storedUserObj?.full_name;
    const currentProfileEmail = storedPatientObj?.email || storedUserObj?.email;
    const currentProfilePhone = storedPatientObj?.phone_number || storedUserObj?.phone_number;

    if (checkoutType === 'workshop' && workshopStored) {
      isWorkshopCheckout = true;
      isPackageCheckout = false;
      activeBookingData = JSON.parse(workshopStored);
      const data = activeBookingData;

      if (consultDetailsHeading) consultDetailsHeading.textContent = 'Workshop Details';
      if (checkoutDoctorName) checkoutDoctorName.textContent = data.workshopTitle || 'Ayurveda Lifestyle Workshop';
      if (checkoutDoctorRole) checkoutDoctorRole.textContent = `By ${data.doctorName || 'Dr. Nidhi Jha'}`;
      if (checkoutDate) checkoutDate.textContent = data.date || '2 September 2026';
      if (checkoutTime) checkoutTime.textContent = data.time || '08:00 AM';

      const fallbackPat = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient') || localStorage.getItem('ocayur_user')) || '{}');
      const pName = currentProfileName || data.patientName || fallbackPat.full_name || 'Patient';
      const pEmail = currentProfileEmail || data.patientEmail || fallbackPat.email || '';
      const pPhone = currentProfilePhone || data.patientPhone || fallbackPat.phone_number || '';

      if (displayPatientName) displayPatientName.textContent = pName;
      if (displayPatientEmail) displayPatientEmail.textContent = pEmail;
      if (displayPatientPhone) displayPatientPhone.textContent = pPhone;

      if (editPatientName) editPatientName.value = pName;
      if (editPatientEmail) editPatientEmail.value = pEmail;
      if (editPatientPhone) editPatientPhone.value = pPhone;

      const wsPrice = data.price ?? data.fee ?? data.amount ?? 500;
      updatePaymentSummaryUI(wsPrice, 'Workshop fee');

      if (successServiceType) successServiceType.textContent = 'workshop';
      if (successEventDate) successEventDate.textContent = data.date || '2 Sept 2026';
      if (receiptWorkshopRow) receiptWorkshopRow.style.display = 'flex';
      if (receiptWorkshopTitle) receiptWorkshopTitle.textContent = data.workshopTitle || 'Ayurveda Wellness Workshop';

    } else if (checkoutType === 'consultation' || (!qId && !qPkgId && !qName && consultStored && JSON.parse(consultStored || '{}').isConsultationCheckout)) {
      isWorkshopCheckout = false;
      isPackageCheckout = false;

      if (consultStored) {
        activeBookingData = JSON.parse(consultStored);
        const data = activeBookingData;

        if (consultDetailsHeading) consultDetailsHeading.textContent = 'Online Ayurved Consultation';
        if (checkoutDoctorName && data.doctorName) checkoutDoctorName.textContent = data.doctorName;
        if (checkoutDoctorRole && data.doctorRole) checkoutDoctorRole.textContent = data.doctorRole;
        if (checkoutAvatarText && data.doctorInitials) checkoutAvatarText.textContent = data.doctorInitials;
        
        const priceItemText = document.getElementById('checkoutPriceText');
        const durationItemText = document.getElementById('checkoutDurationText');
        if (priceItemText && data.date) priceItemText.innerHTML = `Date: <strong>${data.date}</strong>`;
        if (durationItemText && data.time) durationItemText.innerHTML = `Time: <strong>${data.time}</strong>`;

        const fallbackPat = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient') || localStorage.getItem('ocayur_user')) || '{}');
        const pName = currentProfileName || data.patientName || fallbackPat.full_name || 'Patient';
        const pEmail = currentProfileEmail || data.patientEmail || fallbackPat.email || '';
        const pPhone = currentProfilePhone || data.patientPhone || fallbackPat.phone_number || '';

        if (displayPatientName) displayPatientName.textContent = pName;
        if (displayPatientEmail) displayPatientEmail.textContent = pEmail;
        if (displayPatientPhone) displayPatientPhone.textContent = pPhone;

        if (editPatientName) editPatientName.value = pName;
        if (editPatientEmail) editPatientEmail.value = pEmail;
        if (editPatientPhone) editPatientPhone.value = pPhone;

        const consultPrice = data.fee ?? data.amount ?? data.price ?? 500;
        updatePaymentSummaryUI(consultPrice, 'Consultation fee');

        if (successServiceType) successServiceType.textContent = 'consultation';
        if (receiptWorkshopRow) receiptWorkshopRow.style.display = 'none';
        const receiptPackageTitle = document.getElementById('receiptPackageTitle');
        if (receiptPackageTitle) receiptPackageTitle.textContent = `Consultation with ${data.doctorName || 'Doctor'}`;
      }
    } else {
      isWorkshopCheckout = false;
      isPackageCheckout = true;

      if (consultStored) {
        activeBookingData = JSON.parse(consultStored);
        const data = activeBookingData;

        // Immediate preview from stored data with package title cleaned
        if (data.packageTitle) {
          data.packageTitle = cleanPackageTitle(data.packageTitle);
        }
        if (consultDetailsHeading) {
          consultDetailsHeading.textContent = cleanPackageTitle(data.packageTitle) || 'Reset Your Hormones';
        }
        if (checkoutDoctorName && data.doctorName) checkoutDoctorName.textContent = data.doctorName;
        if (checkoutDoctorRole && data.doctorRole) checkoutDoctorRole.textContent = data.doctorRole;
        if (checkoutAvatarText && data.doctorInitials) checkoutAvatarText.textContent = data.doctorInitials;
        if (checkoutPriceVal && data.startingPrice) checkoutPriceVal.textContent = data.startingPrice;
        if (checkoutDurationVal && data.duration) checkoutDurationVal.textContent = data.duration;

        const storedPkgPrice = data.price ?? data.amount ?? (data.fee ? getNumericAmount(data.fee) : getNumericAmount(data.startingPrice));
        if (storedPkgPrice) {
          updatePaymentSummaryUI(storedPkgPrice, 'Package fee');
        }
      }

      const fallbackPat = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient') || localStorage.getItem('ocayur_user')) || '{}');
      const pName = currentProfileName || activeBookingData?.patientName || fallbackPat.full_name || 'Patient';
      const pEmail = currentProfileEmail || activeBookingData?.patientEmail || fallbackPat.email || '';
      const pPhone = currentProfilePhone || activeBookingData?.patientPhone || fallbackPat.phone_number || '';

      if (displayPatientName) displayPatientName.textContent = pName;
      if (displayPatientEmail) displayPatientEmail.textContent = pEmail;
      if (displayPatientPhone) displayPatientPhone.textContent = pPhone;

      if (editPatientName) editPatientName.value = pName;
      if (editPatientEmail) editPatientEmail.value = pEmail;
      if (editPatientPhone) editPatientPhone.value = pPhone;

      // Fetch dynamic fresh package and doctor data from SQL Database
      const targetId = qId || activeBookingData?.packageDbId || null;
      const targetPkgCode = qPkgId || activeBookingData?.packageId || null;
      const targetName = qName || cleanPackageTitle(activeBookingData?.packageTitle) || 'Reset Your Hormones';

      checkPackageAlreadyEnrolled(targetName, targetId || targetPkgCode).then(isEnrolled => {
        if (isEnrolled) {
          showAlreadyEnrolledCheckoutUI(targetName);
        }
      });

      fetchPackageFromDB(targetId, targetPkgCode, targetName);
    }
  } catch (err) {
    console.warn('Notice: Unable to initialize checkout state:', err);
  }

  // Input Validation: Restrict Numbers in Full Name & Limit Phone to 10 Digits
  const restrictNameInput = (inputEl) => {
    if (!inputEl) return;
    inputEl.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '0' && e.key <= '9') {
        e.preventDefault();
      }
    });
    inputEl.addEventListener('input', () => {
      inputEl.value = inputEl.value.replace(/[0-9]/g, '');
    });
  };
  restrictNameInput(editPatientName);

  if (editPatientPhone) {
    editPatientPhone.addEventListener('input', () => {
      editPatientPhone.value = editPatientPhone.value.replace(/\D/g, '').slice(0, 10);
    });
  }

  // Helper: Synchronize and automatically update patient & user profile in DB and LocalStorage
  const syncUpdatedProfileDetails = async (name, email, phone) => {
    if (!name || !email || !phone) return;

    // 1. Update localStorage caches
    let updatedPatient = {};
    let updatedUser = {};
    try {
      updatedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || '{}');
      updatedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || '{}');

      updatedPatient.full_name = name;
      updatedPatient.email = email;
      updatedPatient.phone_number = phone;

      updatedUser.full_name = name;
      updatedUser.email = email;
      updatedUser.phone_number = phone;

      localStorage.setItem('ocayur_patient', JSON.stringify(updatedPatient));
      localStorage.setItem('ocayur_user', JSON.stringify(updatedUser));

      // Also update booking cache if present
      const consultStored = JSON.parse((localStorage.getItem('ocayur_consultation_booking') || localStorage.getItem('panchved_consultation_booking')) || '{}');
      if (consultStored && typeof consultStored === 'object') {
        consultStored.patientName = name;
        consultStored.patientEmail = email;
        consultStored.patientPhone = phone;
        localStorage.setItem('ocayur_consultation_booking', JSON.stringify(consultStored));
      }

      const workshopStored = JSON.parse((localStorage.getItem('ocayur_workshop_booking') || localStorage.getItem('panchved_workshop_booking')) || '{}');
      if (workshopStored && typeof workshopStored === 'object') {
        workshopStored.patientName = name;
        workshopStored.patientEmail = email;
        workshopStored.patientPhone = phone;
        localStorage.setItem('ocayur_workshop_booking', JSON.stringify(workshopStored));
      }
    } catch (e) {
      console.warn('LocalStorage profile sync notice:', e);
    }

    // 2. Update page header user badge & greeting
    applyUserHeader(updatedUser, updatedPatient);

    // 3. Update active booking state
    if (activeBookingData) {
      activeBookingData.patientName = name;
      activeBookingData.patientEmail = email;
      activeBookingData.patientPhone = phone;
    }

    // 4. Update MySQL Database profile via PHP API
    try {
      const dob = updatedPatient?.dob_formatted || updatedPatient?.dob || '08/05/2002';
      const gender = updatedPatient?.gender || 'Male';

      const response = await fetch('../api/profile.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          action: 'update_profile',
          fullName: name,
          email: email,
          phone: phone,
          dob: dob,
          gender: gender
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          if (result.user) {
            try { localStorage.setItem('ocayur_user', JSON.stringify(result.user)); } catch (e) {}
          }
          if (result.patient) {
            try { localStorage.setItem('ocayur_patient', JSON.stringify(result.patient)); } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.warn('Database profile sync notice:', err);
    }
  };

  // 3. In-Place Edit Details Toggle
  if (editDetailsBtn && patientDetailsView && patientDetailsEditForm) {
    editDetailsBtn.addEventListener('click', () => {
      patientDetailsView.style.display = 'none';
      patientDetailsEditForm.style.display = 'flex';
      editPatientName?.focus();
    });
  }

  if (cancelEditBtn && patientDetailsView && patientDetailsEditForm) {
    cancelEditBtn.addEventListener('click', () => {
      patientDetailsEditForm.style.display = 'none';
      patientDetailsView.style.display = 'block';
    });
  }

  if (patientDetailsEditForm) {
    patientDetailsEditForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newName = editPatientName?.value.trim();
      const newEmail = editPatientEmail?.value.trim();
      const newPhone = editPatientPhone?.value.trim();

      if (!newName || !newEmail || !newPhone) {
        showToast('Please fill in all details.', true);
        return;
      }

      if (/\d/.test(newName)) {
        showToast('Full name should not contain numbers.', true);
        editPatientName?.focus();
        return;
      }

      if (newPhone.length < 10) {
        showToast('Please enter a valid 10-digit phone number.', true);
        editPatientPhone?.focus();
        return;
      }

      const saveBtn = document.getElementById('saveEditBtn');
      const originalSaveHtml = saveBtn ? saveBtn.innerHTML : 'Save Details';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Saving...';
      }

      // Update static display view immediately
      if (displayPatientName) displayPatientName.textContent = newName;
      if (displayPatientEmail) displayPatientEmail.textContent = newEmail;
      if (displayPatientPhone) displayPatientPhone.textContent = newPhone;

      // Automatically update user profile in LocalStorage and MySQL database
      await syncUpdatedProfileDetails(newName, newEmail, newPhone);

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalSaveHtml;
      }

      patientDetailsEditForm.style.display = 'none';
      patientDetailsView.style.display = 'block';

      showToast('Profile and details updated successfully!');
    });
  }

  // 4. Payment Method Selection (Card / UPI / PayPal)
  paymentMethodItems.forEach(item => {
    item.addEventListener('click', () => {
      paymentMethodItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const radio = item.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  // Helper: Get Selected Payment Method
  const getSelectedPaymentMethod = () => {
    const activeRadio = document.querySelector('input[name="paymentMethod"]:checked');
    return activeRadio ? activeRadio.value : 'card';
  };

  // 5. Confirm Payment & Show Success Modal with MySQL DB Backend Sync
  if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener('click', async () => {
      const originalHtml = confirmPaymentBtn.innerHTML;
      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.style.opacity = '0.85';
      confirmPaymentBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Processing Payment...</span>
      `;

      const fallbackPat = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient') || localStorage.getItem('ocayur_user')) || '{}');
      const pName = displayPatientName?.textContent.trim() || editPatientName?.value.trim() || fallbackPat.full_name || 'Patient';
      const pEmail = displayPatientEmail?.textContent.trim() || editPatientEmail?.value.trim() || fallbackPat.email || '';
      const pPhone = displayPatientPhone?.textContent.trim() || editPatientPhone?.value.trim() || fallbackPat.phone_number || '';
      const payMethod = getSelectedPaymentMethod();
      const currentPkgTitle = cleanPackageTitle(consultDetailsHeading?.textContent || activeBookingData?.packageTitle || 'Health Package');

      // Keep user profile up to date
      await syncUpdatedProfileDetails(pName, pEmail, pPhone);

      let bookingId = '#' + Math.floor(100000 + Math.random() * 900000);

      // Determine correct payment amount
      let finalAmount = 0;
      if (activeBookingData?.price) {
        finalAmount = getNumericAmount(activeBookingData.price);
      } else if (activeBookingData?.amount) {
        finalAmount = getNumericAmount(activeBookingData.amount);
      } else if (checkoutSummaryTotal?.textContent) {
        finalAmount = getNumericAmount(checkoutSummaryTotal.textContent);
      } else if (checkoutPriceVal?.textContent) {
        finalAmount = getNumericAmount(checkoutPriceVal.textContent);
      }
      if (finalAmount <= 0) {
        finalAmount = 7999.00;
      }

      // If this is a package checkout, check again before submitting payment
      if (isPackageCheckout) {
        const isEnrolled = await checkPackageAlreadyEnrolled(currentPkgTitle, activeBookingData?.packageDbId || activeBookingData?.packageId);
        if (isEnrolled) {
          confirmPaymentBtn.disabled = true;
          confirmPaymentBtn.style.opacity = '0.92';
          confirmPaymentBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span style="margin-left: 8px;">Already Enrolled</span>
          `;
          showToast('You are already enrolled in this health package.', true);
          showAlreadyEnrolledCheckoutUI(currentPkgTitle);
          return;
        }
      }

      let paymentSuccessful = false;

      try {
        // Handle Package enrollment via api/packages.php
        const bookingPayload = {
          action: 'enroll',
          package_name: currentPkgTitle,
          patient_name: pName,
          patient_email: pEmail,
          patient_phone: pPhone,
          patient_id: activeBookingData?.patientId || '',
          doctor_name: activeBookingData?.doctorName || checkoutDoctorName?.textContent.trim() || 'Dr. Nidhi Jha',
          doctor_role: activeBookingData?.doctorRole || checkoutDoctorRole?.textContent.trim() || 'Ayurveda Physician',
          appointment_date: new Date().toISOString().split('T')[0],
          appointment_time: '07:00 - 07:45 PM',
          agenda: `Package Enrollment for ${currentPkgTitle}`,
          payment_method: payMethod,
          amount: finalAmount
        };

        const res = await fetch('../api/packages.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(bookingPayload)
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData.success) {
            paymentSuccessful = true;
            if (resData.booking_id) {
              bookingId = resData.booking_id;
            }

            // Update cached patient profile in localStorage with new package
            try {
              const currentPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || '{}');
              currentPatient.package_name = resData.package_name || bookingPayload.package_name;
              currentPatient.full_name = pName;
              currentPatient.email = pEmail;
              currentPatient.phone_number = pPhone;
              if (resData.patient_id) currentPatient.patient_id = resData.patient_id;
              localStorage.setItem('ocayur_patient', JSON.stringify(currentPatient));
            } catch (e) {}

            // Also store booked package record in localStorage for instant client-side sync
            try {
              let localBooked = JSON.parse(localStorage.getItem('ocayur_booked_packages') || '[]');
              if (!Array.isArray(localBooked)) localBooked = [];
              const targetTitle = resData.package_name || bookingPayload.package_name;
              const existingIdx = localBooked.findIndex(b => b.package_name && b.package_name.toLowerCase() === targetTitle.toLowerCase());
              const newBookedRecord = {
                booking_id: bookingId,
                package_name: targetTitle,
                doctor_name: resData.doctor_name || bookingPayload.doctor_name,
                patient_phone: pPhone,
                patient_id: resData.patient_id || bookingPayload.patient_id,
                price: finalAmount,
                booking_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                booking_status: 'Active'
              };
              if (existingIdx >= 0) {
                localBooked[existingIdx] = newBookedRecord;
              } else {
                localBooked.unshift(newBookedRecord);
              }
              localStorage.setItem('ocayur_booked_packages', JSON.stringify(localBooked));
            } catch (e) {}
          } else {
            showToast(resData.message || 'Payment could not be completed.', true);
            if (resData.already_enrolled) {
              showAlreadyEnrolledCheckoutUI(currentPkgTitle);
            }
          }
        } else {
          try {
            const errData = await res.json();
            showToast(errData.message || 'Booking could not be processed.', true);
            if (errData.already_enrolled) {
              showAlreadyEnrolledCheckoutUI(currentPkgTitle);
            }
          } catch(e) {}
        }
      } catch (backendErr) {
        console.warn('Backend sync notice:', backendErr);
      }

      if (paymentSuccessful) {
        setTimeout(() => {
          confirmPaymentBtn.disabled = false;
          confirmPaymentBtn.style.opacity = '1';
          confirmPaymentBtn.innerHTML = originalHtml;

          if (receiptBookingId) {
            receiptBookingId.textContent = bookingId;
          }

          const formattedFinalAmount = formatAmount(finalAmount);
          if (receiptAmount) {
            receiptAmount.textContent = formattedFinalAmount;
          }
          if (successPaymentAmount) {
            successPaymentAmount.textContent = formattedFinalAmount;
          }

          // Open Screen 5: Booking Success Modal
          if (bookingSuccessModal) {
            bookingSuccessModal.classList.add('active');
            bookingSuccessModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
          }

          showToast('Payment successful! Booking confirmed.');
        }, 600);
      } else {
        const isStillEnrolled = await checkPackageAlreadyEnrolled(currentPkgTitle, activeBookingData?.packageDbId || activeBookingData?.packageId);
        if (isStillEnrolled) {
          showAlreadyEnrolledCheckoutUI(currentPkgTitle);
        } else {
          confirmPaymentBtn.disabled = false;
          confirmPaymentBtn.style.opacity = '1';
          confirmPaymentBtn.innerHTML = originalHtml;
        }
      }
    });
  }

  // 6. Success Modal Continue Button -> Redirect to Appropriate Page
  if (continueToDashboardBtn) {
    continueToDashboardBtn.addEventListener('click', () => {
      if (bookingSuccessModal) {
        bookingSuccessModal.classList.remove('active');
        bookingSuccessModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
      if (isPackageCheckout) {
        window.location.href = 'package.html#my-packages';
      } else if (isWorkshopCheckout) {
        window.location.href = '../courses/courses.html#my-workshops';
      } else {
        window.location.href = '../dashboard/dashboard.html';
      }
    });
  }

  // Real-time synchronization: When changes are made in User Profile, automatically update "Your Details"
  window.addEventListener('storage', (e) => {
    if ((e.key === 'ocayur_user' || e.key === 'panchved_user') || (e.key === 'ocayur_patient' || e.key === 'panchved_patient')) {
      try {
        const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
        const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
        if (storedUser || storedPatient) {
          applyUserHeader(storedUser, storedPatient);
          updateCheckoutPatientDetailsUI(storedUser, storedPatient);
        }
      } catch (err) {}
    }
  });

  // Re-sync when switching back to the checkout tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try {
        const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
        const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
        if (storedUser || storedPatient) {
          applyUserHeader(storedUser, storedPatient);
          updateCheckoutPatientDetailsUI(storedUser, storedPatient);
        }
      } catch (err) {}
      syncHeaderFromDB();
    }
  });
});
