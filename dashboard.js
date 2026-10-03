/**
 * Panchved Patient Portal - Dashboard Engine
 * Dynamic PHP & MySQL Database Backend Integration
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const addReadingBtn = document.getElementById('addReadingBtn');
  const readingModalOverlay = document.getElementById('readingModalOverlay');
  const closeReadingModalBtn = document.getElementById('closeReadingModalBtn');
  const cancelReadingBtn = document.getElementById('cancelReadingBtn');
  const readingForm = document.getElementById('readingForm');
  const viewDietBtn = document.getElementById('viewDietBtn');
  const dietModalOverlay = document.getElementById('dietModalOverlay');
  const closeDietModalBtn = document.getElementById('closeDietModalBtn');
  const dietPlanContent = document.getElementById('dietPlanContent');
  const dietPlanPara1 = document.getElementById('dietPlanPara1');
  const dietPlanPara2 = document.getElementById('dietPlanPara2');
  const logoutBtn = document.getElementById('logoutBtn');

  let cachedDietPlan = null;

  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

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

  // Update UI with authenticated patient details
  const applyDashboardPatient = (user, patient) => {
    const fullName = patient?.full_name || user?.full_name;
    const patientId = patient?.patient_id || ('P00' + (user?.id || 1));

    if (fullName) {
      const userGreeting = document.getElementById('userGreeting');
      if (userGreeting) userGreeting.textContent = `Good Morning ${fullName}!`;
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
    if (patient?.package_name) {
      const myPackageNameEl = document.querySelector('.my-package-card .package-name');
      if (myPackageNameEl) {
        myPackageNameEl.textContent = patient.package_name;
      }
    }
  };

  // Animated Counter on Metric Cards
  const animateDashboardMetrics = () => {
    document.querySelectorAll('.stat-card-value').forEach(el => {
      const target = parseInt(el.getAttribute('data-target') || el.textContent, 10);
      if (isNaN(target)) return;
      let startTimestamp = null;
      const duration = 650;
      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(easeProgress * target);
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          el.textContent = target;
        }
      };
      window.requestAnimationFrame(step);
    });
  };

  // Render Dynamic Notifications
  const renderNotifications = (notifications) => {
    const notifSection = document.querySelector('.notifications-card');
    if (!notifSection || !notifications || notifications.length === 0) return;

    const heading = notifSection.querySelector('h2');
    const headingHtml = heading ? heading.outerHTML : '<h2 id="notificationsHeading" class="section-card-title">Notifications</h2>';

    const itemsHtml = notifications.map(n => `
      <div class="notification-item">
        <div class="notification-icon-badge">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div class="notification-content">
          <h3 class="notification-title">${n.title || 'Appointment Scheduled'}</h3>
          <p class="notification-time">${n.datetime || 'Today'}</p>
        </div>
        <span class="notification-ago">${n.time_ago || 'Recent'}</span>
      </div>
    `).join('');

    notifSection.innerHTML = headingHtml + itemsHtml;
  };

  // Step 1: Populate from cached session immediately
  let cachedPhone = '';
  let cachedPatientId = '';
  try {
    const storedUser = JSON.parse(localStorage.getItem('panchved_user') || 'null');
    const storedPatient = JSON.parse(localStorage.getItem('panchved_patient') || 'null');
    if (storedUser || storedPatient) {
      applyDashboardPatient(storedUser, storedPatient);
      cachedPhone = storedPatient?.phone_number || storedUser?.phone_number || '';
      cachedPatientId = storedPatient?.patient_id || '';
    }
  } catch (err) {
    console.warn('Unable to load stored dashboard session', err);
  }

  // Step 2: Dynamically fetch fresh data from database via PHP (api/dashboard.php)
  const fetchDashboardData = async () => {
    try {
      const params = new URLSearchParams();
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);

      const queryUrl = 'api/dashboard.php' + (params.toString() ? `?${params.toString()}` : '');
      const res = await fetch(queryUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // 1. Patient & Header
          if (data.patient) {
            applyDashboardPatient(null, data.patient);
            try { localStorage.setItem('panchved_patient', JSON.stringify(data.patient)); } catch (e) {}
          }

          // 2. Metric Statistics Cards
          if (data.stats) {
            const consultCard = document.querySelector('#cardConsultations .stat-card-value');
            if (consultCard && data.stats.upcoming_consultations !== undefined) {
              consultCard.setAttribute('data-target', data.stats.upcoming_consultations);
              consultCard.textContent = data.stats.upcoming_consultations;
            }

            const pkgCard = document.querySelector('#cardPackages .stat-card-value');
            if (pkgCard && data.stats.active_packages !== undefined) {
              pkgCard.setAttribute('data-target', data.stats.active_packages);
              pkgCard.textContent = data.stats.active_packages;
            }

            const msgCard = document.querySelector('#cardMessages .stat-card-value');
            if (msgCard && data.stats.unread_messages !== undefined) {
              msgCard.setAttribute('data-target', data.stats.unread_messages);
              msgCard.textContent = data.stats.unread_messages;
            }

            animateDashboardMetrics();
          }

          // 3. My Package Section
          if (data.my_package) {
            const pkgNameEl = document.querySelector('.my-package-card .package-name');
            if (pkgNameEl && data.my_package.package_name) {
              pkgNameEl.textContent = data.my_package.package_name;
            }

            const startDateEl = document.querySelector('.my-package-card .package-start-date');
            if (startDateEl && data.my_package.start_date) {
              startDateEl.textContent = `Started on ${data.my_package.start_date}`;
            }

            const progressFillEl = document.querySelector('.my-package-card .package-progress-fill');
            if (progressFillEl && data.my_package.progress_percent) {
              progressFillEl.style.width = `${data.my_package.progress_percent}%`;
            }

            const progressTextEl = document.querySelector('.my-package-card .package-progress-percent');
            if (progressTextEl && data.my_package.progress_text) {
              progressTextEl.textContent = data.my_package.progress_text;
            }

            const weekInfoEl = document.querySelector('.my-package-card .package-week-info');
            if (weekInfoEl && data.my_package.week_info) {
              weekInfoEl.textContent = data.my_package.week_info;
            }

            if (data.diet_plan || data.my_package?.diet_plan) {
              cachedDietPlan = data.diet_plan || data.my_package?.diet_plan;
              populateDietUI(cachedDietPlan);
            }
          }

          // 4. Health Metrics
          if (data.metrics) {
            if (data.metrics.weight) {
              const weightVal = document.querySelector('#cardWeight .metric-value');
              if (weightVal) weightVal.textContent = data.metrics.weight;
            }
            if (data.metrics.abdomen) {
              const abdVal = document.querySelector('#cardAbdomen .metric-value');
              if (abdVal) abdVal.textContent = data.metrics.abdomen;
            }
            if (data.metrics.bp) {
              const bpVal = document.querySelector('#cardBP .metric-value');
              if (bpVal) bpVal.textContent = data.metrics.bp;
            }
            if (data.metrics.sugar) {
              const sugarVal = document.querySelector('#cardSugar .metric-value');
              if (sugarVal) sugarVal.textContent = data.metrics.sugar;
            }
          }

          // 5. Notifications
          if (data.notifications && Array.isArray(data.notifications)) {
            renderNotifications(data.notifications);
          }
        }
      }
    } catch (e) {
      console.warn('Dashboard profile dynamic fetch notice:', e);
    }
  };

  fetchDashboardData();
  animateDashboardMetrics();

  // Modal Dialog Handlers for Add New Reading
  const openReadingModal = () => {
    if (readingModalOverlay) {
      readingModalOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      document.getElementById('readingWeight')?.focus();
    }
  };

  const closeReadingModal = () => {
    if (readingModalOverlay) {
      readingModalOverlay.style.display = 'none';
      document.body.style.overflow = '';
      if (readingForm) readingForm.reset();
    }
  };

  if (addReadingBtn) {
    addReadingBtn.addEventListener('click', openReadingModal);
  }

  if (closeReadingModalBtn) {
    closeReadingModalBtn.addEventListener('click', closeReadingModal);
  }

  if (cancelReadingBtn) {
    cancelReadingBtn.addEventListener('click', closeReadingModal);
  }

  if (readingModalOverlay) {
    readingModalOverlay.addEventListener('click', (e) => {
      if (e.target === readingModalOverlay) {
        closeReadingModal();
      }
    });
  }

  // Clickable Calendar Icon triggers Date Picker
  const btnOpenDatePicker = document.getElementById('btnOpenDatePicker');
  const readingDateInput = document.getElementById('readingDate');
  if (btnOpenDatePicker && readingDateInput) {
    btnOpenDatePicker.addEventListener('click', (e) => {
      e.preventDefault();
      readingDateInput.type = 'date';
      readingDateInput.focus();
      try {
        if (typeof readingDateInput.showPicker === 'function') {
          readingDateInput.showPicker();
        }
      } catch (err) {}
    });
  }

  // Handle Reading Form Submission & Save to MySQL Database
  if (readingForm) {
    readingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const dateInput = document.getElementById('readingDate')?.value.trim();
      const weightInput = document.getElementById('readingWeight')?.value.trim();
      const abdomenInput = document.getElementById('readingAbdomen')?.value.trim();
      const bpInput = document.getElementById('readingBP')?.value.trim();
      const sugarInput = document.getElementById('readingSugar')?.value.trim();

      if (!weightInput && !abdomenInput && !bpInput && !sugarInput) {
        showToast('Please enter at least one health parameter.', true);
        return;
      }

      const updateBtn = readingForm.querySelector('button[type="submit"]');
      const origBtnText = updateBtn ? updateBtn.innerHTML : 'Update';
      if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Updating...';
      }

      try {
        const payload = {
          action: 'add_reading',
          phone: cachedPhone || '9876543210',
          patient_id: cachedPatientId || 'P001',
          date: dateInput || null,
          weight: weightInput || null,
          abdomen: abdomenInput || null,
          bp: bpInput || null,
          sugar: sugarInput || null
        };

        const res = await fetch('api/dashboard.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData.success) {
            if (resData.weight) {
              const weightVal = document.querySelector('#cardWeight .metric-value');
              if (weightVal) weightVal.textContent = resData.weight;
            }
            if (resData.abdomen) {
              const abdVal = document.querySelector('#cardAbdomen .metric-value');
              if (abdVal) abdVal.textContent = resData.abdomen;
            }
            if (resData.bp) {
              const bpVal = document.querySelector('#cardBP .metric-value');
              if (bpVal) bpVal.textContent = resData.bp;
            }
            if (resData.sugar) {
              const sugarVal = document.querySelector('#cardSugar .metric-value');
              if (sugarVal) sugarVal.textContent = resData.sugar;
            }
            showToast('Health reading recorded successfully!');
          } else {
            showToast(resData.message || 'Failed to record health reading.', true);
          }
        }
      } catch (err) {
        console.warn('Health reading save error:', err);
        showToast('Error recording health reading. Please try again.', true);
      } finally {
        if (updateBtn) {
          updateBtn.disabled = false;
          updateBtn.innerHTML = origBtnText;
        }
      }

      // Optimistic update
      if (weightInput) {
        const cleanW = weightInput.replace(/[^\d.]/g, '');
        const weightVal = document.querySelector('#cardWeight .metric-value');
        if (weightVal && cleanW) weightVal.textContent = `${cleanW} kgs`;
      }
      if (abdomenInput) {
        const cleanA = abdomenInput.replace(/[^\d.]/g, '');
        const abdVal = document.querySelector('#cardAbdomen .metric-value');
        if (abdVal && cleanA) abdVal.textContent = `${cleanA} cm`;
      }
      if (bpInput) {
        const bpVal = document.querySelector('#cardBP .metric-value');
        if (bpVal) bpVal.textContent = bpInput.includes('mm') ? bpInput : `${bpInput} mm Hg`;
      }
      if (sugarInput) {
        const cleanS = sugarInput.replace(/[^\d.]/g, '');
        const sugarVal = document.querySelector('#cardSugar .metric-value');
        if (sugarVal && cleanS) sugarVal.textContent = `${cleanS} mg/dL`;
      }

      closeReadingModal();
    });
  }

  // Timeframe Dropdown Select Filter Handlers
  document.querySelectorAll('.metric-filter-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const parentCard = select.closest('.health-metric-card');
      const label = parentCard?.querySelector('.metric-label')?.textContent || 'Metric';
      showToast(`Updated ${label} timeframe to: ${e.target.options[e.target.selectedIndex].text}`);
    });
  });

  // Dynamic Diet Plan UI Population
  const populateDietUI = (dietData) => {
    if (!dietData) return;
    const p1 = dietData.paragraph_1 || (Array.isArray(dietData.paragraphs) ? dietData.paragraphs[0] : '') || dietData.diet_hydration || '';
    const p2 = dietData.paragraph_2 || (Array.isArray(dietData.paragraphs) ? dietData.paragraphs[1] : '') || dietData.dinacharya || '';

    if (dietPlanPara1) {
      dietPlanPara1.textContent = p1 || 'Personalized dietary recommendations, food preferences, and daily water intake guidelines based on the patient\'s assessment. Restores digestive fire (Agni) and strengthens gastrointestinal lining with bespoke herbal protocols.';
    }
    if (dietPlanPara2) {
      dietPlanPara2.textContent = p2 || 'A customized daily wellness schedule comprising diet, hydration, physical activity, and Ayurvedic practices as per the doctor\'s protocol. Relieves bloating, improves digestion, boosts vitality and enhances nutrient absorption.';
    }
  };

  // Open & Close View Diet Modal (Screen shown in Reference Image)
  const openDietModal = async () => {
    if (!dietModalOverlay) return;

    // 1. If cached diet data is available, populate immediately
    if (cachedDietPlan) {
      populateDietUI(cachedDietPlan);
    }

    // 2. Open Modal overlay
    dietModalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 3. Dynamic Fetch directly from database backend
    try {
      const params = new URLSearchParams();
      params.append('action', 'view_diet');
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);

      const res = await fetch(`api/dashboard.php?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.diet_plan) {
          cachedDietPlan = data.diet_plan;
          populateDietUI(data.diet_plan);
        }
      }
    } catch (err) {
      console.warn('Notice: Error fetching dynamic diet plan from database:', err);
    }
  };

  const closeDietModal = () => {
    if (dietModalOverlay) {
      dietModalOverlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  };

  // View Diet Action - Opens Reference Modal
  if (viewDietBtn) {
    viewDietBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openDietModal();
    });
  }

  if (closeDietModalBtn) {
    closeDietModalBtn.addEventListener('click', closeDietModal);
  }

  if (dietModalOverlay) {
    dietModalOverlay.addEventListener('click', (e) => {
      if (e.target === dietModalOverlay) {
        closeDietModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (dietModalOverlay && dietModalOverlay.style.display === 'flex') {
        closeDietModal();
      }
      if (readingModalOverlay && readingModalOverlay.style.display === 'flex') {
        closeReadingModal();
      }
    }
  });

  // Logout Action
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
