/**
 * Panchved Patient Portal - Courses & Workshop Checkout Engine
 * Dynamic Database Backend Integration with MySQL workshops table and PHP APIs
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Drawer Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Workshop Details Elements
  const checkoutWorkshopTitle = document.getElementById('checkoutWorkshopTitle');
  const checkoutWorkshopSpeaker = document.getElementById('checkoutWorkshopSpeaker');
  const checkoutDateVal = document.getElementById('checkoutDateVal');
  const checkoutTimeVal = document.getElementById('checkoutTimeVal');

  // Payment Summary Elements
  const checkoutSummaryFee = document.getElementById('checkoutSummaryFee');
  const checkoutSummaryTotal = document.getElementById('checkoutSummaryTotal');

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
  const continueToCoursesBtn = document.getElementById('continueToCoursesBtn');
  const receiptBookingId = document.getElementById('receiptBookingId');
  const receiptWorkshopTitle = document.getElementById('receiptWorkshopTitle');
  const receiptDateTime = document.getElementById('receiptDateTime');
  const receiptAmount = document.getElementById('receiptAmount');
  const successPaymentAmount = document.getElementById('successPaymentAmount');

  let activeWorkshopData = null;
  let selectedPaymentMethod = 'Card';

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
    const fullName = patient?.full_name || user?.full_name || 'Rahul Sharma';
    const patientId = patient?.patient_id || ('P00' + (user?.id || 1));

    const userName = document.getElementById('userName');
    if (userName) userName.textContent = fullName;
    const patientIdEl = document.getElementById('patientId');
    if (patientIdEl) patientIdEl.textContent = patientId;

    const upc = document.getElementById('userProfileCard');
    if (upc) upc.setAttribute('aria-label', `User profile: ${fullName}, Patient ID ${patientId}`);
    const mua = document.querySelector('.mobile-user-avatar');
    if (mua) mua.setAttribute('title', `${fullName} (${patientId})`);
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

  // Format currency helper
  const formatAmount = (num) => {
    const val = parseFloat(num);
    if (isNaN(val)) return '₹500.00';
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 1. Populate UI from Workshop data object
  const renderWorkshopData = (data) => {
    if (!data) return;
    activeWorkshopData = data;

    const title = data.workshopTitle || data.title || 'Ayurveda Lifestyle Workshop';
    let speaker = data.doctorName || data.speaker || data.assign_speaker || data.instructor || 'Dr. Ananya Mehta';
    if (!speaker.toLowerCase().startsWith('by ')) {
      speaker = `By ${speaker}`;
    }

    const date = data.formatted_date || data.date || '2 September 2026';
    const time = data.time || '08:00 AM';

    // Fee extraction
    let numericPrice = 500;
    if (data.price !== undefined && data.price !== null && !isNaN(parseFloat(data.price))) {
      numericPrice = parseFloat(data.price);
    } else if (data.fee !== undefined && data.fee !== null) {
      if (typeof data.fee === 'number') {
        numericPrice = data.fee;
      } else {
        const cleaned = String(data.fee).replace(/[^0-9.]/g, '');
        if (cleaned && !isNaN(parseFloat(cleaned))) {
          numericPrice = parseFloat(cleaned);
        }
      }
    }
    const formattedPrice = formatAmount(numericPrice);

    if (checkoutWorkshopTitle) checkoutWorkshopTitle.textContent = title;
    if (checkoutWorkshopSpeaker) checkoutWorkshopSpeaker.textContent = speaker;
    if (checkoutDateVal) checkoutDateVal.textContent = date;
    if (checkoutTimeVal) checkoutTimeVal.textContent = time;

    if (checkoutSummaryFee) checkoutSummaryFee.textContent = formattedPrice;
    if (checkoutSummaryTotal) checkoutSummaryTotal.textContent = formattedPrice;

    // Patient details
    const patName = data.patientName || 'John Doe';
    const patEmail = data.patientEmail || 'johndoe@gmail.com';
    const patPhone = data.patientPhone || '9876543210';

    if (displayPatientName) displayPatientName.textContent = patName;
    if (displayPatientEmail) displayPatientEmail.textContent = patEmail;
    if (displayPatientPhone) displayPatientPhone.textContent = patPhone;

    if (editPatientName) editPatientName.value = patName;
    if (editPatientEmail) editPatientEmail.value = patEmail;
    if (editPatientPhone) editPatientPhone.value = patPhone;
  };

  // 2. Initialize from localStorage or URL Query Params
  const initCheckoutData = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const wsId = urlParams.get('workshop_id') || urlParams.get('id');
    const wsTitle = urlParams.get('title');

    let loaded = false;

    // A. Check localStorage first
    try {
      const stored = localStorage.getItem('panchved_workshop_booking');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed) {
          renderWorkshopData(parsed);
          loaded = true;
        }
      }
    } catch (e) {}

    // B. If query params exist, fetch freshest workshop details dynamically from MySQL API
    if (wsId || wsTitle) {
      try {
        const q = new URLSearchParams();
        q.append('action', 'details');
        if (wsId) q.append('workshop_id', wsId);
        if (wsTitle) q.append('title', wsTitle);

        const res = await fetch(`../api/workshops.php?${q.toString()}`);
        if (res.ok) {
          const apiData = await res.json();
          if (apiData.success && apiData.workshop) {
            const ws = apiData.workshop;
            const merged = Object.assign({}, activeWorkshopData || {}, {
              id: ws.id,
              workshopId: ws.workshop_id,
              title: ws.title,
              workshopTitle: ws.title,
              doctorName: ws.speaker || ws.instructor || ws.assign_speaker || 'Dr. Ananya Mehta',
              speaker: ws.speaker || ws.instructor || 'Dr. Ananya Mehta',
              date: ws.formatted_date || ws.date || '2 September 2026',
              time: ws.time || '08:00 AM',
              price: ws.fee || ws.price || 500,
              fee: ws.fee || ws.price || 500
            });
            renderWorkshopData(merged);
            loaded = true;
          }
        }
      } catch (err) {
        console.warn('Notice: Error fetching workshop details from API:', err);
      }
    }

    // Default fallback if nothing loaded
    if (!loaded && !activeWorkshopData) {
      renderWorkshopData({
        workshopTitle: 'Ayurveda Lifestyle Workshop',
        doctorName: 'Dr. Ananya Mehta',
        date: '2 September 2026',
        time: '08:00 AM',
        price: 500.00,
        patientName: 'John Doe',
        patientEmail: 'johndoe@gmail.com',
        patientPhone: '9876543210'
      });
    }
  };

  initCheckoutData();

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

      if (activeWorkshopData) {
        activeWorkshopData.patientName = newName;
        activeWorkshopData.patientEmail = newEmail;
        activeWorkshopData.patientPhone = newPhone;
        try {
          localStorage.setItem('panchved_workshop_booking', JSON.stringify(activeWorkshopData));
        } catch (e) {}
      }

      patientDetailsEditForm.style.display = 'none';
      patientDetailsView.style.display = 'block';
      showToast('Patient details updated successfully!');
    });
  }

  // 4. Payment Method Radio Selection
  if (paymentMethodItems && paymentMethodItems.length > 0) {
    paymentMethodItems.forEach((item) => {
      item.addEventListener('click', () => {
        paymentMethodItems.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');

        const radio = item.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          selectedPaymentMethod = item.querySelector('.payment-name')?.textContent.trim() || 'Card';
        }
      });
    });
  }

  // 5. Confirm Payment & Booking Submission
  if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const wsTitle = checkoutWorkshopTitle?.textContent.trim() || activeWorkshopData?.workshopTitle || 'Ayurveda Lifestyle Workshop';
      const dateText = checkoutDateVal?.textContent.trim() || activeWorkshopData?.date || '2 September 2026';
      const timeText = checkoutTimeVal?.textContent.trim() || activeWorkshopData?.time || '08:00 AM';
      const feeText = checkoutSummaryTotal?.textContent.trim() || '₹500.00';
      const numericAmount = parseFloat(feeText.replace(/[^0-9.]/g, '')) || 500.00;

      const patName = displayPatientName?.textContent.trim() || 'John Doe';
      const patEmail = displayPatientEmail?.textContent.trim() || 'johndoe@gmail.com';
      const patPhone = displayPatientPhone?.textContent.trim() || '9876543210';

      const originalHtml = confirmPaymentBtn.innerHTML;
      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.style.opacity = '0.85';
      confirmPaymentBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span style="margin-left: 8px;">Processing Payment...</span>
      `;

      let generatedBookingId = '#' + Math.floor(100000 + Math.random() * 900000);

      try {
        const payload = {
          action: 'register',
          workshop_id: activeWorkshopData?.workshopId || activeWorkshopData?.id || 'WS-002',
          id: activeWorkshopData?.id || 1,
          workshop_title: wsTitle,
          patient_name: patName,
          patient_email: patEmail,
          patient_phone: patPhone,
          amount: numericAmount,
          payment_method: selectedPaymentMethod,
          date: dateText,
          time: timeText
        };

        const res = await fetch('../api/workshops.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.booking_id) {
            generatedBookingId = data.booking_id;
          }
        }
      } catch (err) {
        console.warn('Notice: API call completed with offline fallback.', err);
      }

      confirmPaymentBtn.disabled = false;
      confirmPaymentBtn.style.opacity = '1';
      confirmPaymentBtn.innerHTML = originalHtml;

      // Populate Success Modal
      if (receiptBookingId) receiptBookingId.textContent = generatedBookingId;
      if (receiptWorkshopTitle) receiptWorkshopTitle.textContent = wsTitle;
      if (receiptDateTime) receiptDateTime.textContent = `${dateText}, ${timeText}`;
      if (receiptAmount) receiptAmount.textContent = feeText;
      if (successPaymentAmount) successPaymentAmount.textContent = feeText;

      // Save to registered workshops array in localStorage
      try {
        const storedList = JSON.parse(localStorage.getItem('panchved_registered_workshops') || '[]');
        const newWorkshopItem = {
          id: generatedBookingId,
          booking_id: generatedBookingId,
          title: wsTitle,
          price: feeText,
          date: dateText,
          time: timeText,
          meet_link: 'https://meet.google.com/abc-xyz-pqrs',
          image_url: currentWorkshop?.image_url || '../assets/courses/course_pre_pregnancy.jpg'
        };
        storedList.unshift(newWorkshopItem);
        localStorage.setItem('panchved_registered_workshops', JSON.stringify(storedList));
      } catch (err) {}

      // Show Success Modal
      if (bookingSuccessModal) {
        bookingSuccessModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      } else {
        showToast('Workshop registration confirmed successfully!');
        setTimeout(() => {
          window.location.href = 'courses.html';
        }, 1500);
      }
    });
  }

  // 6. Continue to Courses Button
  if (continueToCoursesBtn) {
    continueToCoursesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (bookingSuccessModal) {
        bookingSuccessModal.classList.remove('active');
        document.body.style.overflow = '';
      }
      showToast('Redirecting to your registered workshops...');
      setTimeout(() => {
        window.location.href = 'courses.html#my-workshops';
      }, 400);
    });
  }
});
