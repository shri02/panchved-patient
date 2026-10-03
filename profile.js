/**
 * Panchved Patient Portal - Dynamic Profile Settings Engine
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
  const phInput = document.getElementById('profilePhone');
  const gInput = document.getElementById('profileGender');
  const emInput = document.getElementById('profileEmail');

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
    }
    if (gender && gInput) {
      gInput.value = gender;
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
    const storedUser = JSON.parse(localStorage.getItem('panchved_user') || 'null');
    const storedPatient = JSON.parse(localStorage.getItem('panchved_patient') || 'null');
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

      const queryUrl = 'api/profile.php' + (params.toString() ? `?${params.toString()}` : '');

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
          try { localStorage.setItem('panchved_user', JSON.stringify(result.user)); } catch (e) {}
        }
        if (result.patient) {
          try { localStorage.setItem('panchved_patient', JSON.stringify(result.patient)); } catch (e) {}
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
        const response = await fetch('api/profile.php', {
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
            gender: gender
          })
        });

        const result = await response.json();

        updateBtn.disabled = false;
        updateBtn.style.opacity = '1';
        updateBtn.innerHTML = originalHtml;

        if (response.ok && result.success) {
          if (result.user) {
            try { localStorage.setItem('panchved_user', JSON.stringify(result.user)); } catch (e) {}
          }
          if (result.patient) {
            try { localStorage.setItem('panchved_patient', JSON.stringify(result.patient)); } catch (e) {}
          }

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
        const response = await fetch('api/profile.php', {
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

  // Logout Handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('api/logout.php', { method: 'POST' });
      } catch (err) {}
      try {
        localStorage.removeItem('panchved_user');
        localStorage.removeItem('panchved_patient');
        localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
      showToast('Logged out successfully.');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 350);
    });
  }
});
