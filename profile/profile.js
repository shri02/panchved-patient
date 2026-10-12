/**
 * Ocayur Patient Portal - Dynamic Profile Settings Engine
 * Handles dynamic data fetching from database via PHP API,
 * profile details update, secure password change, and session state.
 */

document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const profileForm = document.getElementById('profileSettingsForm');
  const updateBtn = document.getElementById('updateProfileBtn');
  const changePasswordForm = document.getElementById('changePasswordForm');
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Input Elements
  const fnInput = document.getElementById('profileFullName');
  const dobInput = document.getElementById('profileDob');
  const profileDobCalendarBtn = document.getElementById('profileDobCalendarBtn');
  const profileDobNativePicker = document.getElementById('profileDobNativePicker');
  const phInput = document.getElementById('profilePhone');
  const gInput = document.getElementById('profileGender');
  const emInput = document.getElementById('profileEmail');

  // Name Input Validation: Restrict numbers (0-9)
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
  restrictNameInput(fnInput);

  // Phone Input: Restrict to 10 digits
  if (phInput) {
    phInput.addEventListener('input', () => {
      phInput.value = phInput.value.replace(/\D/g, '').slice(0, 10);
    });
  }

  // Date of Birth: Restrict calendar picker to current date (disable future dates)
  const setProfileDobMaxDate = () => {
    if (profileDobNativePicker) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      profileDobNativePicker.max = `${yyyy}-${mm}-${dd}`;
    }
  };
  setProfileDobMaxDate();

  // Helper: Auto Calculate Exact Age from Date of Birth
  const profileDobAgeBadge = document.getElementById('profileDobAgeBadge');
  const profileDobAgeValue = document.getElementById('profileDobAgeValue');

  const calculateExactAge = (dobStr) => {
    if (!dobStr) return null;
    let d, m, y;
    const match = String(dobStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      d = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
      y = parseInt(match[3], 10);
      if (match[3].length === 2) {
        const currentShort = new Date().getFullYear() % 100;
        y = y > currentShort ? (1900 + y) : (2000 + y);
      }
    } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(String(dobStr).trim())) {
      const parts = String(dobStr).trim().split('-').map(Number);
      y = parts[0];
      m = parts[1];
      d = parts[2];
    } else {
      return null;
    }

    if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null;

    const birthDate = new Date(y, m - 1, d);
    if (birthDate.getFullYear() !== y || birthDate.getMonth() !== (m - 1) || birthDate.getDate() !== d) {
      return null;
    }

    const today = new Date();
    if (birthDate > today) return null;

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return Math.max(0, age);
  };

  const updateProfileDobAgeBadge = (val) => {
    const age = calculateExactAge(val);
    if (age !== null && !isNaN(age) && profileDobAgeBadge && profileDobAgeValue) {
      profileDobAgeValue.textContent = age;
      profileDobAgeBadge.style.display = 'inline-flex';
    } else if (profileDobAgeBadge) {
      profileDobAgeBadge.style.display = 'none';
    }
  };

  if (dobInput) {
    dobInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 8) val = val.substring(0, 8);

      let formatted = '';
      if (val.length > 0) formatted += val.substring(0, 2);
      if (val.length > 2) formatted += '/' + val.substring(2, 4);
      if (val.length > 4) formatted += '/' + val.substring(4, 8);

      dobInput.value = formatted;
      updateProfileDobAgeBadge(formatted);
    });
  }

  // Calendar Icon Button Handler for Date of Birth
  if (profileDobCalendarBtn && profileDobNativePicker) {
    profileDobCalendarBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setProfileDobMaxDate();

      // Sync current text input value into native date picker if valid
      if (dobInput && dobInput.value) {
        const textVal = dobInput.value.trim();
        const parts = textVal.split('/');
        if (parts.length === 3 && parts[2].length === 4) {
          const d = parts[0].padStart(2, '0');
          const m = parts[1].padStart(2, '0');
          const y = parts[2];
          const isoDate = `${y}-${m}-${d}`;
          if (!profileDobNativePicker.max || isoDate <= profileDobNativePicker.max) {
            profileDobNativePicker.value = isoDate;
          }
        }
      }

      try {
        if (typeof profileDobNativePicker.showPicker === 'function') {
          profileDobNativePicker.showPicker();
        } else {
          profileDobNativePicker.focus();
          profileDobNativePicker.click();
        }
      } catch (err) {
        profileDobNativePicker.focus();
        profileDobNativePicker.click();
      }
    });

    profileDobNativePicker.addEventListener('change', () => {
      if (!profileDobNativePicker.value) return;
      if (profileDobNativePicker.max && profileDobNativePicker.value > profileDobNativePicker.max) {
        profileDobNativePicker.value = profileDobNativePicker.max;
      }
      const parts = profileDobNativePicker.value.split('-'); // YYYY-MM-DD
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        if (dobInput) {
          dobInput.value = `${day}/${month}/${year}`;
          updateProfileDobAgeBadge(dobInput.value);
        }
      }
    });
  }

  // Header Elements
  const unEl = document.getElementById('userName');
  const pidEl = document.getElementById('patientId');
  const ugEl = document.getElementById('userGreeting');
  const userProfileCard = document.getElementById('userProfileCard');
  const mobileUserAvatar = document.querySelector('.mobile-user-avatar');

  // Helper: Toast Notification
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

  // Populate UI with profile data
  const applyProfileData = (userData, patientData) => {
    const fullName = patientData?.full_name || userData?.full_name;
    const phone = patientData?.phone_number || userData?.phone_number;
    const email = patientData?.email || userData?.email;
    const dob = patientData?.dob_formatted || patientData?.dob;
    const gender = patientData?.gender || 'Male';
    const patientId = patientData?.patient_id || ('P' + strPad(userData?.id || 1, 3));

    if (fullName) {
      if (fnInput) fnInput.value = fullName;
      if (unEl) unEl.textContent = fullName;
      if (ugEl) ugEl.textContent = `Good Morning ${fullName}!`;
      if (userProfileCard) userProfileCard.setAttribute('aria-label', `User profile: ${fullName}, Patient ID ${patientId}`);
      if (mobileUserAvatar) mobileUserAvatar.setAttribute('title', `${fullName} (${patientId})`);
    }
    if (phone && phInput) {
      phInput.value = phone;
    }
    if (email && emInput) {
      emInput.value = email;
    }
    if (dob && dobInput) {
      // If dob is YYYY-MM-DD, format to DD/MM/YYYY
      if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        const [y, m, d] = dob.split('-');
        dobInput.value = `${d}/${m}/${y}`;
      } else {
        dobInput.value = dob;
      }
      updateProfileDobAgeBadge(dobInput.value);
    }
    if (gender && gInput) {
      const matchOpt = Array.from(gInput.options || []).find(
        opt => opt.value.toLowerCase() === gender.toLowerCase()
      );
      if (matchOpt) {
        gInput.value = matchOpt.value;
      } else {
        gInput.value = gender;
      }
    }
    if (patientId && pidEl) {
      pidEl.textContent = patientId;
    }
  };

  function strPad(n, width) {
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
  }

  // Step 1: Pre-populate immediately from localStorage cache (instant render)
  let cachedPhone = '';
  let cachedPatientId = '';
  try {
    const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
    const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
    if (storedUser || storedPatient) {
      applyProfileData(storedUser, storedPatient);
      cachedPhone = storedPatient?.phone_number || storedUser?.phone_number || '';
      cachedPatientId = storedPatient?.patient_id || '';
    }
  } catch (err) {
    console.warn('Unable to load cached profile session', err);
  }

  // Step 2: Dynamically fetch fresh patient & user account info from MySQL Database via PHP
  const fetchProfileFromDatabase = async () => {
    try {
      const params = new URLSearchParams();
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);

      const queryUrl = '../api/profile.php' + (params.toString() ? `?${params.toString()}` : '');

      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Profile API returned HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success && (result.patient || result.user)) {
        applyProfileData(result.user, result.patient);

        // Update localStorage with fresh DB data
        if (result.user) {
          try { localStorage.setItem('ocayur_user', JSON.stringify(result.user)); } catch (e) {}
        }
        if (result.patient) {
          try { localStorage.setItem('ocayur_patient', JSON.stringify(result.patient)); } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('Dynamic profile fetch notice:', err);
    }
  };

  // Execute dynamic database fetch
  fetchProfileFromDatabase();

  // Profile Form Submission (Update Profile in Database)
  if (profileForm && updateBtn) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullName = fnInput ? fnInput.value.trim() : '';
      const email = emInput ? emInput.value.trim() : '';
      const phone = phInput ? phInput.value.trim() : '';
      const dob = dobInput ? dobInput.value.trim() : '';
      const gender = gInput ? gInput.value.trim() : 'Male';

      if (!fullName) {
        showToast('Please enter your full name.', true);
        fnInput?.focus();
        return;
      }

      if (/\d/.test(fullName)) {
        showToast('Full name should not contain numbers.', true);
        fnInput?.focus();
        return;
      }

      if (!dob) {
        showToast('Please enter your date of birth.', true);
        dobInput?.focus();
        return;
      }

      // Check for future date in DOB
      if (dob) {
        let dobDate = null;
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dob)) {
          const [d, m, y] = dob.split('/');
          dobDate = new Date(`${y}-${m}-${d}`);
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
          dobDate = new Date(dob);
        }
        if (dobDate && !isNaN(dobDate.getTime())) {
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          if (dobDate > today) {
            showToast('Date of birth cannot be in the future.', true);
            dobInput?.focus();
            return;
          }
        }
      }

      if (!phone) {
        showToast('Please enter your phone number.', true);
        phInput?.focus();
        return;
      }

      if (!gender) {
        showToast('Please select your gender.', true);
        gInput?.focus();
        return;
      }

      if (!email) {
        showToast('Please enter your email address.', true);
        emInput?.focus();
        return;
      }

      const originalHtml = updateBtn.innerHTML;
      updateBtn.disabled = true;
      updateBtn.style.opacity = '0.85';
      updateBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Updating...</span>
      `;

      try {
        const response = await fetch('../api/profile.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            action: 'update_profile',
            fullName: fullName,
            email: email,
            phone: phone,
            dob: dob,
            age: calculateExactAge(dob),
            gender: gender
          })
        });

        const result = await response.json();

        updateBtn.disabled = false;
        updateBtn.style.opacity = '1';
        updateBtn.innerHTML = originalHtml;

        if (response.ok && result.success) {
          const freshUser = result.user || { full_name: fullName, email: email, phone_number: phone };
          const freshPatient = result.patient || { full_name: fullName, email: email, phone_number: phone, dob: dob, gender: gender };

          if (result.user) {
            try { localStorage.setItem('ocayur_user', JSON.stringify(result.user)); } catch (e) {}
          } else {
            try { localStorage.setItem('ocayur_user', JSON.stringify(freshUser)); } catch (e) {}
          }
          if (result.patient) {
            try { localStorage.setItem('ocayur_patient', JSON.stringify(result.patient)); } catch (e) {}
          } else {
            try { localStorage.setItem('ocayur_patient', JSON.stringify(freshPatient)); } catch (e) {}
          }

          // Update booking storage caches so package checkout page immediately gets the updated user details
          try {
            const consultStored = JSON.parse((localStorage.getItem('ocayur_consultation_booking') || localStorage.getItem('panchved_consultation_booking')) || '{}');
            if (consultStored && typeof consultStored === 'object' && Object.keys(consultStored).length > 0) {
              consultStored.patientName = fullName;
              consultStored.patientEmail = email;
              consultStored.patientPhone = phone;
              localStorage.setItem('ocayur_consultation_booking', JSON.stringify(consultStored));
            }
            const workshopStored = JSON.parse((localStorage.getItem('ocayur_workshop_booking') || localStorage.getItem('panchved_workshop_booking')) || '{}');
            if (workshopStored && typeof workshopStored === 'object' && Object.keys(workshopStored).length > 0) {
              workshopStored.patientName = fullName;
              workshopStored.patientEmail = email;
              workshopStored.patientPhone = phone;
              localStorage.setItem('ocayur_workshop_booking', JSON.stringify(workshopStored));
            }
          } catch (e) {}

          if (unEl) unEl.textContent = fullName;
          if (ugEl) ugEl.textContent = `Good Morning ${fullName}!`;

          showToast(result.message || 'Profile updated successfully!');
        } else {
          showToast(result.message || 'Failed to update profile.', true);
        }
      } catch (err) {
        console.error('Update profile network error:', err);
        updateBtn.disabled = false;
        updateBtn.style.opacity = '1';
        updateBtn.innerHTML = originalHtml;
        showToast('Network error while updating profile. Please try again.', true);
      }
    });
  }

  // Password Visibility Toggle Handler
  const setupPasswordToggle = (toggleBtnId, inputId) => {
    const toggleBtn = document.getElementById(toggleBtnId);
    const input = document.getElementById(inputId);
    if (!toggleBtn || !input) return;

    toggleBtn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const eyeOffIcon = toggleBtn.querySelector('.eye-off-icon');
      const eyeOnIcon = toggleBtn.querySelector('.eye-on-icon');

      if (eyeOffIcon && eyeOnIcon) {
        eyeOffIcon.style.display = isPassword ? 'none' : 'block';
        eyeOnIcon.style.display = isPassword ? 'block' : 'none';
      }
    });
  };

  setupPasswordToggle('oldPasswordToggleBtn', 'oldPassword');
  setupPasswordToggle('newPasswordToggleBtn', 'newPassword');
  setupPasswordToggle('confirmPasswordToggleBtn', 'confirmPassword');

  // Change Password Form Submission
  if (changePasswordForm && changePasswordBtn) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const oldPassword = document.getElementById('oldPassword')?.value;
      const newPassword = document.getElementById('newPassword')?.value;
      const confirmPassword = document.getElementById('confirmPassword')?.value;
      const currentPhone = phInput?.value.trim() || cachedPhone || '';

      if (!oldPassword) {
        showToast('Please enter your current password.', true);
        document.getElementById('oldPassword')?.focus();
        return;
      }

      if (!newPassword) {
        showToast('Please enter a new password.', true);
        document.getElementById('newPassword')?.focus();
        return;
      }

      if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters long.', true);
        document.getElementById('newPassword')?.focus();
        return;
      }

      if (newPassword !== confirmPassword) {
        showToast('New password and confirm password do not match.', true);
        document.getElementById('confirmPassword')?.focus();
        return;
      }

      const originalHtml = changePasswordBtn.innerHTML;
      changePasswordBtn.disabled = true;
      changePasswordBtn.style.opacity = '0.85';
      changePasswordBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Updating...</span>
      `;

      try {
        const response = await fetch('../api/profile.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            action: 'change_password',
            oldPassword: oldPassword,
            newPassword: newPassword,
            confirmPassword: confirmPassword,
            phone: currentPhone
          })
        });

        const result = await response.json();

        changePasswordBtn.disabled = false;
        changePasswordBtn.style.opacity = '1';
        changePasswordBtn.innerHTML = originalHtml;

        if (response.ok && result.success) {
          changePasswordForm.reset();
          showToast(result.message || 'Password changed successfully!');
        } else {
          showToast(result.message || 'Failed to change password.', true);
        }
      } catch (err) {
        console.error('Password change network error:', err);
        changePasswordBtn.disabled = false;
        changePasswordBtn.style.opacity = '1';
        changePasswordBtn.innerHTML = originalHtml;
        showToast('Network error while changing password. Please try again.', true);
      }
    });
  }

  // Logout Modal Handlers
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
      try {
        await fetch('../api/logout.php', { method: 'POST' });
      } catch (err) {}
      try {
        localStorage.removeItem('ocayur_user'); localStorage.removeItem('panchved_user');
        localStorage.removeItem('ocayur_patient'); localStorage.removeItem('panchved_patient');
        localStorage.removeItem('ocayur_prakruti_result'); localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
      showToast('Logged out successfully.');
      setTimeout(() => {
        window.location.href = '../index.html';
      }, 350);
    });
  }

  // Real-time synchronization when updated from Checkout or other tabs
  window.addEventListener('storage', (e) => {
    if ((e.key === 'ocayur_user' || e.key === 'panchved_user') || (e.key === 'ocayur_patient' || e.key === 'panchved_patient')) {
      try {
        const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
        const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
        if (storedUser || storedPatient) {
          applyProfileData(storedUser, storedPatient);
        }
      } catch (err) {}
    }
  });

  // Re-sync on window focus / tab visibility
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try {
        const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
        const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
        if (storedUser || storedPatient) {
          applyProfileData(storedUser, storedPatient);
        }
      } catch (err) {}
      fetchProfileFromDatabase();
    }
  });
});
