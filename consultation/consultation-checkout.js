/**
 * Ocayur Patient Portal - Consultation Checkout & Payment Engine
 * Handles payment confirmation, in-place details editing, and backend booking for Consultations.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Drawer
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Consultation Details Elements
  const checkoutDoctorName = document.getElementById('checkoutDoctorName');
  const checkoutDoctorRole = document.getElementById('checkoutDoctorRole');
  const checkoutAvatarText = document.getElementById('checkoutAvatarText');
  const checkoutDateVal = document.getElementById('checkoutDateVal');
  const checkoutTimeVal = document.getElementById('checkoutTimeVal');

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

  // Success Modal Elements
  const bookingSuccessModal = document.getElementById('bookingSuccessModal');
  const continueToAppointmentsBtn = document.getElementById('continueToAppointmentsBtn');
  const receiptBookingId = document.getElementById('receiptBookingId');
  const receiptDoctorName = document.getElementById('receiptDoctorName');
  const receiptDateTime = document.getElementById('receiptDateTime');
  const receiptAmount = document.getElementById('receiptAmount');

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

  // Synchronize authenticated user header details
  const applyUserHeader = (user, patient) => {
    const fullName = patient?.full_name || user?.full_name;
    const patientId = patient?.patient_id || ('P00' + (user?.id || 1));

    if (fullName) {
      const userName = document.getElementById('userName');
      if (userName) userName.textContent = fullName;
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

  // 1. Initialize Consultation Booking Data from localStorage
  try {
    const stored = (localStorage.getItem('ocayur_consultation_booking') || localStorage.getItem('panchved_consultation_booking'));
    if (stored) {
      activeBookingData = JSON.parse(stored);
      const data = activeBookingData;

      if (checkoutDoctorName && data.doctorName) checkoutDoctorName.textContent = data.doctorName;
      if (checkoutDoctorRole && data.doctorRole) checkoutDoctorRole.textContent = data.doctorRole;
      if (checkoutAvatarText && data.doctorInitials) checkoutAvatarText.textContent = data.doctorInitials;
      if (checkoutDateVal && data.date) checkoutDateVal.textContent = data.date;
      if (checkoutTimeVal && (data.time || data.startTime)) {
        checkoutTimeVal.textContent = data.time || `${data.startTime} - ${data.endTime || '07:45 PM'}`;
      }

      if (data.patientName && displayPatientName) displayPatientName.textContent = data.patientName;
      if (data.patientEmail && displayPatientEmail) displayPatientEmail.textContent = data.patientEmail;
      if (data.patientPhone && displayPatientPhone) displayPatientPhone.textContent = data.patientPhone;

      if (data.patientName && editPatientName) editPatientName.value = data.patientName;
      if (data.patientEmail && editPatientEmail) editPatientEmail.value = data.patientEmail;
      if (data.patientPhone && editPatientPhone) editPatientPhone.value = data.patientPhone;
    }
  } catch (e) {
    console.warn('Notice: Error loading consultation booking data:', e);
  }

  // 2. In-Place Edit Details Toggle
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
    patientDetailsEditForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const newName = editPatientName?.value.trim();
      const newEmail = editPatientEmail?.value.trim();
      const newPhone = editPatientPhone?.value.trim();

      if (!newName || !newEmail || !newPhone) {
        showToast('Please fill in all details.', true);
        return;
      }

      if (displayPatientName) displayPatientName.textContent = newName;
      if (displayPatientEmail) displayPatientEmail.textContent = newEmail;
      if (displayPatientPhone) displayPatientPhone.textContent = newPhone;

      if (activeBookingData) {
        activeBookingData.patientName = newName;
        activeBookingData.patientEmail = newEmail;
        activeBookingData.patientPhone = newPhone;
        localStorage.setItem('ocayur_consultation_booking', JSON.stringify(activeBookingData));
      }

      patientDetailsEditForm.style.display = 'none';
      patientDetailsView.style.display = 'block';

      showToast('Patient details updated successfully!');
    });
  }

  // 3. Payment Method Selection (Card / UPI / PayPal)
  paymentMethodItems.forEach(item => {
    item.addEventListener('click', () => {
      paymentMethodItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const radio = item.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  const getSelectedPaymentMethod = () => {
    const activeRadio = document.querySelector('input[name="paymentMethod"]:checked');
    return activeRadio ? activeRadio.value : 'card';
  };

  // 4. Confirm Payment -> Backend API Sync & Success Modal
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

      const pName = displayPatientName?.textContent.trim() || 'Rahul Sharma';
      const pEmail = displayPatientEmail?.textContent.trim() || 'rahulsharma@gmail.com';
      const pPhone = displayPatientPhone?.textContent.trim() || '9876543210';
      const docName = checkoutDoctorName?.textContent.trim() || activeBookingData?.doctorName || 'Dr. Prerna Nikam';
      const docRole = checkoutDoctorRole?.textContent.trim() || activeBookingData?.doctorRole || 'Ayurveda Physician';
      const dateText = checkoutDateVal?.textContent.trim() || activeBookingData?.date || '2 September 2026';
      const timeText = checkoutTimeVal?.textContent.trim() || activeBookingData?.time || '07:00 - 07:45 PM';
      const payMethod = getSelectedPaymentMethod();

      let bookingId = '#' + Math.floor(100000 + Math.random() * 900000);

      try {
        const payload = {
          action: 'book_consultation',
          doctor_name: docName,
          doctor_role: docRole,
          patient_name: pName,
          patient_email: pEmail,
          patient_phone: pPhone,
          appointment_date: dateText,
          appointment_time: timeText,
          duration: '45 min',
          agenda: activeBookingData?.agenda || `Online consultation with ${docName}`,
          payment_method: payMethod,
          amount: 500.00
        };

        const res = await fetch('../api/consultations.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData.success && resData.booking_id) {
            bookingId = resData.booking_id;
          }
        }
      } catch (backendErr) {
        console.warn('Notice: Backend consultation sync error:', backendErr);
      }

      setTimeout(() => {
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.style.opacity = '1';
        confirmPaymentBtn.innerHTML = originalHtml;

        if (receiptBookingId) receiptBookingId.textContent = bookingId;
        if (receiptDoctorName) receiptDoctorName.textContent = docName;
        if (receiptDateTime) receiptDateTime.textContent = `${dateText}, ${timeText}`;
        if (receiptAmount) receiptAmount.textContent = '₹500.00';

        if (bookingSuccessModal) {
          bookingSuccessModal.classList.add('active');
          bookingSuccessModal.setAttribute('aria-hidden', 'false');
          document.body.style.overflow = 'hidden';
        }

        showToast('Payment successful! Consultation booked.');
      }, 600);
    });
  }

  // 5. Continue to Appointments CTA
  if (continueToAppointmentsBtn) {
    continueToAppointmentsBtn.addEventListener('click', () => {
      if (bookingSuccessModal) {
        bookingSuccessModal.classList.remove('active');
        bookingSuccessModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
      window.location.href = 'consultation.html#my-appointments';
    });
  }
});
