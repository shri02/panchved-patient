/**
 * Panchved Patient Portal - Unified Checkout & Payment Engine
 * Handles both Consultation/Package Booking and Workshop Registration Checkout.
 * Connected directly with PHP backend APIs.
 */

document.addEventListener('DOMContentLoaded', () => {
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

  // Synchronize authenticated user header details
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
      const res = await fetch('api/profile.php' + (params.toString() ? `?${params.toString()}` : ''));
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
      try { await fetch('api/logout.php', { method: 'POST' }); } catch (err) {}
      try {
        localStorage.removeItem('panchved_user');
        localStorage.removeItem('panchved_patient');
        localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
      showToast('Logged out successfully.');
      setTimeout(() => { window.location.href = 'index.html'; }, 350);
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

  // 1. Synchronize Package & Doctor Details Dynamically from Database
  const applyPackageData = (pkg) => {
    if (!pkg) return;
    const cleanTitle = cleanPackageTitle(pkg.package_name) || 'Health Package';
    activeBookingData = activeBookingData || {};
    activeBookingData.packageDbId = pkg.id;
    activeBookingData.packageId = pkg.package_id;
    activeBookingData.packageTitle = cleanTitle;
    activeBookingData.doctorName = pkg.doctor?.name || pkg.assigned_doctor || 'Dr. Nidhi Jha';
    activeBookingData.doctorRole = pkg.doctor?.role || pkg.doctor?.expertise || 'Ayurveda Physician';
    activeBookingData.doctorInitials = pkg.doctor?.initials || 'DR';
    activeBookingData.startingPrice = pkg.price_formatted || ('₹' + pkg.price);
    activeBookingData.duration = pkg.duration || '3 Months';

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
      const res = await fetch(`api/packages.php?action=details&${queryParam}`);
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

    const checkoutType = localStorage.getItem('panchved_checkout_type');
    const workshopStored = localStorage.getItem('panchved_workshop_booking');
    const consultStored = localStorage.getItem('panchved_consultation_booking');

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

      if (data.patientName && displayPatientName) displayPatientName.textContent = data.patientName;
      if (data.patientEmail && displayPatientEmail) displayPatientEmail.textContent = data.patientEmail;
      if (data.patientPhone && displayPatientPhone) displayPatientPhone.textContent = data.patientPhone;

      if (data.patientName && editPatientName) editPatientName.value = data.patientName;
      if (data.patientEmail && editPatientEmail) editPatientEmail.value = data.patientEmail;
      if (data.patientPhone && editPatientPhone) editPatientPhone.value = data.patientPhone;

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

        if (data.patientName && displayPatientName) displayPatientName.textContent = data.patientName;
        if (data.patientEmail && displayPatientEmail) displayPatientEmail.textContent = data.patientEmail;
        if (data.patientPhone && displayPatientPhone) displayPatientPhone.textContent = data.patientPhone;

        if (data.patientName && editPatientName) editPatientName.value = data.patientName;
        if (data.patientEmail && editPatientEmail) editPatientEmail.value = data.patientEmail;
        if (data.patientPhone && editPatientPhone) editPatientPhone.value = data.patientPhone;

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

        if (data.patientName && displayPatientName) displayPatientName.textContent = data.patientName;
        if (data.patientEmail && displayPatientEmail) displayPatientEmail.textContent = data.patientEmail;
        if (data.patientPhone && displayPatientPhone) displayPatientPhone.textContent = data.patientPhone;

        if (data.patientName && editPatientName) editPatientName.value = data.patientName;
        if (data.patientEmail && editPatientEmail) editPatientEmail.value = data.patientEmail;
        if (data.patientPhone && editPatientPhone) editPatientPhone.value = data.patientPhone;
      }

      // Fetch dynamic fresh package and doctor data from SQL Database
      const targetId = qId || activeBookingData?.packageDbId || null;
      const targetPkgCode = qPkgId || activeBookingData?.packageId || null;
      const targetName = qName || cleanPackageTitle(activeBookingData?.packageTitle) || 'Reset Your Hormones';

      fetchPackageFromDB(targetId, targetPkgCode, targetName);
    }
  } catch (err) {
    console.warn('Notice: Unable to initialize checkout state:', err);
  }

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

      patientDetailsEditForm.style.display = 'none';
      patientDetailsView.style.display = 'block';

      showToast('Patient details updated successfully!');
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

      const pName = displayPatientName?.textContent.trim() || editPatientName?.value.trim() || 'Rahul Sharma';
      const pEmail = displayPatientEmail?.textContent.trim() || editPatientEmail?.value.trim() || 'rahulsharma@gmail.com';
      const pPhone = displayPatientPhone?.textContent.trim() || editPatientPhone?.value.trim() || '9876543210';
      const payMethod = getSelectedPaymentMethod();
      const currentPkgTitle = cleanPackageTitle(consultDetailsHeading?.textContent || activeBookingData?.packageTitle || 'Reset Your Hormones');

      let bookingId = '#' + Math.floor(100000 + Math.random() * 900000);

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
          amount: 500.00
        };

        const res = await fetch('api/packages.php', {
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
            if (resData.booking_id) {
              bookingId = resData.booking_id;
            }

            // Update cached patient profile in localStorage with new package
            try {
              const currentPatient = JSON.parse(localStorage.getItem('panchved_patient') || '{}');
              currentPatient.package_name = resData.package_name || bookingPayload.package_name;
              currentPatient.full_name = pName;
              currentPatient.email = pEmail;
              currentPatient.phone_number = pPhone;
              if (resData.patient_id) currentPatient.patient_id = resData.patient_id;
              localStorage.setItem('panchved_patient', JSON.stringify(currentPatient));
            } catch (e) {}
          }
        }
      } catch (backendErr) {
        console.warn('Backend sync notice:', backendErr);
      }

      setTimeout(() => {
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.style.opacity = '1';
        confirmPaymentBtn.innerHTML = originalHtml;

        if (receiptBookingId) {
          receiptBookingId.textContent = bookingId;
        }

        // Open Screen 5: Booking Success Modal
        if (bookingSuccessModal) {
          bookingSuccessModal.classList.add('active');
          bookingSuccessModal.setAttribute('aria-hidden', 'false');
          document.body.style.overflow = 'hidden';
        }

        showToast('Payment successful! Booking confirmed.');
      }, 600);
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
        window.location.href = 'package.html';
      } else if (isWorkshopCheckout) {
        window.location.href = 'courses.html#my-workshops';
      } else {
        window.location.href = 'dashboard.html';
      }
    });
  }
});
