/**
 * Ocayur Patient Portal - Courses & Workshop Checkout Engine
 * Dynamic Database Backend Integration with MySQL workshops table and PHP APIs
 * Real-time bidirectional profile synchronization with user profile settings.
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
  let selectedPaymentMethod = 'PayU';

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

    if (activeWorkshopData) {
      if (fullName) activeWorkshopData.patientName = fullName;
      if (email) activeWorkshopData.patientEmail = email;
      if (phone) activeWorkshopData.patientPhone = phone;
    }
  };

  // Synchronize authenticated user header details & Your Details section
  const applyUserHeader = (user, patient) => {
    const fullName = patient?.full_name || user?.full_name || 'Patient';
    const patientId = patient?.patient_id || (user?.id ? 'P00' + user.id : '--');

    const userName = document.getElementById('userName');
    if (userName) userName.textContent = fullName;
    const patientIdEl = document.getElementById('patientId');
    if (patientIdEl) patientIdEl.textContent = patientId;

    const upc = document.getElementById('userProfileCard');
    if (upc) upc.setAttribute('aria-label', `User profile: ${fullName}, Patient ID ${patientId}`);
    const mua = document.querySelector('.mobile-user-avatar');
    if (mua) mua.setAttribute('title', `${fullName} (${patientId})`);

    // Automatically update the "Your Details" section with user profile data
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

    const wsTitle = data.workshopTitle || data.title || 'Ayurveda Workshop';

    let speaker = data.doctorName || data.speaker || data.assign_speaker || data.instructor || '';
    if (speaker) {
      if (!speaker.toLowerCase().startsWith('by ')) {
        speaker = `By ${speaker}`;
      }
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

    if (checkoutWorkshopTitle) checkoutWorkshopTitle.textContent = wsTitle;
    if (checkoutWorkshopSpeaker) checkoutWorkshopSpeaker.textContent = speaker;
    if (checkoutDateVal) checkoutDateVal.textContent = date;
    if (checkoutTimeVal) checkoutTimeVal.textContent = time;

    if (checkoutSummaryFee) checkoutSummaryFee.textContent = formattedPrice;
    if (checkoutSummaryTotal) checkoutSummaryTotal.textContent = formattedPrice;

    // Prioritize current profile details
    const storedUserObj = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
    const storedPatientObj = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
    const currentProfileName = storedPatientObj?.full_name || storedUserObj?.full_name;
    const currentProfileEmail = storedPatientObj?.email || storedUserObj?.email;
    const currentProfilePhone = storedPatientObj?.phone_number || storedUserObj?.phone_number;

    const patName = currentProfileName || data.patientName || 'Patient';
    const patEmail = currentProfileEmail || data.patientEmail || '';
    const patPhone = currentProfilePhone || data.patientPhone || '';

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
      const stored = (localStorage.getItem('ocayur_workshop_booking') || localStorage.getItem('panchved_workshop_booking'));
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
              image_url: ws.image_url || activeWorkshopData?.image_url || '',
              doctorName: ws.speaker || ws.assign_speaker || ws.instructor || '',
              speaker: ws.speaker || ws.assign_speaker || ws.instructor || '',
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
      const storedUserObj = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
      const storedPatientObj = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
      const pName = storedPatientObj?.full_name || storedUserObj?.full_name || 'Patient';
      const pEmail = storedPatientObj?.email || storedUserObj?.email || '';
      const pPhone = storedPatientObj?.phone_number || storedUserObj?.phone_number || '';

      renderWorkshopData({
        workshopTitle: 'Ayurveda Workshop',
        doctorName: 'Ayurveda Expert',
        date: '--',
        time: '--',
        price: 0.00,
        patientName: pName,
        patientEmail: pEmail,
        patientPhone: pPhone
      });
    }

    if (activeWorkshopData) {
      await checkAlreadyRegisteredStatus(activeWorkshopData);
    }
  };

  let isAlreadyRegisteredForActiveWorkshop = false;

  const applyAlreadyRegisteredCheckoutUI = (bookingInfo) => {
    isAlreadyRegisteredForActiveWorkshop = true;

    // Show warning banner
    let banner = document.getElementById('checkoutAlreadyRegisteredAlert');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'checkoutAlreadyRegisteredAlert';
      banner.className = 'checkout-already-registered-alert';
      banner.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" style="flex-shrink: 0; margin-top: 2px;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <div>
          <strong>You are already enrolled in this workshop!</strong>
          <p>Your registration for this workshop is already confirmed. Re-registering or paying again is not required.</p>
          <div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
            <a href="courses.html#my-workshops" class="btn-goto-my-workshops" style="padding: 8px 16px; font-size: 13px;">View in My Workshops</a>
            <a href="courses.html" class="btn-goto-my-workshops" style="padding: 8px 16px; font-size: 13px;">Back to Workshops</a>
          </div>
        </div>
      `;
      const container = document.querySelector('.checkout-container') || document.querySelector('.checkout-grid') || document.querySelector('main');
      if (container) {
        container.insertBefore(banner, container.firstChild);
      }
    }

    // Disable Confirm Payment Button
    if (confirmPaymentBtn) {
      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.style.backgroundColor = '#059669';
      confirmPaymentBtn.style.opacity = '0.85';
      confirmPaymentBtn.style.cursor = 'not-allowed';
      confirmPaymentBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span style="margin-left: 8px;">Already Registered</span>
      `;
    }
  };

  const checkAlreadyRegisteredStatus = async (ws) => {
    if (!ws) return false;
    const wsId = ws.workshopId || ws.workshop_id || ws.id;
    const wsTitle = ws.workshopTitle || ws.title;

    // 1. Check local storage
    try {
      const storedList = JSON.parse((localStorage.getItem('ocayur_registered_workshops') || localStorage.getItem('panchved_registered_workshops')) || '[]');
      const matchInLocal = storedList.some(item => 
        (wsId && (item.id == wsId || item.workshop_id == wsId)) ||
        (wsTitle && item.title && item.title.trim().toLowerCase() === wsTitle.trim().toLowerCase())
      );
      if (matchInLocal) {
        applyAlreadyRegisteredCheckoutUI();
        return true;
      }
    } catch (e) {}

    // 2. Query backend API action=check_registration
    try {
      const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
      const storedPat = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
      const pPhone = storedPat?.phone_number || storedUser?.phone_number || cachedPhone;
      const pEmail = storedPat?.email || storedUser?.email;
      const pId = storedPat?.id || storedUser?.id || cachedPatientId;

      const params = new URLSearchParams();
      params.append('action', 'check_registration');
      if (wsId) params.append('workshop_id', wsId);
      if (ws.id) params.append('id', ws.id);
      if (wsTitle) params.append('title', wsTitle);
      if (pPhone) params.append('phone', pPhone);
      if (pEmail) params.append('email', pEmail);
      if (pId) params.append('patient_id', pId);

      const res = await fetch(`../api/workshops.php?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.is_registered) {
          applyAlreadyRegisteredCheckoutUI(data.booking);
          return true;
        }
      }
    } catch (err) {}

    return false;
  };

  initCheckoutData();

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

      // Also update workshop booking cache if present
      const workshopStored = JSON.parse((localStorage.getItem('ocayur_workshop_booking') || localStorage.getItem('panchved_workshop_booking')) || '{}');
      if (workshopStored && typeof workshopStored === 'object') {
        workshopStored.patientName = name;
        workshopStored.patientEmail = email;
        workshopStored.patientPhone = phone;
        localStorage.setItem('ocayur_workshop_booking', JSON.stringify(workshopStored));
      }

      // Also update consultation booking cache if present
      const consultStored = JSON.parse((localStorage.getItem('ocayur_consultation_booking') || localStorage.getItem('panchved_consultation_booking')) || '{}');
      if (consultStored && typeof consultStored === 'object') {
        consultStored.patientName = name;
        consultStored.patientEmail = email;
        consultStored.patientPhone = phone;
        localStorage.setItem('ocayur_consultation_booking', JSON.stringify(consultStored));
      }
    } catch (e) {
      console.warn('LocalStorage profile sync notice:', e);
    }

    // 2. Update page header user badge & greeting
    applyUserHeader(updatedUser, updatedPatient);

    // 3. Update active workshop booking state
    if (activeWorkshopData) {
      activeWorkshopData.patientName = name;
      activeWorkshopData.patientEmail = email;
      activeWorkshopData.patientPhone = phone;
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

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        showToast('Please enter a valid email address.', true);
        editPatientEmail?.focus();
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

      if (isAlreadyRegisteredForActiveWorkshop) {
        showToast('You are already registered for this workshop.', true);
        return;
      }

      const wsTitle = checkoutWorkshopTitle?.textContent.trim() || activeWorkshopData?.workshopTitle || 'Ayurveda Workshop';
      const dateText = checkoutDateVal?.textContent.trim() || activeWorkshopData?.date || '--';
      const timeText = checkoutTimeVal?.textContent.trim() || activeWorkshopData?.time || '--';
      const feeText = checkoutSummaryTotal?.textContent.trim() || '₹0.00';
      const numericAmount = parseFloat(feeText.replace(/[^0-9.]/g, '')) || 0.00;

      const patName = displayPatientName?.textContent.trim() || editPatientName?.value.trim() || 'Patient';
      const patEmail = displayPatientEmail?.textContent.trim() || editPatientEmail?.value.trim() || '';
      const patPhone = displayPatientPhone?.textContent.trim() || editPatientPhone?.value.trim() || '';

      // Keep user profile up to date
      await syncUpdatedProfileDetails(patName, patEmail, patPhone);

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

      const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
      const storedPat = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
      const pId = storedPat?.id || storedUser?.id || activeWorkshopData?.patient_id || activeWorkshopData?.patientId || 1;

      const payload = {
        action: 'register',
        workshop_id: activeWorkshopData?.workshopId || activeWorkshopData?.id || 'WS-002',
        id: activeWorkshopData?.id || 1,
        workshop_title: wsTitle,
        patient_id: pId,
        patient_name: patName,
        patient_email: patEmail,
        patient_phone: patPhone,
        amount: numericAmount,
        payment_method: selectedPaymentMethod,
        date: dateText,
        time: timeText
      };

      // Process with PayU Payment Gateway if selected
      const isPayU = (selectedPaymentMethod.toLowerCase().includes('payu') || selectedPaymentMethod.toLowerCase() === 'payu');
      if (isPayU && window.PayUCheckout) {
        try {
          const payuPayload = {
            service_type: 'workshop',
            workshop_id: activeWorkshopData?.workshopId || activeWorkshopData?.id || 'WS-002',
            workshop_title: wsTitle,
            item_id: activeWorkshopData?.id || 1,
            patient_id: pId,
            patient_name: patName,
            patient_email: patEmail,
            patient_phone: patPhone,
            amount: numericAmount,
            date: dateText,
            time: timeText
          };

          const res = await window.PayUCheckout.processPayment(payuPayload);
          if (res && res.redirected) {
            return; // Browser redirected to PayU gateway
          }
        } catch (payuErr) {
          console.error('PayU Workshop Error:', payuErr);
          showToast(payuErr.message || 'Payment initiation failed. Please try again.', true);
          confirmPaymentBtn.disabled = false;
          confirmPaymentBtn.style.opacity = '1';
          confirmPaymentBtn.innerHTML = originalHtml;
          return;
        }
      }

      let registrationError = null;
      try {
        const res = await fetch('../api/workshops.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          registrationError = data?.message || 'Could not complete registration. Please try again.';
          if (data?.already_registered) {
            applyAlreadyRegisteredCheckoutUI(data);
          }
        } else if (data && data.success && data.booking_id) {
          generatedBookingId = data.booking_id;
        }
      } catch (err) {
        registrationError = 'Network error during registration. Please check your connection.';
      }

      if (registrationError) {
        confirmPaymentBtn.disabled = isAlreadyRegisteredForActiveWorkshop;
        confirmPaymentBtn.style.opacity = isAlreadyRegisteredForActiveWorkshop ? '0.85' : '1';
        if (!isAlreadyRegisteredForActiveWorkshop) {
          confirmPaymentBtn.innerHTML = originalHtml;
        }
        showToast(registrationError, true);
        return;
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
        const storedList = JSON.parse((localStorage.getItem('ocayur_registered_workshops') || localStorage.getItem('panchved_registered_workshops')) || '[]');
        const actualWsId = activeWorkshopData?.id || (data && data.workshop_id) || activeWorkshopData?.workshopId || 1;
        const actualWsCode = activeWorkshopData?.workshopId || activeWorkshopData?.workshop_id || '';
        const newWorkshopItem = {
          id: actualWsId,
          workshop_id: actualWsId,
          ws_code: actualWsCode,
          booking_id: generatedBookingId,
          title: wsTitle,
          workshopTitle: wsTitle,
          price: feeText,
          date: dateText,
          time: timeText,
          meet_link: activeWorkshopData?.meet_link || 'https://meet.google.com/abc-xyz-pqrs',
          image_url: activeWorkshopData?.image_url || ''
        };
        const filteredList = storedList.filter(item => 
          !(item.booking_id && item.booking_id === generatedBookingId) &&
          !(item.workshop_id && actualWsId && item.workshop_id == actualWsId) &&
          !(item.title && wsTitle && item.title.trim().toLowerCase() === wsTitle.trim().toLowerCase())
        );
        filteredList.unshift(newWorkshopItem);
        localStorage.setItem('ocayur_registered_workshops', JSON.stringify(filteredList));
        localStorage.setItem('panchved_registered_workshops', JSON.stringify(filteredList));
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

  // Re-sync when switching back to the course checkout tab
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
